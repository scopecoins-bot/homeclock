import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Alarm, AlarmInput, AppSettings, Lesson, Weather } from "@homeclock/shared";
import {
  createApi,
  connectEvents,
  DEFAULT_ENDPOINT,
  type HomeClockApi,
} from "./api";
import {
  diffAlarms,
  mergeAlarmLists,
  type NativeAlarmSnapshot,
} from "@homeclock/shared";
import { storage } from "./storage";
import { AlarmNative, isAlarmKitAvailable } from "../../modules/homeclock-alarm";

export type Connection = "connected" | "connecting" | "offline";
export type AlarmEngine = "alarmkit" | "notifications" | "unknown";

export interface HomeClockState {
  ready: boolean;
  alarms: Alarm[];
  revision: number;
  lessons: Lesson[];
  weather: Weather | null;
  settings: AppSettings;
  endpoint: string;
  hasToken: boolean;
  connection: Connection;
  lastSyncAt: string | null;
  alarmEngine: AlarmEngine;
  alarmKitAuth: string;
  nativeAlarmCount: number;
  ringingAlarm: Alarm | null;
  somtodayState: string | null;
  lastNativeError: string | null;
}

export const DEFAULT_SETTINGS: AppSettings = {
  timezone: "Europe/Amsterdam",
  weather: { locationName: "Heerenveen", latitude: 52.9593, longitude: 5.9185 },
  ui: { nightBrightness: 15, keepAwake: true },
  sync: { dayRefreshMinutes: 10, nightRefreshMinutes: 60 },
};

interface StoreValue extends HomeClockState {
  api: HomeClockApi | null;
  saveAlarm: (input: AlarmInput & { id?: string }) => Promise<void>;
  deleteAlarm: (id: string) => Promise<void>;
  toggleAlarm: (id: string) => Promise<void>;
  syncNow: () => Promise<void>;
  pair: (endpoint: string, code: string) => Promise<void>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  dismissRing: () => void;
  snoozeRing: (minutes: number) => Promise<void>;
}

const StoreContext = createContext<StoreValue | null>(null);

export function useHomeClock(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useHomeClock outside provider");
  return ctx;
}

const APP_VERSION = "1.0.0";

