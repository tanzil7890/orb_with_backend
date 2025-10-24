-- ========================================================
-- FIX RLS POLICIES FOR user_profiles TABLE
-- ========================================================
-- This migration fixes the Row Level Security policies that were
-- preventing backend operations from creating/updating user profiles.
--
-- Changes:
-- 1. Drop old restrictive RLS policies
-- 2. Add service_role policy (allows backend operations)
-- 3. Add improved user policies with better JWT claim handling
-- ========================================================

-- Drop all existing policies on user_profiles table
DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Service role has full access" ON user_profiles;

-- Create RLS policy for Service Role (backend operations)
-- This allows backend to insert/update user profiles using the service role key
CREATE POLICY "Service role has full access"
  ON user_profiles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create RLS policies for authenticated users
-- These policies allow users to see/update their own profile when using JWT authentication
CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  TO authenticated, anon
  USING (
    clerk_user_id = COALESCE(
      current_setting('request.jwt.claims', true)::json->>'sub',
      auth.jwt()->>'sub'
    )
  );

CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT
  TO authenticated, anon
  WITH CHECK (
    clerk_user_id = COALESCE(
      current_setting('request.jwt.claims', true)::json->>'sub',
      auth.jwt()->>'sub'
    )
  );

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  TO authenticated, anon
  USING (
    clerk_user_id = COALESCE(
      current_setting('request.jwt.claims', true)::json->>'sub',
      auth.jwt()->>'sub'
    )
  );
