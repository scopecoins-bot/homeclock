# HomeClock

Een premium iPad-bedieningswekker + school-dashboard. De iPad is het alarmklok;
**bossp** (Linux server) levert gesynchroniseerde data via een alleen-binnen-de-tailnet
bereikbare API over Tailscale.

```
iPad HomeClock app
       │  HTTPS via Tailscale (tailnet-only)
       ▼
https://bossp.<tailnet>.ts.net:8788   (Tailscale Serve)
       │
       ▼
127.0.0.1:8788   HomeClock API (Fastify + SQLite) op bossp
       │
       ├── Somtoday MCP (~/agent-stack/somtoday-mcp) → schoolrooster
       └── open-meteo → weer
```

## Kernprincipes

1. **Alarmbetrouwbaarheid gaat vóór alles.** Alarmen worden lokaal gepland met
   Apple AlarmKit (iPadOS 26+) — de server is nooit nodig om een gepland alarm
   af te laten gaan.
2. **Offline-first.** Klok, alarmen, rooster-cache en weer-cache werken zonder
   bossp; verouderde data wordt subtiel gemarkeerd, nooit met grote banners.
3. **Privé.** Geen Funnel, geen port-forward: alleen Tailscale Serve binnen de
   tailnet, plus device-pairing met tokens in de iOS Keychain.
4. **Native iPad.** Expo + React Native + Expo Router; géén WebView-dashboard.

## Repository

```
homeclock/
├── apps/
│   ├── server/        Fastify + SQLite + Zod API (draait op bossp)
│   └── ipad/          Expo SDK 57 iPad-app (native AlarmKit-module inbegrepen)
├── packages/
│   └── shared/        Gedeelde types, schemas en alarm-reconcile-logica
├── deploy/
│   ├── homeclock.service   systemd user unit
│   └── bossp-deploy.sh     herhaalbare deployment
└── docs/              Architectuur en handleidingen
```

## Snelle start

### Server deployen naar bossp

```bash
./deploy/bossp-deploy.sh                # of: ./deploy/bossp-deploy.sh user@host
```

Controleer daarna:

```bash
curl https://bossp.<tailnet>.ts.net:8788/health   # vanaf een tailnet-apparaat
```

Device koppelen:

```bash
ssh bossp 'cd ~/apps/homeclock/apps/server && \
  DATABASE_PATH=$HOME/apps/homeclock/data/homeclock.db npm run pair -- iPad'
```

Voer de 6-tekens code in de app in bij *Instellingen → Server*.

### iPad-app bouwen en installeren (jailbreak-pad)

```bash
git push                                      # triggert macOS CI-build (Xcode 26, arm64)
gh run watch && gh run download <run-id>      # .deb + .app artifact
powershell -ExecutionPolicy Bypass -File deploy/deploy-ipad.ps1 -Ip <iPad-IP>
```

De doel-iPad is jailbroken (Dopamine, rootless); installatie gebeurt met
`dpkg` + `uicache` — zonder Apple Developer-account. Zie
[docs/IPAD.md](docs/IPAD.md) (EAS is een optioneel conventioneel alternatief,
geen onderdeel van dit pad).

## Documentatie

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — systeemontwerp en keuzes
- [docs/SERVER.md](docs/SERVER.md) — API, database, deployment, beheer
- [docs/IPAD.md](docs/IPAD.md) — app-structuur, thema's, build/distributie
- [docs/ALARMS.md](docs/ALARMS.md) — AlarmKit, synchronisatie, fallback, tests
- [docs/SOMTODAY.md](docs/SOMTODAY.md) — MCP-integratie, auth, caching

## Status

Zie het eindrapport in deze sessie; actuele runtime-status: `GET /health`.
