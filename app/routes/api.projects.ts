import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/cloudflare';
import { json } from '@remix-run/cloudflare';
import { getAuth } from '@clerk/remix/ssr.server';
import { getSupabaseServiceClient } from '~/lib/supabase/server';

/**
 * GET /api/projects
 * Returns all projects for the authenticated user
 */
export async function loader(args: LoaderFunctionArgs) {
  const { userId } = await getAuth(args);

  if (!userId) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = getSupabaseServiceClient();

    const { data: projects, error } = await supabase
      .from('projects')
      .select('*')
      .eq('clerk_user_id', userId)
      .order('last_opened_at', { ascending: false });

    if (error) {
      console.error('Error fetching projects:', error);
      return json({ error: error.message }, { status: 500 });
    }

    console.log(`✅ Fetched ${projects.length} projects for user ${userId}`);
    return json({ projects });
  } catch (error) {
    console.error('Error in projects loader:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/projects
 * Creates a new project or updates existing one
 */
export async function action(args: ActionFunctionArgs) {
  const { userId } = await getAuth(args);

  if (!userId) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = getSupabaseServiceClient();
    const body = (await args.request.json()) as {
      intent: 'create' | 'update' | 'delete';
      url_id?: string;
      title?: string;
      description?: string;
      project_id?: string;
      metadata?: {
        git_url?: string;
        git_branch?: string;
        netlify_site_id?: string;
      };
    };

    console.log(`📝 Project API - Intent: ${body.intent}`);

    switch (body.intent) {
      case 'create': {
        if (!body.url_id) {
          return json({ error: 'url_id is required' }, { status: 400 });
        }

        // Check if project with this url_id already exists
        const { data: existing } = await supabase
          .from('projects')
          .select('id, title, description')
          .eq('url_id', body.url_id)
          .eq('clerk_user_id', userId)
          .single();

        if (existing) {
          // Update last_opened_at
          const { data, error } = await supabase
            .from('projects')
            .update({ last_opened_at: new Date().toISOString() })
            .eq('id', existing.id)
            .select()
            .single();

          if (error) {
            console.error('Error updating project last_opened_at:', error);
            return json({ error: error.message }, { status: 500 });
          }

          console.log(`✅ Project already exists, updated last_opened_at: ${existing.id}`);
          return json({ project: data, existed: true });
        }

        // Create new project
        const { data, error } = await supabase
          .from('projects')
          .insert({
            clerk_user_id: userId,
            url_id: body.url_id,
            title: body.title || 'Untitled Project',
            description: body.description,
            ...body.metadata,
          })
          .select()
          .single();

        if (error) {
          console.error('Error creating project:', error);
          return json({ error: error.message }, { status: 500 });
        }

        console.log(`✅ Project created: ${data.id} (${data.title})`);
        return json({ project: data, existed: false });
      }

      case 'update': {
        if (!body.project_id) {
          return json({ error: 'project_id is required' }, { status: 400 });
        }

        const updateData: any = {
          last_opened_at: new Date().toISOString(),
        };

        if (body.title) updateData.title = body.title;
        if (body.description !== undefined) updateData.description = body.description;
        if (body.metadata) {
          if (body.metadata.git_url) updateData.git_url = body.metadata.git_url;
          if (body.metadata.git_branch) updateData.git_branch = body.metadata.git_branch;
          if (body.metadata.netlify_site_id) updateData.netlify_site_id = body.metadata.netlify_site_id;
        }

        const { data, error } = await supabase
          .from('projects')
          .update(updateData)
          .eq('id', body.project_id)
          .eq('clerk_user_id', userId)
          .select()
          .single();

        if (error) {
          console.error('Error updating project:', error);
          return json({ error: error.message }, { status: 500 });
        }

        console.log(`✅ Project updated: ${data.id}`);
        return json({ project: data });
      }

      case 'delete': {
        if (!body.project_id) {
          return json({ error: 'project_id is required' }, { status: 400 });
        }

        const { error } = await supabase
          .from('projects')
          .delete()
          .eq('id', body.project_id)
          .eq('clerk_user_id', userId);

        if (error) {
          console.error('Error deleting project:', error);
          return json({ error: error.message }, { status: 500 });
        }

        console.log(`✅ Project deleted: ${body.project_id}`);
        return json({ success: true });
      }

      default:
        return json({ error: 'Invalid intent' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error in projects action:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}
