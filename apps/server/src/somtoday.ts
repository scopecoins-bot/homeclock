import type { Db } from "./db.js";
import type { McpStdioClient } from "./mcp-client.js";
import type { Lesson } from "@homeclock/shared";
import { addDays, todayLocal } from "./dates.js";

export type SomtodayState = "ok" | "needs_auth" | "error" | "unavailable";

/** Raw schedule item as returned by the somtoday-mcp `somtoday_get_schedule` tool. */
interface McpScheduleItem {
  id: number | string;
  vak?: string;
  vakId?: number;
  begin?: string;
  eind?: string;
  beginDatumTijd?: string;
  eindDatumTijd?: string;
  beginLesuur?: number;
  eindLesuur?: number;
  locatie?: string;
  docent?: string;
  status?: string;
  titel?: string;
  omschrijving?: string;
  afspraakType?: string;
}

const CANCELLED_RE = /GEANNULEERD|AFGELAST|INGETROKKEN|CANCELLED/i;

/** Normalize an MCP schedule item into the shared Lesson model. */
export function normalizeLesson(raw: McpScheduleItem, fetchedAt: string): Lesson | null {
  const startIso = raw.begin ?? raw.beginDatumTijd;
  const endIso = raw.eind ?? raw.eindDatumTijd;
  if (
    !startIso ||
    !endIso ||
    Number.isNaN(Date.parse(startIso)) ||
    Number.isNaN(Date.parse(endIso))
  ) {
    return null;
  }
  const status = raw.status ?? "";
  const cancelled = CANCELLED_RE.test(status);
  const changed = status !== "" && status.toUpperCase() !== "ACTIEF" && !cancelled;
  // Date in Europe/Amsterdam: derive from the ISO start (Somtoday times are already local ISO with offset).
  const date = startIso.slice(0, 10);
  return {
    id: String(raw.id),
    date,
    startIso,
    endIso,
    startPeriod: raw.beginLesuur,
    endPeriod: raw.eindLesuur,
    subject: raw.vak ?? raw.titel ?? "Onbekend vak",
    room: raw.locatie || undefined,
    teacher: raw.docent || undefined,
    statusRaw: status || undefined,
    cancelled,
    changed,
    title: raw.titel || undefined,
    notes: raw.omschrijving || undefined,
    fetchedAt,
  };
}

interface AuthStatusResult {
  authenticated?: boolean;
  state?: string;
  status?: string;
  reason?: string;
  detail?: string;
}

export class SomtodayService {
  state: SomtodayState = "unavailable";
  detail: string | null = null;
  lastRefresh: string | null = null;
  lastSuccessfulRefresh: string | null = null;

  constructor(
    private readonly client: McpStdioClient,
    private readonly db: Db,
  ) {}

  status(): {
    state: SomtodayState;
    detail?: string;
    lastRefresh?: string;
    lastSuccessfulRefresh?: string;
    lessonsCached: number;
  } {
    const row = this.db.prepare("SELECT COUNT(*) AS c FROM lessons").get() as { c: number };
    return {
      state: this.state,
      ...(this.detail ? { detail: this.detail } : {}),
      ...(this.lastRefresh ? { lastRefresh: this.lastRefresh } : {}),
      ...(this.lastSuccessfulRefresh ? { lastSuccessfulRefresh: this.lastSuccessfulRefresh } : {}),
      lessonsCached: row.c,
    };
  }

  async checkAuth(): Promise<SomtodayState> {
    try {
      const result = await this.client.callTool<AuthStatusResult>("somtoday_auth_status", {});
      const authenticated =
        result.authenticated === true ||
        result.state === "ok" ||
        result.status === "ok" ||
        result.status === "authenticated";
      if (authenticated) {
        this.state = "ok";
        this.detail = null;
      } else {
        this.state = "needs_auth";
        this.detail = result.reason ?? result.detail ?? "Not authenticated; run `npm run auth` in the somtoday-mcp project on bossp.";
      }
    } catch (err) {
      this.state = "unavailable";
      this.detail = `MCP unreachable: ${(err as Error).message}`;
    }
    return this.state;
  }

