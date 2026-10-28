CREATE TABLE IF NOT EXISTS conversations (
  id serial PRIMARY KEY,
  title text NOT NULL,
  session_id text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Existing public conversations are retained but never assigned to new visitors.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS session_id text NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS messages (
  id serial PRIMARY KEY,
  conversation_id integer NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS conversations_session_id_idx ON conversations(session_id, id);
CREATE INDEX IF NOT EXISTS messages_conversation_id_idx ON messages(conversation_id, id);
-- The backend connects as the table owner. Public Supabase Data API roles have
-- no policies, so chat data cannot be read directly with a publishable key.
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
