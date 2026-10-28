-- Legacy browser sessions stay unassigned: a shared browser is not proof of ownership.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS updated_at timestamptz(3) NOT NULL DEFAULT now();
UPDATE conversations c SET updated_at = COALESCE((SELECT max(m.created_at) FROM messages m WHERE m.conversation_id=c.id), c.created_at);
CREATE INDEX IF NOT EXISTS conversations_user_updated_idx ON conversations(user_id, updated_at DESC, id DESC);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
-- Authenticated clients can read only their data. Writes go through the API so
-- clients cannot forge assistant replies or bypass generation limits.
REVOKE ALL ON conversations, messages FROM PUBLIC, anon, authenticated;
GRANT SELECT ON conversations, messages TO authenticated;
CREATE POLICY conversations_owner_read ON conversations FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY messages_owner_read ON messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM conversations c WHERE c.id = conversation_id AND c.user_id = (SELECT auth.uid())));
