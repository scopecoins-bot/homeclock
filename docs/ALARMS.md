# Alarmen

## Prioriteit 1: betrouwbaarheid

Een eenmaal gepland alarm:

- staat in **AlarmKit** (iPadOS 26+) — het besturingssysteem bezit en triggert
  het alarm, ook als de app is gesloten, het toestel vergrendeld is of bossp
  onbereikbaar is;
- heeft een **stabiele UUID** die identiek is op server, apparaat en native laag;
- wordt **nooit** massaal gecanceld+hercraëerd bij synchronisatie.

## Reconciliatie

`packages/shared/src/alarmsync.ts` — `diffAlarms(currentNative, desired)`:

1. native alarm dat niet (meer) in desired staat → **cancel**;
2. native alarm waarvan tijdstip/weekdagen/label/enabled verschilt → **cancel**
   en (indien enabled) **schedule**;
3. gewenst alarm dat nog niet native staat (en enabled is) → **schedule**;
4. alles wat gelijk blijft → **niets**.

Dezelfde semantiek geldt in de notificatie-fallback (UNCalendarNotificationTrigger,
repeats per weekdag). Unit tests: `apps/server/test/alarmsync.test.ts`.

## Conflictbeleid

Last-write-wins met revisiegrenzen (`mergeAlarmLists`):

- per alarm wint de hoogste `revision`;
- local-only alarmen blijven bestaan (gaan later alsnog naar de server);
- de globale `sync_revision` voorkomt stille downgrades.

## Snooze & stop

- **AlarmKit**: de systeempresentatie toont Stop en (indien snoozeMinutes > 0)
  een snooze-knop; snooze = nieuw eenmalig alarm op nu + N minuten.
- **In-app** (`/ringing`): Snooze roept dezelfde native snooze aan; Stop
  beëindigt de ring-weergave (bij AlarmKit handelt de systeem-UI de eigen
  knoppen af; de in-app UI is primair voor de fallback).
- Snooze-duur is per alarm instelbaar (0 = uit).

## Tijdzone/DST

Alarmen worden opgeslagen als uur+minuut+weekdagset (0=zo…6=za) in
Europe/Amsterdam, niet als absolute instanten. AlarmKit krijgt
`DateComponents(hour, minute)` + weekly recurrence en herleidt dus correct na
DST-overgang, herstart of bewerking. Server en app hebben identieke
next-occurrence-logica (`src/dates.ts` resp. `src/core/time.ts`), beide
getest.

## Fallback (iPadOS < 26)

- `isAlarmKitAvailable() === false` → app gebruikt `UNUserNotificationCenter`
  calendar-triggers met critical sound; de geluiden komen uit de bundle.
- De gedegradeerde staat is **zichtbaar** in: Instellingen → Diagnostiek
  (`Alarm engine: notifications`) en het alarmenscherm (kop).
- Een notificatie wordt nooit gepresenteerd als gelijkwaardig aan AlarmKit.

## Testscenario's (uitvoeren op apparaat/simulator met dev build)

| # | Scenario | Verificatie |
|---|---|---|
| A | alarm = nu+2 min, scherm lock | AlarmKit UI verschijnt; app-event `ringing` |
| B | herhalend alarm maken | `scheduledAlarms()` bevat weekly recurrence |
| C | alarm uitschakelen | native alarm verdwijnt (diff: cancel) |
| D | tijdstip wijzigen | uitsluitend dat ene alarm wordt bijgewerkt |
| E | snooze | nieuw eenmalig alarm op nu+N; oude stopt |
| F | stop | geen her-afgaan zonder nieuwe schedule |
| G | app killen | AlarmKit alarm gaat alsnog af (OS-owned) |
| H | bossp uitzetten | alarm blijft staan en gaat af |
| I | Tailscale uit | idem; app toont offline-stipje |
| J | bossp herstart | app reconnect automatisch (WS backoff) |

Scenario's G/H/I/J zijn door het ontwerp gegarandeerd (alarm staat lokaal in
AlarmKit), maar dienen op het fysieke apparaat bevestigd te worden zodra een
development build is geïnstalleerd.
