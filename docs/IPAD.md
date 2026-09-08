# iPad-app

## Stack

- **Expo SDK 57** / React Native 0.86 / React 19 / TypeScript strict
- **Expo Router** (bestandsgebaseerde navigatie)
- Native module `modules/homeclock-alarm` (Swift) voor **AlarmKit**
  (iPadOS 26+) met automatische notificatie-fallback op ouder
- Geen WebView: alle UI is native React Native

## Primair build- en distributiepad: CI → jailbreak-installatie

HomeClock wordt **niet** via EAS/App Store op de doel-iPad geïnstalleerd. Het
doelapparaat is jailbroken (Dopamine, rootless) en de app wordt direct als
app-bundel geïnstalleerd:

```
Windows/ZCode broncode
   │  git push
   ▼
GitHub Actions macOS-runner
   │  Xcode 26 + iPadOS 26 SDK (AlarmKit wordt geverifieerd door te
   │  compileren tegen de device-SDK)
   │  expo prebuild → pod install → xcodebuild (iphoneos, arm64, unsigned)
   │  ldid ad-hoc signing
   ▼
arm64 HomeClock.app  +  rootless .deb (/var/jb/Applications)
   │  CI-artifact downloaden
   ▼
./deploy/deploy-ipad.ps1  (scp → sudo dpkg -i → uicache)
   ▼
HomeClock op het startscherm van de iPad
```

Geen Apple Developer-account, geen betaalde signing, geen 7-dagen-beperking
van Personal Teams: de app wordt ad-hoc getekend met `ldid` en geïnstalleerd
door de jailbreak zelf. Zie [ALARMS.md](ALARMS.md) voor de signing/7-day
analyse.

### Zelf een build maken

```bash
git push                       # triggert .github/workflows/ios-device-build.yml
gh run watch                   # of: gh run list
gh run download <run-id>       # → HomeClock-app.tar.gz + nl.krimson.homeclock.deb
powershell -ExecutionPolicy Bypass -File deploy/deploy-ipad.ps1 -Ip <iPad-IP>
```

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
- Snooze/Stop zijn alleen prominent tijdens een actief alarm, nooit permanent.

## Data en opslag

- Lokale caches (AsyncStorage): alarmen + revision, lessen, weer, settings,
  endpoint. De app start hieruit zonder netwerk.
- Device-token: **Keychain** via `expo-secure-store` (`WHEN_UNLOCKED`).
- Sync: zie [ARCHITECTURE.md](ARCHITECTURE.md); events via WebSocket
  `/v1/events` met exponentiële reconnect-backoff.

## Geluiden

`assets/sounds/{dawn,chime,radial}.wav` zijn kleine gebundelde chimes
(gegenereerd door `scripts/gen-sounds.mjs`); het alarm is dus nooit afhankelijk
van netwerk-muziek. AlarmKit gebruikt standaard het systeemalarmgeluid;
aangepaste AlarmKit-sounds volgen de eisen van de SDK en worden gevalideerd in
de CI device-build.

## Diagnostiek

Instellingen → Diagnostiek toont app-versie, alarm-engine, AlarmKit-autorisatie,
aantal natively geplande alarmen, server-URL, verbinding, laatste sync,
Somtoday-status, rooster/weer-cache-leeftijd. Bevat nooit tokens.

## Optioneel alternatief: EAS (niet het HomeClock-pad)

De repo bevat `eas.json` voor het geval ooit een conventionele
App Store/TestFlight/simulator-route gewenst is. Voor de huidige
doel-iPad is dat niet nodig; EAS vereist een Expo-account en — voor
device-builds — een betaald Apple Developer Program. Dit pad is expliciet
**optioneel** en onderdeel van HomeClock niet vereist.