export function HomeClockProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<HomeClockState>({
    ready: false,
    alarms: [],
    revision: 0,
    lessons: [],
    weather: null,
    settings: DEFAULT_SETTINGS,
    endpoint: DEFAULT_ENDPOINT,
    hasToken: false,
    connection: "offline",
    lastSyncAt: null,
    alarmEngine: "unknown",
    alarmKitAuth: "notDetermined",
    nativeAlarmCount: 0,
    ringingAlarm: null,
    somtodayState: null,
    lastNativeError: null,
  });

  const tokenRef = useRef<string | null>(null);
  const disconnectRef = useRef<(() => void) | null>(null);
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const patch = useCallback((p: Partial<HomeClockState>) => {
    setState((prev) => ({ ...prev, ...p }));
  }, []);

  const api = useMemo(
    () => (state.hasToken || tokenRef.current ? createApi(state.endpoint, tokenRef.current) : null),
    [state.endpoint, state.hasToken],
  );

  // ---------- native alarms ----------
  const nativeSnapshot = useCallback(async (): Promise<NativeAlarmSnapshot[]> => {
    try {
      return (await AlarmNative.scheduledAlarms()) as NativeAlarmSnapshot[];
    } catch {
      return [];
    }
  }, []);

  /** Reconcile native alarms with desired state — only touch what changed.
   *  Fouten worden NIET meer stil verworpen: laatste fout wordt getoond. */
  const reconcileNative = useCallback(
    async (alarms: Alarm[]) => {
      const current = await nativeSnapshot();
      const diff = diffAlarms(current, alarms);
      let lastError: string | null = null;
      for (const id of diff.toCancel) {
        try {
          await AlarmNative.cancelAlarm(id);
        } catch (err) {
          lastError = "cancel: " + String((err as Error).message || err);
        }
      }
      for (const alarm of diff.toSchedule) {
        try {
          await AlarmNative.scheduleAlarm({
            id: alarm.id,
            hour: alarm.hour,
            minute: alarm.minute,
            weekdays: alarm.weekdays,
            label: alarm.label || "Wekker",
            snoozeMinutes: alarm.snoozeMinutes,
            sound: alarm.sound,
          });
        } catch (err) {
          lastError = "schedule: " + String((err as Error).message || err);
        }
      }
      const count = (await nativeSnapshot()).length;
      patch({ nativeAlarmCount: count, lastNativeError: lastError });
      if (lastError) {
        try {
          const { Alert } = require("react-native");
          Alert.alert("AlarmKit-fout", lastError);
        } catch {}
      }
    },
    [nativeSnapshot, patch],
  );

  // ---------- server push (debounced, best effort) ----------
  const schedulePush = useCallback(() => {
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    pushTimerRef.current = setTimeout(async () => {
      const a = api;
      if (!a) return;
      try {
        const local = await storage.loadAlarms();
        // Push local alarms that are newer than the server copy.
        const server = await a.alarms();
        const merged = mergeAlarmLists(local.alarms, server.alarms, local.revision, server.revision);
        const serverById = new Map(server.alarms.map((x) => [x.id, x]));
        for (const alarm of merged.alarms) {
          const remote = serverById.get(alarm.id);
          if (!remote || remote.revision < alarm.revision) {
            try {
              if (remote) {
                await a.updateAlarm(alarm.id, {
                  hour: alarm.hour,
                  minute: alarm.minute,
                  label: alarm.label,
                  enabled: alarm.enabled,
                  weekdays: alarm.weekdays,
                  sound: alarm.sound,
                  snoozeMinutes: alarm.snoozeMinutes,
                });
              } else {
                await a.createAlarm({ ...alarm, id: alarm.id });
              }
            } catch {
              // offline; retried on next push/sync
            }
          }
        }
      } catch {
        // offline — fine
      }
    }, 1500);
  }, [api]);

  // ---------- local alarm mutation (source of truth first) ----------
  const mutateLocal = useCallback(
    async (mutator: (alarms: Alarm[]) => Alarm[]) => {
      const { alarms, revision } = await storage.loadAlarms();
      const now = new Date().toISOString();
      const next = mutator(alarms).map((a) => ({
        ...a,
        updatedAt: a.updatedAt === now ? a.updatedAt : now,
        revision: a.revision + 1,
      }));
      const nextRevision = revision + 1;
      await storage.saveAlarms(next, nextRevision);
      patch({ alarms: next, revision: nextRevision });
      await reconcileNative(next);
      schedulePush();
    },
    [patch, reconcileNative, schedulePush],
  );

  const saveAlarm = useCallback(
    async (input: AlarmInput & { id?: string }) => {
      await mutateLocal((alarms) => {
        const id = input.id ?? genId();
        const rest = alarms.filter((a) => a.id !== id);
        return [
          ...rest,
          {
            id,
            hour: input.hour,
            minute: input.minute,
            label: input.label,
            enabled: input.enabled,
            weekdays: [...input.weekdays],
            sound: input.sound,
            snoozeMinutes: input.snoozeMinutes,
            createdAt: alarms.find((a) => a.id === id)?.createdAt ?? new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            revision: 1,
          },
        ];
      });
    },
    [mutateLocal],
  );

  const deleteAlarm = useCallback(async (id: string) => {
    await mutateLocal((alarms) => alarms.filter((a) => a.id !== id));
  }, [mutateLocal]);

  const toggleAlarm = useCallback(
    async (id: string) => {
      await mutateLocal((alarms) =>
        alarms.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a)),
      );
    },
    [mutateLocal],
  );

  // ---------- sync ----------
  const syncNow = useCallback(async () => {
    const a = api;
    if (!a) return;
    patch({ connection: "connecting" });
    try {
      const [local, serverStatus, remoteAlarms, dash, remoteSettings, weather] = await Promise.all([
        storage.loadAlarms(),
        a.status(),
        a.alarms(),
        a.dashboard(),
        a.settings(),
        a.weather().catch(() => null),
      ]);

      const merged = mergeAlarmLists(
        local.alarms,
        remoteAlarms.alarms,
        local.revision,
        remoteAlarms.revision,
      );
      const settings: AppSettings = {
        ...DEFAULT_SETTINGS,
        ...remoteSettings,
        ui: { ...DEFAULT_SETTINGS.ui, ...remoteSettings.ui },
        sync: { ...DEFAULT_SETTINGS.sync, ...remoteSettings.sync },
        weather: { ...DEFAULT_SETTINGS.weather, ...remoteSettings.weather },
      };

      await storage.saveAlarms(merged.alarms, merged.revision);
      await storage.saveLessons(dash.today.lessons);
      await storage.saveSettings(settings);
      if (weather) await storage.saveWeather(weather);

      await reconcileNative(merged.alarms);
      try {
        await a.heartbeat(APP_VERSION, merged.revision);
      } catch {
        // heartbeat is best-effort
      }

      patch({
        connection: "connected",
        alarms: merged.alarms,
        revision: merged.revision,
        lessons: dash.today.lessons,
        weather: weather ?? null,
        settings,
        lastSyncAt: new Date().toISOString(),
        somtodayState: serverStatus.somtoday.state,
        alarmKitAuth: await safeAuth(),
      });
    } catch {
      patch({ connection: "offline" });
    }
  }, [api, patch, reconcileNative]);

  // ---------- pairing ----------
  const pair = useCallback(
    async (endpoint: string, code: string) => {
      const bootstrap = createApi(endpoint, null);
      const result = await bootstrap.pair(code, "iPad", APP_VERSION);
      await storage.saveEndpoint(endpoint);
      await storage.saveToken(result.token);
      await storage.savePairingDone();
      tokenRef.current = result.token;
      patch({ endpoint, hasToken: true });
    },
    [patch],
  );

  const updateSettings = useCallback(
    async (p: Partial<AppSettings>) => {
      const next: AppSettings = {
        ...state.settings,
        ...p,
        ui: { ...state.settings.ui, ...p.ui },
        sync: { ...state.settings.sync, ...p.sync },
        weather: { ...state.settings.weather, ...p.weather },
      };
      await storage.saveSettings(next);
      patch({ settings: next });
      const a = api;
      if (a) {
        try {
          await a.patchSettings(p);
        } catch {
          // offline; merged later
        }
      }
    },
    [api, patch, state.settings],
  );

  const dismissRing = useCallback(() => {
    patch({ ringingAlarm: null });
  }, [patch]);

  const snoozeRing = useCallback(
    async (minutes: number) => {
      try {
        await AlarmNative.snooze(minutes);
      } catch {
        // ignore
      }
      patch({ ringingAlarm: null });
    },
    [patch],
  );

  // ---------- init ----------
  useEffect(() => {
    void (async () => {
      const [local, lessons, weather, settings, endpoint, token, pairingDone] = await Promise.all([
        storage.loadAlarms(),
        storage.loadLessons(),
        storage.loadWeather(),
        storage.loadSettings(),
        storage.loadEndpoint(),
        storage.loadToken(),
        storage.loadPairingDone(),
      ]);
      tokenRef.current = token;
      const engine: AlarmEngine = isAlarmKitAvailable() ? "alarmkit" : "notifications";
      // AlarmKit-toestemming actief vragen (systeemdialoog bij eerste start).
      let auth = await safeAuth();
      if (isAlarmKitAvailable() && auth !== "authorized") {
        try {
          auth = await AlarmNative.requestAuthorization();
        } catch (err) {
          // gebruiker weigerde of systeemfout; alarmscheduler geeft gedetailleerde fout
        }
      }
      patch({
        ready: true,
        alarms: local.alarms,
        revision: local.revision,
        lessons,
        weather,
        settings: { ...DEFAULT_SETTINGS, ...settings },
        endpoint: endpoint ?? DEFAULT_ENDPOINT,
        hasToken: Boolean(token),
        alarmEngine: engine,
        alarmKitAuth: await safeAuth(),
        nativeAlarmCount: (await nativeSnapshot()).length,
        // pairing wizard not implemented as separate screen: settings handles it
        somtodayState: null,
      });
      void syncNow();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // live events
  useEffect(() => {
    disconnectRef.current?.();
    if (!state.hasToken || !tokenRef.current) return;
    const disconnect = connectEvents(
      state.endpoint,
      tokenRef.current,
      (event) => {
        if (event.type === "alarms_changed" || event.type === "schedule_changed") {
          void syncNow();
        } else if (event.type === "weather_changed") {
          const a = api;
          if (a) void a.weather().then((w) => storage.saveWeather(w)).then(() => patch({ weather: state.weather })).catch(() => undefined);
        }
      },
      (connected) => {
        patch({ connection: connected ? "connected" : "offline" });
        if (!connected) {
          // retry sync periodically handled by reconnect loop
        } else {
          void syncNow();
        }
      },
    );
    disconnectRef.current = disconnect;
    return disconnect;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.hasToken, state.endpoint]);

  // native alarm ring events
  useEffect(() => {
    const sub = AlarmNative.addListener?.("onAlarmStateChange", (event: { alarmId: string | null; state: string }) => {
      if (event.state === "ringing") {
        const alarm = state.alarms.find((a) => a.id === event.alarmId) ?? null;
        patch({ ringingAlarm: alarm });
      } else if (event.state === "stopped") {
        patch({ ringingAlarm: null });
      }
    });
    return () => sub?.remove?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.alarms]);

  const value: StoreValue = {
    ...state,
    api,
    saveAlarm,
    deleteAlarm,
    toggleAlarm,
    syncNow,
    pair,
    updateSettings,
    dismissRing,
    snoozeRing,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

async function safeAuth(): Promise<string> {
  try {
    return await AlarmNative.authorizationState();
  } catch {
    return "unknown";
  }
}

function genId(): string {
  // RFC4122 v4 via crypto when available (Hermes provides none) — fallback random.
  const s = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${s(8)}-${s(4)}-4${s(3)}-8${s(3)}-${s(12)}`;
}
