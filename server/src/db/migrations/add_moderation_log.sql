CREATE TABLE IF NOT EXISTS moderation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL,
  user_id UUID NOT NULL,
  category TEXT NOT NULL,
  flagged_content TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT 'blocked',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_moderation_log_user ON moderation_log(user_id);
CREATE INDEX IF NOT EXISTS idx_moderation_log_conversation ON moderation_log(conversation_id);
