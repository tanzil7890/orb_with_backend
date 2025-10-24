-- ========================================================
-- CHAT MESSAGES TABLE
-- ========================================================
-- This table stores all chat messages for each project.
-- Messages belong to a project and are linked via foreign key.
-- When a project is deleted, all its messages are deleted (CASCADE).
-- ========================================================

-- Chat messages table - stores all chat messages
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,

  -- Message metadata (stored as JSONB for flexibility)
  parts JSONB,
  tool_calls JSONB,
  annotations JSONB,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure unique messages per project
  CONSTRAINT unique_message_per_project UNIQUE (project_id, message_id)
);

-- Indexes for performance
CREATE INDEX idx_messages_project ON chat_messages(project_id, created_at);
CREATE INDEX idx_messages_lookup ON chat_messages(project_id, message_id);

-- RLS Policies
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Service role access (for backend operations)
CREATE POLICY "Service role has full access to messages"
  ON chat_messages
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Users can only access messages in their own projects
CREATE POLICY "Users can view messages in own projects"
  ON chat_messages FOR SELECT
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

CREATE POLICY "Users can insert messages in own projects"
  ON chat_messages FOR INSERT
  TO authenticated, anon
  WITH CHECK (
    project_id IN (
      SELECT id FROM projects
      WHERE clerk_user_id = COALESCE(
        current_setting('request.jwt.claims', true)::json->>'sub',
        auth.jwt()->>'sub'
      )
    )
  );
