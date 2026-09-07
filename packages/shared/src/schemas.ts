import { z } from "zod";

/** 0 = Sunday .. 6 = Saturday — union keeps the output type equal to Weekday[]. */
export const weekdaysSchema = z
  .array(
    z.union([
      z.literal(0),
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
      z.literal(6),
    ]),
  )
  .max(7)
  .default([]);

export const alarmInputSchema = z.object({
  id: z.string().uuid().optional(),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
  label: z.string().max(80).default(""),
  enabled: z.boolean().default(true),
  weekdays: weekdaysSchema,
  sound: z.string().max(40).default("dawn"),
  snoozeMinutes: z.number().int().min(0).max(30).default(5),
});
export type AlarmInputParsed = z.infer<typeof alarmInputSchema>;

/** PATCH: all fields optional. */
export const alarmPatchSchema = alarmInputSchema.partial().omit({ id: true });

export const pairRequestSchema = z.object({
  code: z.string().min(4).max(32),
  deviceName: z.string().min(1).max(60),
  appVersion: z.string().max(20).optional(),
});

export const heartbeatSchema = z.object({
  appVersion: z.string().max(20).optional(),
  syncRevision: z.number().int().min(0).optional(),
  alarmEngine: z.enum(["alarmkit", "notifications", "unknown"]).optional(),
  alarmKitScheduledCount: z.number().int().min(0).optional(),
});

export const weatherSettingsSchema = z.object({
  locationName: z.string().min(1).max(80),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const settingsPatchSchema = z.object({
  weather: weatherSettingsSchema.optional(),
  ui: z
    .object({
      nightBrightness: z.number().int().min(0).max(100).optional(),
      keepAwake: z.boolean().optional(),
    })
    .optional(),
  sync: z
    .object({
      dayRefreshMinutes: z.number().int().min(5).max(60).optional(),
      nightRefreshMinutes: z.number().int().min(15).max(240).optional(),
    })
    .optional(),
});

export const DEFAULT_SETTINGS = {
  timezone: "Europe/Amsterdam",
  weather: {
    locationName: "Heerenveen",
    latitude: 52.9593,
    longitude: 5.9185,
  },
  ui: {
    nightBrightness: 15,
    keepAwake: true,
  },
  sync: {
    dayRefreshMinutes: 10,
    nightRefreshMinutes: 60,
  },
} as const;
