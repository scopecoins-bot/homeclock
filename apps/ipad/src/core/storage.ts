import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import type { Alarm, AppSettings, Lesson, Weather } from "@homeclock/shared";

/**
 * Local persistence. Everything here must be enough to run the app fully
 * offline: alarms, last timetable, last weather, settings, endpoint.
 * Secrets (device token) go to the iOS Keychain via SecureStore.
 */

const KEYS = {
  alarms: "homeclock.alarms.v1",
  revision: "homeclock.revision.v1",
  lessons: "homeclock.lessons.v1",
  weather: "homeclock.weather.v1",
  settings: "homeclock.settings.v1",
  endpoint: "homeclock.endpoint.v1",
  device: "homeclock.device.v1",
  pairingDone: "homeclock.pairing.v1",
} as const;

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export const storage = {
  async loadAlarms(): Promise<{ alarms: Alarm[]; revision: number }> {
    const [alarms, revision] = await Promise.all([
      readJson<Alarm[]>(KEYS.alarms),
      readJson<number>(KEYS.revision),
    ]);
    return { alarms: alarms ?? [], revision: revision ?? 0 };
  },
  saveAlarms(alarms: Alarm[], revision: number): Promise<void> {
    return Promise.all([
      writeJson(KEYS.alarms, alarms),
      writeJson(KEYS.revision, revision),
    ]).then(() => undefined);
  },

  async loadLessons(): Promise<Lesson[]> {
    return (await readJson<Lesson[]>(KEYS.lessons)) ?? [];
  },
  saveLessons(lessons: Lesson[]): Promise<void> {
    return writeJson(KEYS.lessons, lessons);
  },

  async loadWeather(): Promise<Weather | null> {
    return readJson<Weather>(KEYS.weather);
  },
  saveWeather(weather: Weather): Promise<void> {
    return writeJson(KEYS.weather, weather);
  },

  async loadSettings(): Promise<Partial<AppSettings> | null> {
    return readJson<Partial<AppSettings>>(KEYS.settings);
  },
  saveSettings(settings: AppSettings): Promise<void> {
    return writeJson(KEYS.settings, settings);
  },

  async loadEndpoint(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.endpoint);
  },
  saveEndpoint(url: string): Promise<void> {
    return AsyncStorage.setItem(KEYS.endpoint, url);
  },

  /** Device token — Keychain, never AsyncStorage. */
  async loadToken(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(KEYS.device);
    } catch {
      return null;
    }
  },
  saveToken(token: string): Promise<void> {
    return SecureStore.setItemAsync(KEYS.device, token, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED,
    });
  },
  async clearToken(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(KEYS.device);
    } catch {
      // already gone
    }
  },

  async readDebugLog(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem("hc.debuglog");
    } catch {
      return null;
    }
  },
  async appendDebugLog(line: string): Promise<void> {
    try {
      const prev = (await AsyncStorage.getItem("hc.debuglog")) ?? "";
      await AsyncStorage.setItem(
        "hc.debuglog",
        (prev + "\n" + new Date().toISOString() + " " + line).slice(-4000),
      );
    } catch {
      // storage zelf kapot: niets doen
    }
  },
  async loadPairingDone(): Promise<boolean> {
    return (await AsyncStorage.getItem(KEYS.pairingDone)) === "1";
  },
  savePairingDone(): Promise<void> {
    return AsyncStorage.setItem(KEYS.pairingDone, "1");
  },
};
