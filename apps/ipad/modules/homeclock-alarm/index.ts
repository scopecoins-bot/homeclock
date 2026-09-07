import { requireNativeModule, EventEmitter } from "expo-modules-core";

/**
 * HomeClock native alarm module.
 *
 * On iPadOS 26+ this drives AlarmKit (real alarms, owned by the OS).
 * On older iPadOS the native side reports availability=false and the app
 * falls back to local notifications (degraded, surfaced in diagnostics).
 */

export interface NativeAlarmInfo {
  id: string;
  hour: number;
  minute: number;
  /** Sorted weekday list (0=Sunday..6=Saturday); empty = one-shot. */
  weekdays: number[];
  enabled: boolean;
  label: string;
}

type Events = {
  onAlarmStateChange: (event: { alarmId: string | null; state: string }) => void;
};

declare class HomeclockAlarmModule extends EventEmitter<Events> {
  /** True when AlarmKit can be used on this OS version. */
  isAlarmKitAvailable(): boolean;
  /** Requests AlarmKit authorization; returns status string ("authorized" | "denied" | ...). */
  requestAuthorization(): Promise<string>;
  /** Current authorization state without prompting. */
  authorizationState(): Promise<string>;
  /** Currently scheduled alarms. */
  scheduledAlarms(): Promise<NativeAlarmInfo[]>;
  /** Schedule one alarm; weekdays [] = one-shot. Returns scheduled snapshot. */
  scheduleAlarm(alarm: {
    id: string;
    hour: number;
    minute: number;
    weekdays: number[];
    label: string;
    snoozeMinutes: number;
    sound: string;
  }): Promise<NativeAlarmInfo>;
  /** Cancel a scheduled alarm by id. */
  cancelAlarm(id: string): Promise<boolean>;
  /** Snooze the currently ringing alarm by n minutes. */
  snooze(minutes: number): Promise<boolean>;
  /** Stop the currently ringing alarm. */
  stop(): Promise<boolean>;
}

class NativeModuleStub extends EventEmitter {}
const stub = new NativeModuleStub() as unknown as HomeclockAlarmModule;

const NativeModule = (() => {
  try {
    return requireNativeModule<HomeclockAlarmModule>("HomeclockAlarm");
  } catch {
    // web / unit-test environments
    return stub;
  }
})();

export const AlarmNative = NativeModule;

export function isAlarmKitAvailable(): boolean {
  try {
    return NativeModule.isAlarmKitAvailable();
  } catch {
    return false;
  }
}
