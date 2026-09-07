# iPad-app

## Stack

- **Expo SDK 57** / React Native 0.86 / React 19 / TypeScript strict
- **Expo Router** (bestandsgebaseerde navigatie)
- Native module `modules/homeclock-alarm` (Swift) voor **AlarmKit**
  (iPadOS 26+) met automatische notificatie-fallback op ouder
-expo-notifications
- Geen WebView: alle UI is native React Native

## Schermen

| Route | Inhoud |
|---|---|
| `/` | Dashboard: grote klok, begroeting, volgend alarm, school, weer, subtiel verbindings-stipje |
| `/alarms` | Alarmlijst met native switches; tik = editor |
| `/alarm-edit` | Eén-scherm-editor: wheel timepicker, weekdagen, label, geluid, snooze |
| `/schedule` | Rooster: Vandaag / Morgen / Week, uitgevallen lessen doorgestreept |
| `/settings` | Serverkoppeling, nacht & scherm, weer, diagnostiek |
| `/ringing` | Fullscreen alarm-scherm met enorme Snooze/Stop-knoppen |

## Ontwerp

- Ontworpen voor **4:3 landscape** iPad; portret werkt als secundaire modus.
- Vier tijdsthema's (`src/core/theme.ts`): morning 05–11, day 11–18,
  evening 18–22, night 22–05. Nacht is bewust zeer donker met instelbare
  helderheidsstand (Instellingen → Nacht).
- De klok is het sterkste visuele element; kaarten zijn rustig en beperkt.

## Data en opslag

- Lokale caches (AsyncStorage): alarmen + revision, lessen, weer, settings,
  endpoint. De app start hieruit zonder netwerk.
- Device-token: **Keychain** via `expo-secure-store` (`WHEN_UNLOCKED`).
- Sync: zie [ARCHITECTURE.md](ARCHITECTURE.md); events via WebSocket
  `/v1/events` met exponentiële reconnect-backoff.

## Build

> AlarmKit vereist een native build — **Expo Go is niet voldoende**.

```bash
cd apps/ipad
npx eas login                       # eenmalig (Expo-account)
npx eas build --platform ios --profile simulator   # voor iOS-simulator
npx eas build --platform ios --profile development # dev client op fysieke iPad
npx eas device:create               # iPad registreren (eenmalig)
```

`app.json` zet `bundleIdentifier nl.krimson.homeclock`, iPad `supportsTablet`
en `requireFullScreen`, en de `NSAlarmKitUsageDescription`.

## Geluiden

`assets/sounds/{dawn,chime,radial}.wav` zijn kleine gebundelde chimes
(gegenereerd door `scripts/gen-sounds.mjs`); het alarm is dus nooit afhankelijk
van netwerk-muziek. AlarmKit gebruikt standaard het systeemalarmgeluid;
aangepaste AlarmKit-sounds volgen de eisen van de SDK en worden bij de eerste
EAS-build gevalideerd.

## Diagnostiek

Instellingen → Diagnostiek toont app-versie, alarm-engine, AlarmKit-autorisatie,
aantal natively geplande alarmen, server-URL, verbinding, laatste sync,
Somtoday-status, rooster/weer-cache-leeftijd. Bevat nooit tokens.
