import type { LoaderFunctionArgs } from '@remix-run/cloudflare';
import { json } from '@remix-run/cloudflare';
import { getAuth } from '@clerk/remix/ssr.server';
import { getSupabaseServiceClient } from '~/lib/supabase/server';

/**
 * GET /api/projects/:projectId/load
 * Load complete project state: messages, files, and workbench state
 * This is used for project resume/restore functionality
 */
export async function loader(args: LoaderFunctionArgs) {
  const { userId } = await getAuth(args);
  const { projectId } = args.params;

  if (!userId || !projectId) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = getSupabaseServiceClient();

    // Verify user owns this project. Support both UUID id and url_id.
    let project: any | null = null;
    let projectError: any | null = null;

    // Try by primary id first
    const { data: byId, error: byIdError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('clerk_user_id', userId)
      .single();

    if (byId && !byIdError) {
      project = byId;
    } else {
      // Fallback to url_id match
      const { data: byUrlId, error: byUrlIdError } = await supabase
        .from('projects')
        .select('*')
        .eq('url_id', projectId)
        .eq('clerk_user_id', userId)
        .single();

      project = byUrlId;
      projectError = byUrlIdError;
    }

    if (!project) {
      console.error('Project not found or access denied:', projectError || byIdError);
      return json({ error: 'Project not found' }, { status: 404 });
    }

    // Load messages
    const { data: messages, error: messagesError } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('project_id', project.id)
      .order('created_at', { ascending: true });

    if (messagesError) {
      console.error('Error loading messages:', messagesError);
    }

    // Load files
    const { data: files, error: filesError } = await supabase
      .from('project_files')
      .select('*')
      .eq('project_id', project.id)
      .order('file_path', { ascending: true });

    if (filesError) {
      console.error('Error loading files:', filesError);
    }

    // Load workbench state
    const { data: workbench, error: workbenchError } = await supabase
      .from('workbench_states')
      .select('*')
      .eq('project_id', project.id)
      .single();

    if (workbenchError && workbenchError.code !== 'PGRST116') {
      // PGRST116 = no rows (not an error)
      console.error('Error loading workbench state:', workbenchError);
    }

    // Transform messages to the format expected by the frontend
    const transformedMessages = (messages || []).map((msg) => ({
      id: msg.message_id,
      role: msg.role,
      content: msg.content,
      parts: msg.parts,
      toolInvocations: msg.tool_calls,
      annotations: msg.annotations,
    }));

    // Transform files to FileMap format
    const fileMap: Record<string, any> = {};

    (files || []).forEach((file) => {
      fileMap[file.file_path] = {
        type: 'file',
        content: file.content || '',
        isBinary: file.file_type === 'binary',
      };
    });

    console.log(`📥 Loaded project ${project.id}:`);
    console.log(`   - Messages: ${transformedMessages.length}`);
    console.log(`   - Files: ${Object.keys(fileMap).length}`);
    console.log(`   - Workbench: ${workbench ? 'Yes' : 'No'}`);

    return json({
      project,
      messages: transformedMessages,
      files: fileMap,
      workbench: workbench || null,
    });
  } catch (error) {
    console.error('Error loading project:', error);

    return json({ error: 'Internal server error' }, { status: 500 });
  }
}
