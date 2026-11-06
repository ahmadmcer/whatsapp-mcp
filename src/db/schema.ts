export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS chats (
  jid TEXT PRIMARY KEY,
  name TEXT,
  unread_count INTEGER DEFAULT 0,
  last_message_timestamp INTEGER DEFAULT 0,
  is_group INTEGER DEFAULT 0,
  is_archived INTEGER DEFAULT 0,
  is_pinned INTEGER DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT NOT NULL,
  chat_jid TEXT NOT NULL,
  sender_jid TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  from_me INTEGER DEFAULT 0,
  message_type TEXT DEFAULT 'text',
  text_content TEXT,
  media_path TEXT,
  media_mime TEXT,
  raw_payload TEXT,
  status TEXT DEFAULT 'received',
  PRIMARY KEY (chat_jid, id)
);

CREATE INDEX IF NOT EXISTS idx_messages_chat_timestamp ON messages(chat_jid, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_messages_id ON messages(id);
CREATE INDEX IF NOT EXISTS idx_chats_timestamp ON chats(last_message_timestamp DESC);

CREATE TABLE IF NOT EXISTS contacts (
  jid TEXT PRIMARY KEY,
  name TEXT,
  notify_name TEXT,
  verified_name TEXT,
  status_text TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS groups_metadata (
  jid TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  description TEXT,
  owner_jid TEXT,
  creation_timestamp INTEGER,
  participants_json TEXT,
  updated_at INTEGER NOT NULL
);

-- Full text search on messages
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  message_id UNINDEXED,
  chat_jid UNINDEXED,
  text_content
);

-- Triggers to maintain FTS index
CREATE TRIGGER IF NOT EXISTS trg_messages_ai AFTER INSERT ON messages
BEGIN
  INSERT INTO messages_fts(message_id, chat_jid, text_content)
  VALUES (new.id, new.chat_jid, coalesce(new.text_content, ''));
END;

CREATE TRIGGER IF NOT EXISTS trg_messages_ad AFTER DELETE ON messages
BEGIN
  DELETE FROM messages_fts WHERE message_id = old.id AND chat_jid = old.chat_jid;
END;

CREATE TRIGGER IF NOT EXISTS trg_messages_au AFTER UPDATE ON messages
BEGIN
  DELETE FROM messages_fts WHERE message_id = old.id AND chat_jid = old.chat_jid;
  INSERT INTO messages_fts(message_id, chat_jid, text_content)
  VALUES (new.id, new.chat_jid, coalesce(new.text_content, ''));
END;
`;
