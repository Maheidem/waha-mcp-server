# WAHA Dashboard Configuration Research (2026-03-11)

## Three Independent Auth Layers

| Layer | What it protects | Env vars | Notes |
|-------|-----------------|----------|-------|
| **Dashboard login** | `/dashboard/` route (HTTP Basic Auth) | `WAHA_DASHBOARD_PASSWORD` (username defaults to `waha`) | First gate to access dashboard UI |
| **API Key** | All `/api/...` endpoints (`X-Api-Key` header) | `WAHA_API_KEY` | Server-side auth for all API calls |
| **Swagger login** | `/` Swagger UI (HTTP Basic Auth) | `WHATSAPP_SWAGGER_USERNAME` + `WHATSAPP_SWAGGER_PASSWORD` | API docs access |

## Dashboard API Key Issue

The WAHA dashboard is a **client-side Vue.js SPA** running in the browser. It does NOT automatically know the `WAHA_API_KEY` — there is no env var that feeds it to the frontend.

On first load (empty localStorage), it creates a default server entry with a **hardcoded API key of `"admin"`**:

```javascript
// Dashboard stores server config in browser localStorage under key "servers"
// Default entry uses key: "admin" which won't match your actual WAHA_API_KEY
```

**Fix**: After logging into the dashboard, edit the server entry and replace the API key with your actual `WAHA_API_KEY` value. One-time step per browser.

## CORE Tier Limitations

- No auto-start sessions on boot (`WAHA_START_SESSION` is PLUS-only)
- Health endpoint `/api/health` returns 422 ("Plus version only for WEBJS engine")
- Single worker only
- **Workaround**: Self-healing healthcheck script that auto-starts session if not running

## Credential Auto-Generation

If `WAHA_API_KEY` is not set, WAHA generates new random credentials on EVERY restart. Always set it explicitly in the compose.

## Sources

- WAHA Dashboard Docs: https://waha.devlike.pro/docs/how-to/dashboard/
- WAHA Security Docs: https://waha.devlike.pro/docs/how-to/security/
- WAHA Config Docs: https://waha.devlike.pro/docs/how-to/config/
- GitHub: https://github.com/devlikeapro/waha
