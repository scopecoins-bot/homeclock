import type { HomeClockEvent, HomeClockEventName } from "@homeclock/shared";

type Listener = (event: HomeClockEvent) => void;

/** Tiny in-process event bus feeding the WebSocket live channel. */
export class EventBus {
  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  emit(type: HomeClockEventName, extra: Partial<HomeClockEvent> = {}): void {
    const event: HomeClockEvent = { type, at: new Date().toISOString(), ...extra };
    for (const fn of this.listeners) {
      try {
        fn(event);
      } catch {
        // a broken client must never break the emitter
      }
    }
  }
}
