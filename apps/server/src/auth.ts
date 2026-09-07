import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Db } from "./db.js";

export interface DeviceRow {
  id: string;
  name: string;
  app_version: string | null;
  created_at: string;
  last_seen: string | null;
  last_sync_revision: number;
  alarm_engine: string | null;
  alarmkit_count: number | null;
}

function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** Bearer token format: "hc_" + 43 base64url chars (32 bytes entropy). */
export function generateToken(): string {
  return `hc_${randomBytes(32).toString("base64url")}`;
}

export function generatePairingCode(): string {
  // Unambiguous alphabet (no 0/O/1/I).
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += alphabet[bytes[i]! % alphabet.length];
    if (i === 2) code += "-";
  }
  return code;
}

const PAIRING_TTL_MS = 15 * 60_000;

/** Create a pairing code; returns the plaintext code to display once. */
export function createPairingCode(db: Db, suggestedName: string): string {
  const code = generatePairingCode();
  db.prepare(
    "INSERT INTO pairing_codes (code_hash, suggested_name, expires_at) VALUES (?, ?, ?)",
  ).run(sha256(code), suggestedName, new Date(Date.now() + PAIRING_TTL_MS).toISOString());
  // Opportunistic cleanup of expired codes.
  db.prepare("DELETE FROM pairing_codes WHERE expires_at < ? AND used_at IS NULL").run(
    new Date().toISOString(),
  );
  return code;
}

export interface PairResult {
  deviceId: string;
  token: string;
  name: string;
}

export function exchangePairingCode(
  db: Db,
  code: string,
  deviceName: string,
  appVersion?: string,
): PairResult | null {
  const now = new Date().toISOString();
  const row = db
    .prepare(
      "SELECT code_hash, suggested_name FROM pairing_codes WHERE code_hash = ? AND used_at IS NULL AND expires_at >= ?",
    )
    .get(sha256(code), now) as { code_hash: string; suggested_name: string | null } | undefined;
  if (!row) return null;

  db.prepare("UPDATE pairing_codes SET used_at = ? WHERE code_hash = ?").run(now, row.code_hash);

  const deviceId = crypto.randomUUID();
  const token = generateToken();
  const name = deviceName || row.suggested_name || "iPad";
  db.prepare(
    "INSERT INTO devices (id, name, token_hash, app_version, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(deviceId, name, sha256(token), appVersion ?? null, now, now);
  return { deviceId, token, name };
}

const validToken = (token: string): boolean =>
  token.startsWith("hc_") && token.length === 3 + 43;

/** Authenticate a bearer token; returns device row or null. */
export function authenticate(db: Db, header: string | undefined): DeviceRow | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = m?.[1];
  if (!token || !validToken(token)) return null;
  const row = db
    .prepare(
      "SELECT id, name, app_version, created_at, last_seen, last_sync_revision, alarm_engine, alarmkit_count FROM devices WHERE token_hash = ?",
    )
    .get(sha256(token)) as DeviceRow | undefined;
  return row ?? null;
}

/** Constant-time check used for WebSocket query-token auth. */
export function tokenMatchesDevice(db: Db, token: string): DeviceRow | null {
  if (!validToken(token)) return null;
  const want = Buffer.from(sha256(token), "hex");
  const row = db
    .prepare(
      "SELECT id, name, app_version, created_at, last_seen, last_sync_revision, alarm_engine, alarmkit_count FROM devices WHERE token_hash = ?",
    )
    .all(sha256(token)) as DeviceRow[];
  if (row.length === 1) return row[0]!;
  // Fallback scan with constant-time compare (defence in depth).
  for (const device of db
    .prepare(
      "SELECT id, name, app_version, created_at, last_seen, last_sync_revision, alarm_engine, alarmkit_count, token_hash FROM devices",
    )
    .all() as (DeviceRow & { token_hash: string })[]) {
    const got = Buffer.from(device.token_hash, "hex");
    if (got.length === want.length && timingSafeEqual(got, want)) return device;
  }
  return null;
}

export function touchDevice(
  db: Db,
  deviceId: string,
  fields: { appVersion?: string; syncRevision?: number; alarmEngine?: string; alarmKitCount?: number },
): void {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE devices SET
       last_seen = ?,
       app_version = COALESCE(?, app_version),
       last_sync_revision = COALESCE(?, last_sync_revision),
       alarm_engine = COALESCE(?, alarm_engine),
       alarmkit_count = COALESCE(?, alarmkit_count)
     WHERE id = ?`,
  ).run(now, fields.appVersion ?? null, fields.syncRevision ?? null, fields.alarmEngine ?? null, fields.alarmKitCount ?? null, deviceId);
}
