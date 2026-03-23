# CRCON API Endpoint Reference

This project calls CRCON using `BASE_URL/api/<endpoint>`.

## Wrapped Endpoints (`src/services/crcon.js`)

| Method | Endpoint | Wrapper Method | Typical Payload |
|---|---|---|---|
| GET | `get_maps` | `getMaps()` | none |
| GET | `get_map_rotation` | `getMapRotation()` | none |
| GET | `get_map` | `getCurrentMap()` | none |
| GET | `get_gamestate` | `getGameState()` | none |
| GET | `get_status` | `getStatus()` | none |
| GET | `get_detailed_players` | `getDetailedPlayers()` | none |
| POST | `set_map` | `setNextMap(mapId)` | `{ "map_name": "<mapId>" }` |
| POST | `add_map_to_rotation` | `addMapToRotation(mapId)` | `{ "map_name": "<mapId>" }` |
| POST | `remove_map_from_rotation` | `removeMapFromRotation(mapId)` | `{ "map_name": "<mapId>" }` |
| GET | `get_votemap_config` | `getVotemapConfig()` | none |
| GET | `get_votemap_whitelist` | `getVotemapWhitelist()` | none |
| POST | `set_votemap_whitelist` | `setVotemapWhitelist(maps)` | `{ "map_names": ["..."] }` |
| POST | `add_map_to_votemap_whitelist` | `addToVotemapWhitelist(mapId)` | `{ "map_name": "<mapId>" }` |
| POST | `remove_map_from_votemap_whitelist` | `removeFromVotemapWhitelist(mapId)` | `{ "map_name": "<mapId>" }` |
| POST | `reset_map_votemap_whitelist` | `resetVotemapWhitelist()` | `{}` |
| POST | `reset_votemap_state` | `resetVotemapState()` | `{}` |
| GET | `get_votemap_status` | `getVotemapStatus()` | none |
| POST | `set_votemap_config` | `setVotemapEnabled(enabled)` | `{ "enabled": true/false }` |
| POST | `set_broadcast` | `broadcast(message)` | `{ "message": "<text>" }` |
| GET | `get_map_history` | `getMapHistory()` | none |

## Direct Endpoint Calls (Not Wrapped)

| Method | Endpoint | Location | Purpose | Typical Payload |
|---|---|---|---|---|
| GET | `get_public_info` | `src/services/mapVoting.js` | Read current map start timestamp for vote persistence | none |
| POST | `get_recent_logs` | `src/services/mapVoting.js` | Infer match state from log stream | `{ "end": 10000, "filter_action": ["MATCH ENDED", "MATCH START"], "filter_player": [], "inclusive_filter": true }` |
| POST | `set_map_rotation` | `src/services/mapVoting.js` | Apply winning map as next map rotation | `{ "map_names": ["<mapId>"] }` |
| GET | `get_status` | `src/services/setupWizard.js` | Validate URL/token during setup | none |

## Notes For Analysis

- Canonical request path is always `/api/<endpoint>`.
- Auth is bearer token via `Authorization: Bearer <token>`.
- Timeouts:
  - `CRCONService`: 30s (`axios.create` client).
  - Setup wizard connection test: 10s.
- `mapVoting.js` currently mixes wrapper and raw endpoint calls; this is important when tracing usage coverage.
