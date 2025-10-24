import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/cloudflare';
import { json } from '@remix-run/cloudflare';
import { getAuth } from '@clerk/remix/ssr.server';
import { getSupabaseServiceClient } from '~/lib/supabase/server';

/**
 * GET /api/projects/:projectId/files
 * Returns all files for a project
 */
export async function loader(args: LoaderFunctionArgs) {
  const { userId } = await getAuth(args);
  const { projectId } = args.params;

  if (!userId || !projectId) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = getSupabaseServiceClient();

    // Verify ownership
    const { data: project } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('clerk_user_id', userId)
      .single();

    if (!project) {
      return json({ error: 'Project not found' }, { status: 404 });
    }

    // Get files
    const { data: files, error } = await supabase
      .from('project_files')
      .select('*')
      .eq('project_id', projectId);

    if (error) {
      console.error('Error fetching files:', error);
      return json({ error: error.message }, { status: 500 });
    }

    console.log(`✅ Fetched ${files.length} files for project ${projectId}`);
    return json({ files });
  } catch (error) {
    console.error('Error in files loader:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/projects/:projectId/files
 * Saves files to Supabase
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
      files: Record<
        string,
        {
          type: string;
          content?: string;
          isBinary?: boolean;
        }
      >;
    };

    // Verify ownership
    const { data: project } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('clerk_user_id', userId)
      .single();

    if (!project) {
      return json({ error: 'Project not found' }, { status: 404 });
    }

    // Prepare files for upsert (only save actual files, not directories)
    const filesToUpsert = Object.entries(body.files)
      .filter(([_, fileData]) => fileData.type === 'file')
      .map(([path, fileData]) => ({
        project_id: projectId,
        file_path: path,
        content: !fileData.isBinary ? fileData.content : null,
        file_type: (fileData.isBinary ? 'binary' : 'text') as 'text' | 'binary',
        size_bytes: fileData.content ? fileData.content.length : 0,
      }));

    if (filesToUpsert.length === 0) {
      return json({ message: 'No files to save', count: 0 });
    }

    // Upsert files
    const { data, error } = await supabase
      .from('project_files')
      .upsert(filesToUpsert, {
        onConflict: 'project_id,file_path',
      })
      .select();

    if (error) {
      console.error('Error saving files:', error);
      return json({ error: error.message }, { status: 500 });
    }

    console.log(`✅ Saved ${data.length} files to project ${projectId}`);
    return json({ files: data, count: data.length });
  } catch (error) {
    console.error('Error in files action:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}
