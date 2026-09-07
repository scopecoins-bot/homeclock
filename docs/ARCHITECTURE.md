# Architectuur

## Overzicht

HomeClock bestaat uit drie onderdelen die bewust gescheiden zijn:

| Onderdeel | Waar | Verantwoordelijkheid |
|---|---|---|
| iPad-app | iPad | UI, lokale alarmplanning (AlarmKit), lokale caches, sync |
| HomeClock API | bossp, `127.0.0.1:8788` | gedeelde alarmconfiguratie, roostercache, weer, settings |
| Somtoday MCP | bossp, `~/agent-stack/somtoday-mcp` | bestaande connector naar Somtoday (stdio MCP) |

## Waarom de server nooit het alarm triggert

Een wekker mag nooit uitvallen doordat een server onbereikbaar is. Daarom:

- de iPad plant elk alarm **lokaal** in AlarmKit (of als gedegradeerde fallback
  in lokale notificaties op iPadOS < 26);
- de server is uitsluitend een *synchronisatiebron*: handiger alarmen beheren,
  rooster en weer aanleveren;
- alle weergave-schermen renderen eerst uit lokale caches (AsyncStorage) en
  updaten daarna async vanaf de server.

bossp was tijdens de bouw einmalig offline geconstateerd; de app blijft in dat
geval gewoon werken en toont `Offline · laatst bijgewerkt HH:MM`.

## Netwerk

- De API bindt uitsluitend op `127.0.0.1:8788` — niets op `0.0.0.0`.
- Tailscale Serve publiceert hem binnen de tailnet als
  `https://bossp.<tailnet>.ts.net:8788` (automatische HTTPS van Tailscale).
- **Geen Funnel** voor HomeClock. (Op bossp bestaan bestaande Funnel-entries
  op poorten 10000–10002 voor andere services; die zijn ongewijzigd gelaten.)
- Poort 8787 is op bossp al in gebruik door de bestaande `omp-deck` service;
  HomeClock gebruikt daarom 8788. De serve-root verwijst nog steeds naar 8787.

## Beveiliging in lagen

1. Tailscale-identiteit: alleen apparaten in de tailnet bereiken de API.
2. Device-pairing: `npm run pair` op bossp genereert een eenmalige 6-tekens
   code (15 min geldig). De app ruilt die voor een 256-bit device-token.
3. De server slaat uitsluitend SHA-256-hashes van tokens op; het token zelf
   staat in de iOS Keychain (SecureStore).
4. Alle `/v1/*` endpoints vereisen `Authorization: Bearer <token>`;
   `/health` en de pairing-uitwisseling zijn open (rate-limited 10/5 min).

## Synchronisatiemodel

- Elke alarm heeft een stabiele UUID, `updatedAt` en `revision`;
  de server houdt een globale `sync_revision` bij.
- **Conflictbeleid: last-write-wins**, bewaakt door revisies: bij gelijktijdige
  wijziging wint de hoogste per-alarm `revision`; local-only alarmen blijven
  bewaard (`mergeAlarmLists` in `packages/shared`).
- De iPad pusht lokale wijzigingen (debounced 1,5 s) en trekt serverstate bij
  startup, bij reconnect en via WebSocket-events (`/v1/events`).

## Alarm-reconciliatie (hard requirement)

`diffAlarms` vergelijkt de natively geplande alarmen met de gewenste staat en
raakt uitsluitend verschil aan: verwijderde/uitgezette alarmen worden gecanceld,
nieuwe/gewijzigde worden (opnieuw) gepland. Er wordt **nooit** eerst alles
gecanceld en opnieuw aangemaakt. Zie [ALARMS.md](ALARMS.md).

## Gegevensstromen

```
Somtoday ──(MCP stdio)──► HomeClock API ──► SQLite lesrooster (cache)
open-meteo ──(HTTPS)────► HomeClock API ──► SQLite weer (cache)
iPad ◄── WebSocket events (schedule_changed / alarms_changed / …)
iPad ──► REST /v1/... (alarms, dashboard, settings)
```

De MCP wordt door de API als child-proces gestart (stdio JSON-RPC). Is de MCP
niet geauthenticeerd, dan rapporteert de API `somtoday: needs_auth` en blijft de
laatste roostercache gewoon zichtbaar; zodra `npm run auth` op bossp opnieuw is
gedraaid, herstelt de scheduler zichzelf binnen één refreshcyclus.

## Tijd

Tijdzone `Europe/Amsterdam` overal; alarmen worden opgeslagen als uur+minuut
plus weekdagset (0=zondag…6=zaterdag) — nooit als absolute tijdstippen — zodat
DST-overgangen correct blijven.
