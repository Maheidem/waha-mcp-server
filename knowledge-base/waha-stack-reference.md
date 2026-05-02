# WAHA

WhatsApp HTTP API + webhook receiver — Stack 50 (Portainer).

## Quick Reference
- **Stack ID**: 50 | **Compose**: `/data/compose/50/docker-compose.yml`
- **Image**: `devlikeapro/waha:latest`
- **Container**: `waha-waha-1` | **Port**: 33001 → 3000
- **API**: `http://localhost:33001/api`
- **Sessions**: `/home/maheidem/docker/waha/sessions`
- **Webhook logs**: `/home/maheidem/docker/waha/webhook-logs/events.jsonl`
- **Credentials**: `../.claude.local.md` (API key)

## Services
- **WAHA** — WhatsApp Web API (REST), needs QR scan to activate session
- **Redis** (`waha-redis-1`) — Session storage, port 6379, password-protected

## Current State
- API key is set in compose env vars
- Health check returns 401 (auth required) — service works fine, just shows "unhealthy" in Docker
- **No active WhatsApp session** — needs QR code scan to connect

## Webhook
- Webhook receiver logs all events to `events.jsonl`
- Format: one JSON object per line with timestamp, event type, and payload

## Gotchas
- Health check shows unhealthy due to auth — this is expected behavior
- QR code scan required for initial session setup (interactive, can't automate)
- Sessions persist across container restarts via mounted volume

## Related
- Server management: `../CLAUDE.md`
- Research: `../docs/research/waha-dashboard-configuration-2026-03-11.md`
- Credentials: `../.claude.local.md`
