import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/cloudflare';
import { json } from '@remix-run/cloudflare';
import { getAuth } from '@clerk/remix/ssr.server';
import { getSupabaseServiceClient } from '~/lib/supabase/server';

/**
 * GET: Load workbench state from Supabase
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

    // Get workbench state
    const { data: workbenchState, error } = await supabase
      .from('workbench_states')
      .select('*')
      .eq('project_id', projectId)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows returned (not an error)
      console.error('Error loading workbench state:', error);

      return json({ error: error.message }, { status: 500 });
    }

    return json({ workbench: workbenchState || null });
  } catch (error) {
    console.error('Error in workbench loader:', error);

    return json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST: Save workbench state to Supabase
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
      selected_file?: string | null;
      open_files?: string[];
      current_view?: 'code' | 'diff' | 'preview' | null;
      show_workbench?: boolean;
      terminal_history?: string[];
      preview_urls?: string[];
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

    // Upsert workbench state
    const { data, error } = await supabase
      .from('workbench_states')
      .upsert(
        {
          project_id: projectId,
          selected_file: body.selected_file || null,
          open_files: body.open_files || [],
          current_view: body.current_view || 'code',
          show_workbench: body.show_workbench ?? true,
          terminal_history: body.terminal_history || [],
          preview_urls: body.preview_urls || [],
        },
        {
          onConflict: 'project_id',
        },
      )
      .select()
      .single();

    if (error) {
      console.error('Error saving workbench state:', error);

      return json({ error: error.message }, { status: 500 });
    }

    console.log(`✅ Saved workbench state for project ${projectId}`);

    return json({ workbench: data });
  } catch (error) {
    console.error('Error in workbench action:', error);

    return json({ error: 'Internal server error' }, { status: 500 });
  }
}
