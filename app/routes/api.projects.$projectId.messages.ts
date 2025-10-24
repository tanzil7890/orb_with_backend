import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/cloudflare';
import { json } from '@remix-run/cloudflare';
import { getAuth } from '@clerk/remix/ssr.server';
import { getSupabaseServiceClient } from '~/lib/supabase/server';

/**
 * GET /api/projects/:projectId/messages
 * Returns all messages for a project
 */
export async function loader(args: LoaderFunctionArgs) {
  const { userId } = await getAuth(args);
  const { projectId } = args.params;

  if (!userId || !projectId) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = getSupabaseServiceClient();

    // Verify user owns this project
    const { data: project } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('clerk_user_id', userId)
      .single();

    if (!project) {
      return json({ error: 'Project not found' }, { status: 404 });
    }

    // Get messages
    const { data: messages, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching messages:', error);
      return json({ error: error.message }, { status: 500 });
    }

    console.log(`✅ Fetched ${messages.length} messages for project ${projectId}`);
    return json({ messages });
  } catch (error) {
    console.error('Error in messages loader:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/projects/:projectId/messages
 * Saves messages to Supabase
 */
export async function action(args: ActionFunctionArgs) {
  const { userId } = await getAuth(args);
  const { projectId } = args.params;

  if (!userId || !projectId) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = getSupabaseServiceClient();
    const body = (await args.request.json()) as {
      messages: Array<{
        id: string;
        role: string;
        content: string;
        parts?: any;
        toolCalls?: any;
        annotations?: any;
      }>;
    };

    // Verify user owns this project
    const { data: project } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('clerk_user_id', userId)
      .single();

    if (!project) {
      return json({ error: 'Project not found' }, { status: 404 });
    }

    // Prepare messages for insertion
    const messagesToSave = body.messages.map((msg) => ({
      project_id: projectId,
      message_id: msg.id,
      role: msg.role,
      content: msg.content,
      parts: msg.parts || null,
      tool_calls: msg.toolCalls || null,
      annotations: msg.annotations || null,
    }));

    // Upsert messages (insert or update if exists)
    const { data, error } = await supabase
      .from('chat_messages')
      .upsert(messagesToSave, {
        onConflict: 'project_id,message_id',
      })
      .select();

    if (error) {
      console.error('Error saving messages:', error);
      return json({ error: error.message }, { status: 500 });
    }

    console.log(`✅ Saved ${data.length} messages to project ${projectId}`);
    return json({ messages: data, count: data.length });
  } catch (error) {
    console.error('Error in messages action:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}
