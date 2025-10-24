-- ========================================================
-- FIX RLS POLICIES FOR EXISTING SUPABASE DATABASE
-- ========================================================
-- This script fixes the Row Level Security policies for the user_profiles table
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/YOUR_PROJECT/sql
--
-- What this does:
-- 1. Drops old restrictive RLS policies
-- 2. Creates new policies that allow service role access
-- 3. Maintains security for client-side operations
-- ========================================================

-- Step 1: Drop all existing policies on user_profiles table
DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Service role has full access" ON user_profiles;

-- Step 2: Create new RLS policy for Service Role (backend operations)
-- This allows your backend to insert/update user profiles using the service role key
CREATE POLICY "Service role has full access"
  ON user_profiles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Step 3: Create RLS policies for authenticated users (optional - for future client-side access)
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

-- Step 4: Verify the policies were created
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'user_profiles'
ORDER BY policyname;

-- You should see 4 policies:
-- 1. Service role has full access (service_role)
-- 2. Users can view own profile (authenticated, anon)
-- 3. Users can insert own profile (authenticated, anon)
-- 4. Users can update own profile (authenticated, anon)
