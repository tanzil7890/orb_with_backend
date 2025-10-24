import { useAuth } from '@clerk/remix';
import { getSupabaseClient } from '~/lib/supabase/client';

/**
 * Custom hook to integrate Clerk authentication with Supabase
 * This hook provides an authenticated Supabase client that respects Clerk's user session
 */
export function useClerkSupabase() {
  const { getToken, userId, isLoaded, isSignedIn } = useAuth();

  /**
   * Get an authenticated Supabase client with Clerk token
   * This client will have access to user-specific data via RLS policies
   */
  async function getAuthenticatedClient() {
    if (!userId) {
      throw new Error('User not authenticated. Please sign in first.');
    }

    // Get Supabase access token from Clerk
    // This uses a custom JWT template configured in Clerk Dashboard
    const supabaseAccessToken = await getToken({ template: 'supabase' });

    if (!supabaseAccessToken) {
      throw new Error('Failed to get Supabase access token from Clerk');
    }

    const supabase = getSupabaseClient();

    // Set the auth token for this session
    await supabase.auth.setSession({
      access_token: supabaseAccessToken,
      refresh_token: '', // Clerk manages refresh, so we don't need this
    });

    return { supabase, userId };
  }

  return {
    getAuthenticatedClient,
    userId,
    isLoaded,
    isSignedIn
  };
}

/**
 * Server-side helper to get Clerk user ID from request
 * Used in Remix loaders and actions
 */
export async function getClerkUserId(request: Request): Promise<string | null> {
  try {
    const { getAuth } = await import('@clerk/remix/ssr.server');
    const auth = await getAuth({ request } as any);
    return auth.userId;
  } catch (error) {
    console.error('Error getting Clerk user ID:', error);
    return null;
  }
}
