import Database from 'better-sqlite3-multiple-ciphers';
import { env } from '../config/env.js';

export const db = new Database(env.DB_PATH);

db.pragma("cipher='sqlcipher'");
// Safe because DB_ENCRYPTION_KEY is strictly validated as 64-char hex in env schema.
db.pragma(`key='${env.DB_ENCRYPTION_KEY}'`);
db.pragma('foreign_keys=ON');
db.pragma('journal_mode=WAL');
db.pragma('busy_timeout=5000');

const schema = `
CREATE TABLE IF NOT EXISTS families (
  id BLOB PRIMARY KEY,
  routing_alias TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id BLOB PRIMARY KEY,
  family_id BLOB NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  role TEXT NOT NULL CHECK (role IN ('admin','member')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS children (
  id BLOB PRIMARY KEY,
  family_id BLOB NOT NULL,
  first_name TEXT NOT NULL,
  class_name TEXT,
  teacher_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS activities (
  id BLOB PRIMARY KEY,
  child_id BLOB NOT NULL,
  name TEXT NOT NULL,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('school_club','hobby','sports','volunteering')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ingested_emails (
  id BLOB PRIMARY KEY,
  family_id BLOB NOT NULL,
  sender TEXT NOT NULL,
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  vendor_email_id TEXT UNIQUE,
  attachments_json TEXT,
  processed_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS parsed_events (
  id BLOB PRIMARY KEY,
  family_id BLOB NOT NULL,
  child_id BLOB,
  activity_id BLOB,
  title TEXT NOT NULL,
  description TEXT,
  start_time TEXT NOT NULL,
  end_time TEXT,
  location TEXT,
  source_email_id BLOB,
  needs_review INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE SET NULL,
  FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE SET NULL,
  FOREIGN KEY (source_email_id) REFERENCES ingested_emails(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS magic_links (
  id BLOB PRIMARY KEY,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

CREATE TABLE IF NOT EXISTS email_2fa_codes (
  id BLOB PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

CREATE TABLE IF NOT EXISTS family_invites (
  id BLOB PRIMARY KEY,
  family_id BLOB NOT NULL,
  share_name TEXT NOT NULL UNIQUE,
  share_password_hash TEXT NOT NULL,
  link_token_hash TEXT NOT NULL UNIQUE,
  link_expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id BLOB PRIMARY KEY,
  user_id BLOB NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id BLOB PRIMARY KEY,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_parsed_events_family_start ON parsed_events(family_id, start_time);
CREATE INDEX IF NOT EXISTS idx_ingested_emails_family_processed ON ingested_emails(family_id, processed_at);
CREATE INDEX IF NOT EXISTS idx_magic_links_email ON magic_links(email, expires_at);
CREATE INDEX IF NOT EXISTS idx_email_2fa_codes_email ON email_2fa_codes(email, expires_at);
`;

db.exec(schema);

const userColumns = db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
if (!userColumns.some((column) => column.name === 'password_hash')) {
  db.exec('ALTER TABLE users ADD COLUMN password_hash TEXT');
}
