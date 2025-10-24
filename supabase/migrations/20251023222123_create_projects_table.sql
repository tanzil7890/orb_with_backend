-- ========================================================
-- PROJECTS TABLE
-- ========================================================
-- This table stores user projects with their metadata.
-- Each project belongs to a user and contains chat messages,
-- files, and workbench state.
-- ========================================================

-- Projects table - stores user projects
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id TEXT NOT NULL REFERENCES user_profiles(clerk_user_id) ON DELETE CASCADE,
  url_id TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL DEFAULT 'Untitled Project',
  description TEXT,

  -- Metadata
  git_url TEXT,
  git_branch TEXT,
  netlify_site_id TEXT,

  -- Timestamps
  last_opened_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_projects_user ON projects(clerk_user_id);
CREATE INDEX idx_projects_url_id ON projects(url_id);
CREATE INDEX idx_projects_last_opened ON projects(clerk_user_id, last_opened_at DESC);

-- RLS Policies
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Service role has full access (for backend operations)
CREATE POLICY "Service role has full access to projects"
  ON projects
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Users can manage their own projects
CREATE POLICY "Users can view own projects"
  ON projects FOR SELECT
  TO authenticated, anon
  USING (clerk_user_id = COALESCE(
    current_setting('request.jwt.claims', true)::json->>'sub',
    auth.jwt()->>'sub'
  ));

CREATE POLICY "Users can insert own projects"
  ON projects FOR INSERT
  TO authenticated, anon
  WITH CHECK (clerk_user_id = COALESCE(
    current_setting('request.jwt.claims', true)::json->>'sub',
    auth.jwt()->>'sub'
  ));

CREATE POLICY "Users can update own projects"
  ON projects FOR UPDATE
  TO authenticated, anon
  USING (clerk_user_id = COALESCE(
    current_setting('request.jwt.claims', true)::json->>'sub',
    auth.jwt()->>'sub'
  ));

CREATE POLICY "Users can delete own projects"
  ON projects FOR DELETE
  TO authenticated, anon
  USING (clerk_user_id = COALESCE(
    current_setting('request.jwt.claims', true)::json->>'sub',
    auth.jwt()->>'sub'
  ));

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_projects_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_projects_updated_at_trigger
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_projects_updated_at();
