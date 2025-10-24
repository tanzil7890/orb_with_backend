import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/cloudflare';
import { json } from '@remix-run/cloudflare';
import { getAuth } from '@clerk/remix/ssr.server';
import { getSupabaseServerClient, getSupabaseServiceClient } from '~/lib/supabase/server';

/**
 * Get user profile from database
 */
export async function loader(args: LoaderFunctionArgs) {
  const { userId } = await getAuth(args);

  if (!userId) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { supabase, headers } = getSupabaseServerClient(args.request);

    // Fetch user profile
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('clerk_user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows found
      console.error('Error fetching user profile:', error);
      return json({ error: error.message }, { status: 500, headers });
    }

    return json({ profile }, { headers });
  } catch (error) {
    console.error('Error in user-profile loader:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Create or update user profile when user logs in
 * POST /api/user-profile
 * Body: { email, firstName, lastName, imageUrl }
 */
export async function action(args: ActionFunctionArgs) {
  const { userId } = await getAuth(args);

  if (!userId) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Use service client to bypass RLS for server-side user profile management
    // This is safe because we've already authenticated the user via Clerk
    const supabase = getSupabaseServiceClient();
    const body = (await args.request.json()) as {
      email?: string;
      firstName?: string;
      lastName?: string;
      imageUrl?: string;
    };

    // Create or update user profile
    const { data: profile, error } = await (supabase
      .from('user_profiles') as any)
      .upsert(
        {
          clerk_user_id: userId,
          email: body.email || null,
          first_name: body.firstName || null,
          last_name: body.lastName || null,
          image_url: body.imageUrl || null,
          last_login_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'clerk_user_id',
        },
      )
      .select()
      .single();

    if (error) {
      console.error('Error syncing user profile:', error);
      return json({ error: error.message }, { status: 500 });
    }

    console.log('✅ User profile synced to database:', userId);

    return json({
      success: true,
      profile,
    });
  } catch (error) {
    console.error('Error in user-profile action:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}
