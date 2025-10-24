import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr';
import type { Database } from '~/types/database';

/**
 * Create Supabase server client for server-side operations (Remix loaders/actions)
 * This client respects Row Level Security (RLS) policies and uses cookies for session management
 */
export function getSupabaseServerClient(request: Request) {
  const headers = new Headers();

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables on server');
  }

  const supabase = createServerClient<Database>(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          const cookies = parseCookieHeader(request.headers.get('Cookie') ?? '');
          return cookies.map((cookie) => ({
            name: cookie.name,
            value: cookie.value ?? '',
          }));
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            headers.append('Set-Cookie', serializeCookieHeader(name, value, options));
          });
        },
      },
    },
  );

  return { supabase, headers };
}

/**
 * Create Supabase service client for server-side admin operations
 * This client bypasses Row Level Security (RLS) policies - use with caution!
 */
export function getSupabaseServiceClient() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase service role key');
  }

  const supabase = createServerClient<Database>(
    supabaseUrl,
    supabaseServiceKey,
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {
          // Service client doesn't need cookies
        },
      },
    },
  );

  return supabase;
}
