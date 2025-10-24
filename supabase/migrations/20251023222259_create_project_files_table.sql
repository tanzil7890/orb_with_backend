-- ========================================================
-- PROJECT FILES TABLE
-- ========================================================
-- This table stores all file contents for each project.
-- Files belong to a project and are linked via foreign key.
-- When a project is deleted, all its files are deleted (CASCADE).
-- ========================================================

-- Project files table - stores file contents
CREATE TABLE IF NOT EXISTS project_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  content TEXT,
  file_type TEXT CHECK (file_type IN ('text', 'binary')) DEFAULT 'text',

  -- File metadata
  mime_type TEXT,
  size_bytes BIGINT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure unique file paths per project
  CONSTRAINT unique_file_per_project UNIQUE (project_id, file_path)
);

-- Indexes for performance
CREATE INDEX idx_files_project ON project_files(project_id);
CREATE INDEX idx_files_path ON project_files(project_id, file_path);

-- RLS Policies
ALTER TABLE project_files ENABLE ROW LEVEL SECURITY;

-- Service role access (for backend operations)
CREATE POLICY "Service role has full access to files"
  ON project_files
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Users can manage files in their own projects
CREATE POLICY "Users can manage files in own projects"
  ON project_files FOR ALL
  TO authenticated, anon
  USING (
    project_id IN (
      SELECT id FROM projects
      WHERE clerk_user_id = COALESCE(
        current_setting('request.jwt.claims', true)::json->>'sub',
        auth.jwt()->>'sub'
      )
    )
  );

-- Auto-update updated_at timestamp
CREATE TRIGGER update_files_updated_at_trigger
  BEFORE UPDATE ON project_files
  FOR EACH ROW
  EXECUTE FUNCTION update_projects_updated_at();
