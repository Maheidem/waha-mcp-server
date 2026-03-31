# MCP Refactor Plan — Unified Backend via Message Store API

## Goal
Eliminate dual-backend architecture. All MCP tools should go through the Message Store API (:8200) as the single entry point. The API handles routing to Postgres (reads) and WAHA (writes) internally.

## Current State (19 tools, 2 backends)

### Tools using WAHA directly (15):
1. whatsapp_session_status → /sessions
2. whatsapp_account_info → /{session}/me
3. whatsapp_list_chats → /{session}/chats/overview
4. whatsapp_read_messages → /{session}/chats/{id}/messages (with store fallback)
5. whatsapp_send_text → /sendText
6. whatsapp_react → /reaction
7. whatsapp_edit_message → /{session}/chats/{id}/messages/{mid}
8. whatsapp_delete_message → /{session}/chats/{id}/messages/{mid}
9. whatsapp_forward_message → /forwardMessage
10. whatsapp_download_media → /files/{path}
11. whatsapp_transcribe_audio → /files/{path} + Speaches
12. whatsapp_check_number → /checkNumberStatus
13. whatsapp_list_contacts → /contacts/all (with store fallback)
14. whatsapp_list_groups → /{session}/groups
15. whatsapp_get_group_info → /{session}/groups/{id}

### Tools using Message Store only (4):
16. whatsapp_search_messages → GET /messages
17. whatsapp_contact_graph → GET /contacts/{id}/graph
18. whatsapp_chat_summary → GET /chats/{jid}/summary
19. whatsapp_stats → GET /stats

## Target State — All tools via Message Store API (:8200)

### Mapping: MCP Tool → API :8200 Endpoint

| # | MCP Tool | Current Backend | Target :8200 Endpoint | Gap? |
|---|----------|----------------|----------------------|------|
| 1 | session_status | WAHA | GET /api/session/status | Already exists |
| 2 | account_info | WAHA | GET /api/account | Already exists |
| 3 | list_chats | WAHA | GET /api/chats | Exists (but no profile pic or last msg preview) |
| 4 | read_messages | WAHA+Store | GET /api/messages?chat_jid=X | Exists |
| 5 | send_text | WAHA | POST /api/messages/send | Already exists |
| 6 | react | WAHA | POST /api/messages/react | Already exists |
| 7 | edit_message | WAHA | PUT /api/messages/edit | Already exists |
| 8 | delete_message | WAHA | DELETE /api/messages/{id} | Already exists |
| 9 | forward_message | WAHA | POST /api/messages/forward | Already exists |
| 10 | download_media | WAHA | GET /api/media/{file_id} | Exists but needs to return binary |
| 11 | transcribe_audio | WAHA+Speaches | POST /api/transcribe | Already exists |
| 12 | check_number | WAHA | — | **NEEDS NEW ENDPOINT** |
| 13 | list_contacts | WAHA+Store | GET /api/contacts | Exists |
| 14 | list_groups | WAHA | — | **NEEDS NEW ENDPOINT** |
| 15 | get_group_info | WAHA | — | **NEEDS NEW ENDPOINT** |
| 16 | search_messages | Store | GET /api/messages?search=X | Exists |
| 17 | contact_graph | Store | GET /api/contacts/{id}/graph | Exists |
| 18 | chat_summary | Store | GET /api/chats/{jid}/summary | Exists |
| 19 | stats | Store | GET /api/stats | Exists |

## Gaps to Fill in API :8200

### 1. GET /api/contacts/check?phone=X (NEW)
Proxy to WAHA: GET /checkNumberStatus?phone=X&session=default

### 2. GET /api/groups (NEW)
Proxy to WAHA: GET /{session}/groups
With pagination (client-side, matching MCP pattern)

### 3. GET /api/groups/{groupId} (NEW)
Proxy to WAHA: GET /{session}/groups/{groupId} + /{session}/groups/{groupId}/participants

### 4. Fix GET /api/media/{file_id}
Currently returns JSONResponse. Needs to return actual binary data with correct Content-Type.

### 5. Fix GET /api/chats (enrich)
Add last_message_preview and profile picture from WAHA (optional, performance hit).
Alternative: MCP tool can just work with what we have (name, count, last_message_at).

## MCP Changes

### 1. Eliminate WahaClient
- Remove `src/services/waha-client.ts`
- All tools use MessageStoreClient (renamed to ApiClient)

### 2. Simplify config
- Remove `WAHA_API_URL` — replaced by single API URL
- Remove `WAHA_STORE_URL` / `WAHA_STORE_API_KEY` — no longer separate
- New config:
  - `WAHA_API_URL` → points to :8200/api (not :33001)
  - `WAHA_API_KEY` → Message Store API key
  - `WAHA_SESSION` → kept (passed as param in proxied calls)
  - Transcription config removed (handled server-side)

### 3. Update all tools
- Replace `client.get/post` calls with equivalent API :8200 calls
- Remove smart fallback logic (API handles it)
- Remove throttleSend() (API can handle rate limiting)
- Remove media download complexity (API proxies it)

### 4. Remove conditional store tool registration
- All 19 tools always registered (no more "if store configured")

## Execution Order

1. Add missing endpoints to API :8200 (server-side)
2. Fix media proxy endpoint
3. Test all API endpoints work
4. Refactor MCP: replace WahaClient with unified ApiClient
5. Update config
6. Update tests
7. Test each tool against live WhatsApp (self-chat)
8. Commit, push, publish npm
