-- ========================================================
-- WORKBENCH STATES TABLE
-- ========================================================
-- This table stores the workbench state (editor, terminal, preview)
-- for each project. Each project has only ONE workbench state.
-- When a project is deleted, its workbench state is deleted (CASCADE).
-- ========================================================

-- Workbench state table - stores editor/terminal/preview state
CREATE TABLE IF NOT EXISTS workbench_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Editor state
  selected_file TEXT,
  open_files JSONB DEFAULT '[]',

  -- View state
  current_view TEXT CHECK (current_view IN ('code', 'diff', 'preview')),
  show_workbench BOOLEAN DEFAULT FALSE,

  -- Terminal state
  terminal_history JSONB DEFAULT '[]',

  -- Preview state
  preview_urls JSONB DEFAULT '[]',

  -- Timestamps
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Only one state per project
  CONSTRAINT unique_state_per_project UNIQUE (project_id)
);

-- RLS Policies
ALTER TABLE workbench_states ENABLE ROW LEVEL SECURITY;

-- Service role access (for backend operations)
CREATE POLICY "Service role has full access to workbench"
  ON workbench_states
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Users can manage workbench state in their own projects
CREATE POLICY "Users can manage workbench in own projects"
  ON workbench_states FOR ALL
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
