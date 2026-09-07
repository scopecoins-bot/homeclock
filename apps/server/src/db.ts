import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const SCHEMA_VERSION = 1;

export type Db = Database.Database;

export function openDb(databasePath: string): Db {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new Database(databasePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  migrate(db);
  return db;
}

export function migrate(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS alarms (
      id TEXT PRIMARY KEY,
      hour INTEGER NOT NULL,
      minute INTEGER NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      weekdays TEXT NOT NULL DEFAULT '[]',
      sound TEXT NOT NULL DEFAULT 'dawn',
      snooze_minutes INTEGER NOT NULL DEFAULT 5,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      app_version TEXT,
      created_at TEXT NOT NULL,
      last_seen TEXT,
      last_sync_revision INTEGER NOT NULL DEFAULT 0,
      alarm_engine TEXT,
      alarmkit_count INTEGER
    );

    CREATE TABLE IF NOT EXISTS pairing_codes (
      code_hash TEXT PRIMARY KEY,
      suggested_name TEXT,
      expires_at TEXT NOT NULL,
      used_at TEXT
    );

    CREATE TABLE IF NOT EXISTS lessons (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      start_iso TEXT NOT NULL,
      end_iso TEXT NOT NULL,
      start_period INTEGER,
      end_period INTEGER,
      subject TEXT NOT NULL DEFAULT '',
      subject_id INTEGER,
      room TEXT,
      teacher TEXT,
      status_raw TEXT,
      cancelled INTEGER NOT NULL DEFAULT 0,
      changed INTEGER NOT NULL DEFAULT 0,
      title TEXT,
      notes TEXT,
      fetched_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_lessons_date ON lessons(date);

    CREATE TABLE IF NOT EXISTS weather_cache (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      payload TEXT NOT NULL,
      fetched_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const row = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as
    | { value: string }
    | undefined;
  if (!row) {
    db.prepare("INSERT INTO meta (key, value) VALUES ('schema_version', ?)").run(
      String(SCHEMA_VERSION),
    );
    db.prepare("INSERT OR IGNORE INTO meta (key, value) VALUES ('sync_revision', '0')").run();
  }
}

export function getSyncRevision(db: Db): number {
  const row = db.prepare("SELECT value FROM meta WHERE key = 'sync_revision'").get() as
    | { value: string }
    | undefined;
  return row ? Number(row.value) : 0;
}

export function bumpSyncRevision(db: Db): number {
  const next = getSyncRevision(db) + 1;
  db.prepare(
    "INSERT INTO meta (key, value) VALUES ('sync_revision', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(String(next));
  return next;
}
