import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '~/types/database';

let supabaseClient: ReturnType<typeof createBrowserClient<Database>> | null = null;

/**
 * Get or create Supabase browser client for client-side operations
 * This client respects Row Level Security (RLS) policies
 */
export function getSupabaseClient() {
  if (typeof window === 'undefined') {
    throw new Error('getSupabaseClient can only be called from the browser');
  }

  if (supabaseClient) {
    return supabaseClient;
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables. Please check your .env file.');
  }

  supabaseClient = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);

  return supabaseClient;
}

/**
 * Reset the Supabase client (useful for testing or re-authentication)
 */
export function resetSupabaseClient() {
  supabaseClient = null;
}
