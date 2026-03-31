# WAHA WhatsApp MCP Server

MCP server exposing 20 WhatsApp tools to Claude via a unified backend API.

## Architecture

```
Claude/MCP Client → [This MCP Server] → [Message Store API :8200] → PostgreSQL (reads) + WAHA :33001 (writes)
```

Single backend at `:8200` handles everything. The MCP server never talks to WAHA directly.

### Backend API (what the MCP server connects to)

| Property | Value |
|----------|-------|
| **Base URL** | `http://192.168.31.154:8200/api` |
| **API Key** | `d2a2a6708098aa35cec7d51b3b974399fc79d2721370f9f2f00ca5c2b525cbc1` |
| **Auth Header** | `X-API-Key` |

### WAHA Instance (behind the backend, not accessed directly)

| Property | Value |
|----------|-------|
| **Host** | `192.168.31.154` (Proxmox LXC) |
| **WAHA URL** | `http://192.168.31.154:33001/api` |
| **Dashboard** | `http://192.168.31.154:33001/dashboard` |
| **Swagger** | `http://192.168.31.154:33001/` |
| **WAHA API Key** | `46254197d4399f0812c6f80093bb5577` |
| **Version** | v2026.3.4 |
| **Engine** | GOWS (Go WebSocket -- direct protocol, no browser) |
| **Tier** | CORE (free) |
| **Session** | `default` |
| **Connected Phone** | +55 24 99227-2331 (Marcos Heidemann) |
| **WhatsApp ID** | `5524992272331@c.us` |

### CORE Tier Limitations
- **Can send**: Text messages only
- **Cannot send**: Images, video, audio, documents, stickers (PLUS tier required, $19/mo)
- **Can receive**: All message types (text, media, etc.)
- **Sessions**: 1 max

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `WAHA_API_URL` | No | `http://localhost:8200/api` | Backend API base URL |
| `WAHA_API_KEY` | **Yes** | -- | Backend API key |
| `WAHA_SESSION` | No | `default` | WAHA session name |
| `WAHA_SEND_DELAY_MS` | No | `1000` | Min delay (ms) between sends |

## MCP Config (Mac)

```json
{
  "waha-whatsapp": {
    "command": "npx",
    "args": ["--yes", "@marcos-heidemann/waha-mcp-server"],
    "env": {
      "WAHA_API_URL": "http://192.168.31.154:8200/api",
      "WAHA_API_KEY": "d2a2a6708098aa35cec7d51b3b974399fc79d2721370f9f2f00ca5c2b525cbc1"
    }
  }
}
```

## Tools (20 total)

### Session (2)
1. `whatsapp_session_status` -- Connection status, phone, display name
2. `whatsapp_account_info` -- Authenticated account details

### Chats (2)
3. `whatsapp_list_chats` -- Recent chats with previews and profile pics (live)
4. `whatsapp_read_messages` -- Read messages with full-text search, sender filter, date range (store + live fallback)

### Messaging (5)
5. `whatsapp_send_text` -- Send text (with optional quote-reply)
6. `whatsapp_react` -- React to message with emoji
7. `whatsapp_edit_message` -- Edit own sent message
8. `whatsapp_delete_message` -- Delete (unsend) message
9. `whatsapp_forward_message` -- Forward message to another chat

### Media (2)
10. `whatsapp_download_media` -- Download image/audio/video/doc from message
11. `whatsapp_transcribe_audio` -- Transcribe voice message (server-side Whisper)

### Groups (2)
12. `whatsapp_list_groups` -- List groups with names and owners
13. `whatsapp_get_group_info` -- Group details with participants

### Contacts (2)
14. `whatsapp_check_number` -- Verify phone number on WhatsApp
15. `whatsapp_list_contacts` -- Contacts enriched with Google Contacts + activity stats

### Message Store (5)
16. `whatsapp_search_messages` -- Full-text search across all history
17. `whatsapp_contact_graph` -- Social graph: shared groups, connections
18. `whatsapp_chat_summary` -- Readable chat summary with sender names
19. `whatsapp_stats` -- Activity dashboard: totals, top chats, top contacts
20. `whatsapp_import_chat` -- Import WhatsApp chat export (ZIP/TXT) into store

## Backend API Endpoints

All routes under `http://192.168.31.154:8200/api`:

### Data (PostgreSQL)
```
GET  /messages              # Search messages (full-text, filters)
GET  /messages/{id}         # Get single message
GET  /contacts              # List contacts (enriched)
GET  /contacts/{id}         # Contact detail
GET  /contacts/{id}/graph   # Social graph
GET  /chats                 # List chats
GET  /chats/{jid}           # Chat detail with members
GET  /chats/{jid}/summary   # Readable chat summary
GET  /stats                 # Activity dashboard
```

### Live (proxied to WAHA)
```
GET  /chats/live            # Live chats with previews/profile pics
GET  /chats/{id}/messages/live  # Live messages from WAHA
POST /chats/{id}/messages/read  # Mark as read
GET  /session/status        # Session status
GET  /account               # Account info
GET  /contacts/all          # All contacts (live)
GET  /contacts/check        # Check number exists
GET  /groups                # List groups
GET  /groups/{id}           # Group info with participants
```

### Actions (proxied to WAHA)
```
POST   /messages/send       # Send text
POST   /messages/react      # React to message
PUT    /messages/edit        # Edit message
DELETE /messages/{id}        # Delete message
POST   /messages/forward     # Forward message
GET    /media/{session}/{id} # Download media binary
POST   /transcribe           # Transcribe audio (Speaches)
POST   /messages/import      # Import chat export
```

### Enrichment
```
POST /contacts/sync         # Sync contacts from WAHA
POST /contacts/import       # Import Google Contacts CSV
```

## Server-Side Expert

The home server at `192.168.31.154` is managed by another Claude Code instance. If you need:
- Server-side debugging (container logs, network issues, config changes)
- To modify the WAHA or Message Store stack
- Info about other services on the server

```bash
ssh 192.168.31.154
# Then run: claude
```

## Knowledge Base
Reference docs in `knowledge-base/`:
- `waha-stack-reference.md` -- Server-side stack config, volumes, networking
- `waha-dashboard-configuration.md` -- Auth layers, dashboard setup, CORE tier limits
- `whatsapp-api-alternatives.md` -- Full research on WhatsApp API landscape (2026-03-29)

## Security Notes
- API key gives full access -- treat it like a password
- WhatsApp session = your personal phone number -- be careful with automated messaging
- Rate limit sends to avoid WhatsApp detection/bans (unofficial API)
- Never send to unknown numbers without user confirmation
- Error messages strip internal IPs before returning to MCP clients
