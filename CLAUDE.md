# WAHA WhatsApp MCP Server

MCP server exposing the unified WAHA backend to MCP clients.

## Architecture

```text
MCP client → this stdio server → unified backend /api on :8200
                                      ├─ PostgreSQL message store
                                      ├─ WAHA live proxy
                                      ├─ voice transcription/TTS
                                      └─ media analysis/archive worker
```

The MCP server never connects to WAHA, PostgreSQL, Nextcloud, or model providers
directly. Operator-only `/manage/api/*` routes are deliberately not exposed.

## Local Backend

- Backend base URL: `http://<backend-host>:8200/api`
- Auth header: `X-API-Key`
- Session default: `default`
- Current compatibility baseline: `../waha-backend` commit `46acc32`

Never store live API keys in tracked files. Load them from the MCP client's secret
environment or the server-management private credential store.

## Environment Variables

| Variable | Required | Default | Description |
|---|---:|---|---|
| `WAHA_API_URL` | no | `http://localhost:8200/api` | Unified backend API URL |
| `WAHA_API_KEY` | yes | — | Unified backend API key |
| `WAHA_SESSION` | no | `default` | WAHA session |
| `WAHA_SEND_DELAY_MS` | no | `1000` | Non-negative send throttle |

## Current Tool Surface (28)

- Session: status, account info
- Chats: live overview, persistent/live message reads
- Messaging: send, react, edit, delete, copy/forward text
- Media: download, transcribe, generate speech
- Contacts: number check, unified people/groups list, detail
- Store: search, graph, summary, stats, chat-export import
- Auto-reply: enable, disable, status, list (people and groups; contextual mode)
- Automation: media settings get/update/disable, combined health

Person-facing tools use phone digits as the stable identifier; groups use `*@g.us`.
Legacy `@c.us`/`@lid` identifiers remain accepted where the backend supports them.

## Known Backend Boundaries

- Manual `/messages/send` does not currently implement quoted replies. The MCP
  rejects `replyTo` without sending instead of silently sending an unquoted message.
- `/messages/forward` copies stored text into a new message; it does not preserve
  media, sender attribution, or WhatsApp's Forwarded label.
- Public message type filtering still uses `message_type`; some GOWS media is stored
  there as `chat` while the accurate type is only in `normalized_type`.
- Public chat summary is not fully LID-alias-aware and does not accept imported
  `*@import` chat IDs. Use read/search for those histories.
- Nextcloud folder discovery, archive review/actions, and LLM/Motor configuration
  remain LAN-only management functions and are not part of this MCP.

## Development and Tests

```bash
npm ci
npm test                 # hermetic unit/contract suite; no network or WhatsApp writes
npm run build
npm run test:live        # read-only live checks; requires WAHA_API_URL + WAHA_API_KEY
WAHA_TEST_LEVEL=2 npm run test:live  # self-chat writes
WAHA_TEST_LEVEL=3 npm run test:live  # configured contact writes; use deliberately
```

## Release

The MCP is an npm stdio package, not a Docker service. Bump the package version,
run tests/build/pack checks, commit, then push the matching `vX.Y.Z` tag. The tag
workflow publishes `@marcos-heidemann/waha-mcp-server` after re-running tests/build.
The backend is deployed independently through its Portainer-managed workflow.

Do not add the unrelated untracked `tools.yaml` file to this repository.
