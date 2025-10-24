-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- USER PROFILES TABLE (Login Storage Only)
-- =====================================================
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clerk_user_id TEXT UNIQUE NOT NULL,
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  image_url TEXT,
  last_login_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Service Role (backend operations)
-- Service role can do everything (bypasses RLS by default, but adding explicit policy for clarity)
CREATE POLICY "Service role has full access"
  ON user_profiles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- RLS Policies - Users can only see/update their own profile (when using JWT)
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

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for updated_at
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
