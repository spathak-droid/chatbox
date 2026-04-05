-- Pending actions table (replaces in-memory Map for multi-instance support)
CREATE TABLE IF NOT EXISTS pending_actions (
  id TEXT PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  args JSONB NOT NULL DEFAULT '{}',
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'executed', 'cancelled')),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pending_actions_conversation ON pending_actions(conversation_id, status);
