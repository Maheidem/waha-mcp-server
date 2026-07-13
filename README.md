# WAHA WhatsApp MCP Server

[![npm](https://img.shields.io/npm/v/@marcos-heidemann/waha-mcp-server)](https://www.npmjs.com/package/@marcos-heidemann/waha-mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

A TypeScript [Model Context Protocol](https://modelcontextprotocol.io/) stdio
server for WhatsApp through a unified WAHA backend. It exposes 28 tools for
messages, contacts, media, transcription, speech generation, automatic voice-note
replies, message-store search, and per-conversation media automation.

## Architecture

```text
MCP client → this package → unified backend /api (:8200)
                                  ├─ PostgreSQL message store
                                  ├─ WAHA live proxy
                                  ├─ transcription and TTS providers
                                  └─ media analysis/archive worker
```

The MCP server only talks to the authenticated `/api` facade. It does not connect
directly to WAHA, databases, Nextcloud, or model providers. LAN-only management
routes for archive review and LLM provider administration are intentionally excluded.

This release targets `waha-backend` commit `46acc32` or a compatible newer build.

## Install

### Claude Code

```bash
claude mcp add waha-whatsapp -- \
  env WAHA_API_URL=http://your-server:8200/api \
      WAHA_API_KEY=your-backend-api-key \
  npx -y @marcos-heidemann/waha-mcp-server
```

### MCP JSON configuration

```json
{
  "mcpServers": {
    "waha-whatsapp": {
      "command": "npx",
      "args": ["-y", "@marcos-heidemann/waha-mcp-server"],
      "env": {
        "WAHA_API_URL": "http://your-server:8200/api",
        "WAHA_API_KEY": "your-backend-api-key"
      }
    }
  }
}
```

## Configuration

| Variable | Required | Default | Description |
|---|---:|---|---|
| `WAHA_API_URL` | no | `http://localhost:8200/api` | Unified backend API URL |
| `WAHA_API_KEY` | yes | — | Value sent as `X-API-Key` |
| `WAHA_SESSION` | no | `default` | WAHA session name |
| `WAHA_SEND_DELAY_MS` | no | `1000` | Minimum delay between outbound sends; non-negative integer |

Older `WAHA_STORE_*` and `WAHA_TRANSCRIPTION_*` variables are no longer used.
Those services are configured behind the unified backend.

## Contact identifiers

Chat-targeting tools use a stable `contactId`:

- Person: phone digits with country code, such as `5521999999999`.
- Group: the stable group JID ending in `@g.us`.
- Legacy `@c.us` and `@lid` aliases remain accepted on routes where the backend
  supports them.
- Imported chat IDs ending in `@import` work with message read/search, but not with
  the backend chat-summary route.

Use `whatsapp_list_contacts` to discover identifiers.

## Tools (28)

| Area | Tool | Purpose |
|---|---|---|
| Session | `whatsapp_session_status` | Connection and account presence |
| Session | `whatsapp_account_info` | Authenticated WhatsApp identity |
| Chats | `whatsapp_list_chats` | Live chat overview with previews |
| Chats | `whatsapp_read_messages` | Persistent history with live fallback and optional mark-read |
| Messaging | `whatsapp_send_text` | Rate-limited text send |
| Messaging | `whatsapp_react` | Add or remove a reaction |
| Messaging | `whatsapp_edit_message` | Edit an outgoing text message |
| Messaging | `whatsapp_delete_message` | Unsend a message |
| Messaging | `whatsapp_forward_message` | Copy stored text into another chat |
| Media | `whatsapp_download_media` | Return images/audio up to 10 MiB inline; save larger/other files in `/tmp` |
| Media | `whatsapp_transcribe_audio` | Transcribe with language and prompt hints |
| Media | `whatsapp_generate_speech` | Generate inline TTS audio; does not send it to WhatsApp |
| Contacts | `whatsapp_check_number` | Check whether a phone is registered |
| Contacts | `whatsapp_list_contacts` | Unified people and groups address book |
| Contacts | `whatsapp_get_contact` | Person or group detail |
| Store | `whatsapp_search_messages` | Search text plus indexed captions, OCR, summaries, tags, and documents |
| Store | `whatsapp_contact_graph` | Shared groups and mutual contacts |
| Store | `whatsapp_chat_summary` | Recent readable history, up to 100 messages |
| Store | `whatsapp_stats` | Activity totals and top chats/contacts |
| Store | `whatsapp_import_chat` | Import a local `.zip`/`.txt` WhatsApp export, up to 100 MiB |
| Auto-reply | `whatsapp_auto_reply_enable` | Enable person/group voice-note replies; optional contextual mode |
| Auto-reply | `whatsapp_auto_reply_disable` | Disable automatic voice-note replies |
| Auto-reply | `whatsapp_auto_reply_status` | Check enabled/found state |
| Auto-reply | `whatsapp_auto_reply_list` | List enabled people and groups |
| Automation | `whatsapp_media_settings_get` | Read per-conversation media policy |
| Automation | `whatsapp_media_settings_update` | Partially update capture/analysis/reply/archive policy |
| Automation | `whatsapp_media_settings_disable` | Turn every media automation flag off for a conversation |
| Automation | `whatsapp_automation_health` | Combined backend/listener/media/worker diagnostics |

### Media automation settings

`whatsapp_media_settings_update` supports:

- `captureEnabled`
- `analyzeImages`
- `analyzeDocuments`
- `whatsappReplyEnabled`
- `includeMediaInRecap`
- `archiveMode`: `off`, `review`, or `auto`
- `fixedNextcloudFolderId`: integer or `null`
- `archiveConfirmationEnabled`
- `allowSensitiveProcessing`
- `askOnReview`

Conversation settings are combined with backend-wide kill switches. Always inspect
returned warnings or call `whatsapp_automation_health` before assuming a feature is
active. The current public health/warning contract does not expose the global gates
for recap inclusion or review questions.

## Current backend limitations

- Manual quote replies are not implemented by the public backend send route.
  Supplying `replyTo` returns an MCP error and sends nothing.
- `whatsapp_forward_message` re-sends stored text. It does not preserve media,
  sender attribution, or WhatsApp's Forwarded label.
- Some current GOWS media is still exposed as stored type `chat`; type filters may
  miss it until the backend public API switches to `normalized_type`.
- Public chat summaries are not fully `@lid` alias-aware. Read/search are the safer
  choices for migrated histories.
- Imported sender identities are history-only and are omitted from
  `whatsapp_list_contacts`; imported `*@import` chats support read/search but not live
  read receipts or chat summaries.
- Durable staged-media preview, Nextcloud folder discovery, archive review/actions,
  and Motor/LLM configuration remain operator-only management functions.

## Development and verification

```bash
npm ci
npm test                  # hermetic unit + backend-contract tests
npm run build
npm pack --dry-run
```

Releases are deployed by pushing a tag that exactly matches the package version,
for example `v2.4.0`. The publish workflow repeats unit tests and the build before
publishing to npm with the repository secret.

Live tests require `WAHA_API_URL` and `WAHA_API_KEY`:

```bash
npm run test:live                         # read-only suites
WAHA_TEST_LEVEL=2 npm run test:live       # includes self-chat writes
WAHA_TEST_LEVEL=3 npm run test:live       # includes configured contact writes
```

The default test and CI paths never contact WhatsApp.

## Security

- Treat the backend API key as a password; never commit it.
- Sending through an unofficial WhatsApp API can trigger anti-abuse controls. Keep
  automation narrow and rate-limited.
- Media and chat exports can contain sensitive data. Review automation policy before
  enabling analysis, replies, or archival.
- Rotate any credential that has previously appeared in Git history.

## License

[MIT](LICENSE)
