# Somtoday-integratie

## Principe

HomeClock **hergebruikt de bestaande Somtoday MCP** op bossp
(`~/agent-stack/somtoday-mcp` — stdio MCP-server, "VERIFIED WORKING") in plaats
van een eigen scraper te bouwen. De HomeClock API start de MCP als
child-proces en praat MCP/JSON-RPC:

| MCP-tool | Gebruik in HomeClock |
|---|---|
| `somtoday_auth_status` | auth-status per refreshcyclus |
| `somtoday_get_schedule` | rooster per datumbereik (genormaliseerde items) |
| `somtoday_get_next_lesson` | beschikbaar voor toekomstig gebruik |

## Normalisatie

MCP-items worden in `apps/server/src/somtoday.ts` genormaliseerd naar het
gedeelde `Lesson`-model: id, datum (Europe/Amsterdam), start/eind (ISO),
lesuur, vak, lokaal, docent, `cancelled` (status GEANNULEERD/AFGELAST/…) en
`changed` (andere niet-ACTIEF status). Velden die de MCP niet levert, worden
niet verzonnen.

## Authenticatie

- De MCP beheert zijn eigen tokens in `~/agent-stack/somtoday-mcp/data`.
  HomeClock slaat **geen** schoolcredentials of -tokens op.
- Zijn de tokens afwezig/verlopen, dan rapporteert de API
  `somtoday: needs_auth` en herhaalt de scheduler de auth-check per cyclus.
  Herstellen: `ssh bossp 'cd ~/agent-stack/somtoday-mcp && npm run auth'`
  (browser-flow op bossp). Daarna pakt HomeClock het rooster automatisch weer op.
- De API logt nooit tokens, cookies of volledige auth-antwoorden.

## Caching en verversen

- Elke refresh haalt het venster gisteren t/m +7 dagen en persisteert in
  SQLite (`lessons`, upsert op Somtoday-id).
- Verversingsintervallen (instelbaar via settings): 10 min overdag (06–23),
  60 min 's nachts, met exponentiële backoff bij fouten.
- Faalt Somtoday, dan blijft de laatste cache gewoon worden uitgeserveerd;
  `lastSuccessfulRefresh` in `/v1/status` toont de ouderdom.
- De iPad houdt daarnaast zijn eigen laatste rooster in AsyncStorage zodat het
  dashboard ook volledig offline het rooster toont.

## Fixtures

`apps/server/test/fixtures/week.json` is een echte Somtoday-cache-export (10
lessen, week 2026-08-17) en wordt gebruikt in de normalisatie- en
API-tests — de acceptatie draait dus op echte datastructuur.
Live data-invoer vereist een geldige Somtoday-login (zie boven).
