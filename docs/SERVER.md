# Server (bossp)

## Installatie

```bash
./deploy/bossp-deploy.sh
```

Het script: packageert de broncode (zonder node_modules/builds), uploadt via
SSH, installeert dependencies (Node 22 via nvm), bouwt `packages/shared` +
`apps/server`, installeert de systemd user unit, herstart en health-checkt.
Eén HomeClock-service wordt herstart; bestaande services worden niet aangeraakt.

## Runtime

| Aspect | Waarde |
|---|---|
| Service | `systemctl --user status homeclock` (op bossp) |
| Proces | `node dist/index.js` (Node 22, nvm) |
| Bind | `127.0.0.1:8788` |
| Database | `~/apps/homeclock/data/homeclock.db` (SQLite, WAL) |
| Logs | `journalctl --user -u homeclock -f` (gestructureerde JSON) |
| Tailscale Serve | `https://bossp.<tailnet>.ts.net:8788` (tailnet-only) |

## Omgevingsvariabelen

Worden gezet door `deploy/homeclock.service`:

```
PORT=8788                     # luisterpoort (loopback)
HOST=127.0.0.1
DATABASE_PATH=%h/apps/homeclock/data/homeclock.db
SOMTODAY_MCP_CMD=%h/.nvm/versions/node/v22.23.1/bin/node
SOMTODAY_MCP_ARGS=%h/agent-stack/somtoday-mcp/dist/index.js
SOMTODAY_MCP_CWD=%h/agent-stack/somtoday-mcp
LOG_LEVEL=info
```

Namen + veilige voorbeelden staan ook in `apps/server/.env.example` (geen
geheimen; deze server gebruikt geen secrets).

## API

Alle `/v1/*` vereisen `Authorization: Bearer <device-token>`, behalve
`/v1/pair/exchange`.

| Endpoint | Beschrijving |
|---|---|
| `GET /health` | health (open; integraties laten `ok` nooit hard falen) |
| `GET /v1/status` | serverstatus + integratiestatus |
| `GET /v1/dashboard` | samengesteld dashboard (volgend alarm, lessen vandaag/morgen, weer) |
| `GET/POST /v1/alarms`, `PATCH/DELETE /v1/alarms/:id` | alarm-CRUD (revisions) |
| `GET /v1/schedule/today\|tomorrow\|week` | rooster uit cache |
| `GET /v1/weather` | laatste weercache |
| `GET/PATCH /v1/settings` | settings (weerlocatie, UI, sync-intervallen) |
| `POST /v1/pair/exchange` | koppelcode → device-token (open, rate-limited) |
| `POST /v1/device/heartbeat` | device-status + alarmdiagnostiek |
| `GET /v1/events` (WebSocket, `?token=`) | live events, auto-reconnect |

## Database

SQLite-tabellen: `alarms`, `devices`, `pairing_codes`, `lessons`,
`weather_cache`, `settings`, `meta` (schema_version, sync_revision).
Migraties draaien automatisch bij het openen (`openDb`).

Backup: stop service en kopieer `data/homeclock.db*`:

```bash
ssh bossp 'systemctl --user stop homeclock && \
  cp -a ~/apps/homeclock/data/homeclock.db ~/backups/homeclock-$(date +%F).db && \
  systemctl --user start homeclock'
```

## Pairing

```bash
ssh bossp 'cd ~/apps/homeclock/apps/server && \
  DATABASE_PATH=$HOME/apps/homeclock/data/homeclock.db npm run pair -- iPad'
```

Let op: gebruik `DATABASE_PATH` zoals hierboven zodat de code in de
productiedatabase terechtkomt (niet in een relatieve dev-database).

## Somtoday (her)authenticeren

```bash
ssh bossp 'cd ~/agent-stack/somtoday-mcp && npm run auth'
```

Daarna herstelt de HomeClock-scheduler zichzelf (auth-check per cyclus).
Status: `GET /v1/status` → `somtoday.state` (`ok | needs_auth | error | unavailable`).

## Troubleshooting

- **health `weather: error`** direct na start: de eerste achtergrondrefresh is
  nog bezig; na ±30 s wordt dit `ok` (open-meteo bereikbaarheid vereist).
- **`somtoday: unavailable`**: MCP-proces kon niet starten —
  `SOMTODAY_MCP_ARGS`/`_CWD` controleren en handmatig testen:
  `node ~/agent-stack/somtoday-mcp/dist/index.js` (start en sluit netjes af).
- **401 overal**: device-token ontbreekt/ongeldig → opnieuw koppelen.
- **poort bezet**: 8787 is bewust in gebruik door omp-deck; HomeClock staat op 8788.