  /** Fetch + persist schedule for [from, to]. Returns lesson count. */
  async refreshRange(from: string, to: string): Promise<number> {
    const fetchedAt = new Date().toISOString();
    const payload = await this.client.callTool<{ from: string; to: string; count: number; items: McpScheduleItem[] }>(
      "somtoday_get_schedule",
      { from, to },
    );
    const items = payload.items ?? [];
    const lessons = items
      .map((item) => normalizeLesson(item, fetchedAt))
      .filter((l): l is Lesson => l !== null);

    const insert = this.db.prepare(`
      INSERT INTO lessons (id, date, start_iso, end_iso, start_period, end_period, subject, subject_id, room, teacher, status_raw, cancelled, changed, title, notes, fetched_at)
      VALUES (@id, @date, @startIso, @endIso, @startPeriod, @endPeriod, @subject, @subjectId, @room, @teacher, @statusRaw, @cancelled, @changed, @title, @notes, @fetchedAt)
      ON CONFLICT(id) DO UPDATE SET
        date = excluded.date,
        start_iso = excluded.start_iso,
        end_iso = excluded.end_iso,
        start_period = excluded.start_period,
        end_period = excluded.end_period,
        subject = excluded.subject,
        subject_id = excluded.subject_id,
        room = excluded.room,
        teacher = excluded.teacher,
        status_raw = excluded.status_raw,
        cancelled = excluded.cancelled,
        changed = excluded.changed,
        title = excluded.title,
        notes = excluded.notes,
        fetched_at = excluded.fetched_at
    `);
    const toRow = (l: Lesson) => ({
      id: l.id,
      date: l.date,
      startIso: l.startIso,
      endIso: l.endIso,
      startPeriod: l.startPeriod ?? null,
      endPeriod: l.endPeriod ?? null,
      subject: l.subject,
      subjectId: l.subjectId ?? null,
      room: l.room ?? null,
      teacher: l.teacher ?? null,
      statusRaw: l.statusRaw ?? null,
      cancelled: l.cancelled ? 1 : 0,
      changed: l.changed ? 1 : 0,
      title: l.title ?? null,
      notes: l.notes ?? null,
      fetchedAt: l.fetchedAt,
    });
    const tx = this.db.transaction((rows: Lesson[]) => {
      for (const lesson of rows) insert.run(toRow(lesson));
    });
    tx(lessons);

    this.lastRefresh = fetchedAt;
    if (lessons.length > 0 || items.length === 0) {
      // Empty range is a legitimate result (holidays/weekends).
      this.lastSuccessfulRefresh = fetchedAt;
      this.state = "ok";
      this.detail = null;
    }
    return lessons.length;
  }

  /** Standard rolling window: yesterday through next 7 days. */
  async refreshWindow(now: Date = new Date()): Promise<number> {
    const today = todayLocal(now);
    return this.refreshRange(addDays(today, -1), addDays(today, 7));
  }

  getLessons(from: string, to: string): Lesson[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM lessons WHERE date >= ? AND date <= ? ORDER BY start_iso ASC",
      )
      .all(from, to) as LessonRow[];
    return rows.map(rowToLesson);
  }
}

interface LessonRow {
  id: string;
  date: string;
  start_iso: string;
  end_iso: string;
  start_period: number | null;
  end_period: number | null;
  subject: string;
  subject_id: number | null;
  room: string | null;
  teacher: string | null;
  status_raw: string | null;
  cancelled: number;
  changed: number;
  title: string | null;
  notes: string | null;
  fetched_at: string;
}

export function rowToLesson(row: LessonRow): Lesson {
  return {
    id: row.id,
    date: row.date,
    startIso: row.start_iso,
    endIso: row.end_iso,
    startPeriod: row.start_period ?? undefined,
    endPeriod: row.end_period ?? undefined,
    subject: row.subject,
    subjectId: row.subject_id ?? undefined,
    room: row.room ?? undefined,
    teacher: row.teacher ?? undefined,
    statusRaw: row.status_raw ?? undefined,
    cancelled: row.cancelled === 1,
    changed: row.changed === 1,
    title: row.title ?? undefined,
    notes: row.notes ?? undefined,
    fetchedAt: row.fetched_at,
  };
}
