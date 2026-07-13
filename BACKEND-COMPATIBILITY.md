# Backend Compatibility Audit

Audit date: 2026-07-13 UTC.

## Baseline and scope

- MCP baseline: `3f5e490` (`v2.3.0`, 2026-05-06 14:06:37 UTC)
- Matching backend baseline: `f77e3c8` (2026-05-06 14:06:54 UTC)
- Audited backend: `46acc32` (2026-07-13)
- Delta: 54 backend commits
- Reproducibility note: local backend `master` is 49 commits ahead of
  `origin/master`, which currently ends at `1115f5a`.

No public `/api` route was removed. Five public routes were added:

- `GET /api/contacts/{contactId}/media-settings`
- `PUT /api/contacts/{contactId}/media-settings`
- `DELETE /api/contacts/{contactId}/media-settings`
- `GET /api/media/health`
- `GET /api/worker/health`

## MCP impact matrix

| Backend change | MCP impact | v2.4.0 response |
|---|---|---|
| Group and contextual auto-reply | Direct | Person/group enable, disable, status, list; contextual input |
| Message contextual fields | Direct | `contextualBody` and `contextNote` returned by read/search |
| Media/OCR/document search rollup | Direct semantics | Docs/tests allow media-only matches with `body:null` |
| Media settings CRUD | Direct | Three per-conversation policy tools |
| Media/worker/listener health | Direct | Combined automation health tool |
| Voice provider fallback and ASR prompt | Direct | Language/prompt inputs and 10-minute client timeout |
| TTS endpoint | Optional existing capability | Inline speech-generation tool with 10 MiB output cap |
| GOWS media URL changes | Compatibility fix | Resolve stored `media_url`, then legacy ID fallback |
| LID alias expansion | Compatibility/test fix | Canonical search accepts all mapped chat JIDs |
| Management console/Motor endpoints | Deliberately excluded | LAN-source guarded, not API-key authenticated |
| Archive routing/worker internals | Behavioral only | Controlled through settings and health; no admin tools |

## All 54 backend commits

### Contextual and group auto-reply (direct MCP impact)

1. `69fc603` — contextual transcription and group-auto-reply schema
2. `c39d1be` — guarded contextual transcript cleanup and recap
3. `32f29f9` — management UI, contextual fields, group toggles, ASR prompt
4. `6ad91a6` — route shadowing, connection-pool, and overview fixes
5. `1115f5a` — per-chat contextual flags and unified DM conversations

### Media pipeline foundation (public settings/search/health impact)

6. `31cb9ac` — GOWS media normalizer with edit/revoke target resolution
7. `494fa15` — attachment, queue, enrichment, action, settings, and search schema
8. `2027f20` — durable worker queue
9. `8abb28b` — streaming capture, staging quota, and cleanup
10. `35477cd` — GOWS type/edit/revoke fixes and attachment metadata capture
11. `b91098a` — deterministic inspection, extraction, and prohibited-type policy
12. `c83dbc5` — typed WAHA send outcomes (internal helper; public send unchanged)
13. `38f3e89` — vision analysis, outbound replies, and reconciliation
14. `6db3e50` — Nextcloud client, folder catalog, and archive routing
15. `00a642d` — media settings, review, metrics, preview, and aggregate search API
16. `928a649` — media review UI
17. `13425bd` — worker Portainer deployment, staging volume, and runbook
18. `62d63a6` — higher analysis token budget
19. `54d7ca9` — pass folder catalog into document analysis

### Archive routing and refinement (behavior behind settings)

20. `385d487` — Portuguese names with document dates and sender labels
21. `a5a3a5f` — whole-drive catalog and hierarchical agreement routing
22. `e5d2eed` — ancestor-agreement handling
23. `6f73a6c` — interactive owner routing questions
24. `6dd4a6d` — semantic natural-language answer matching
25. `bf8c7b6` — ignore the pipeline's own messages as owner answers
26. `dfc38b3` — archive notification test-stub update
27. `ca00204` — documents-only, household-owned relevance funnel
28. `70c5a0f` — canonical taxonomy and learned type-to-folder rules
29. `8441714` — real-tree rules and emitted-NF split
30. `0061065` — folder routing profiles and closed-episode annotation

### Management console only (not exposed by MCP)

31. `5d5f2a2` — Central de Automação console rebuild
32. `c53bb58` — counts, translations, and mobile layout fixes
33. `246b24a` — per-route scroll persistence
34. `2509f0b` — restore message-store overview
35. `c6a6445` — batch conversation settings
36. `4791342` — unified settings panels and dependency gating
37. `c60dfe9` — include all registered providers in queue view
38. `0004c8e` — 20-finding management E2E audit fixes
39. `057eee4` — clickable Nextcloud folder paths

### LLM gateway and Motor v2 (ASR behavior; management API otherwise)

40. `d7eaeff` — multi-style provider gateway, encrypted keys, per-step resolver
41. `8d5b189` — provider/step management and connection tests
42. `75bc1cb` — central default prompts
43. `f01df4c` — chains, capabilities, endpoint health, waiting-provider schema
44. `294242f` — modality fallback chains and endpoint serialization
45. `1d90c45` — outage parking, health probing, auto-drain, serial LLM lane
46. `9a0684e` — voice ASR fallback chain
47. `8c732cf` — Motor v2 chains/capabilities/flows/queue/concurrency endpoints
48. `cd83498` — Motor v2 UI
49. `b94fed3` — ASR probe health fallback
50. `028e9f6` — real voice-provider test and graceful model listing
51. `3547f46` — hosted OpenAI `max_completion_tokens`
52. `46acc32` — valid JPEG for vision capability probes

### Deployment only

53. `0ee37f6` — keep worker source mounts synchronized
54. `84bf0ea` — persist provider-secret references on API and worker

## Remaining upstream backend limitations

- `GET /contacts/{id}/auto-reply` and the list route omit contextual state.
- Public `/messages/send` ignores `reply_to`; MCP now rejects manual quote requests
  without sending.
- Public `/messages/forward` copies text rather than performing a native forward.
- Public message filters/output use `message_type`, not accurate `normalized_type`.
- Public sender filtering accepts names or exact phone digits, not sender JIDs.
- Public contacts/summary are not fully alias-aware across `@c.us` and `@lid`.
- Imported `*@import` histories work in read/search but not live read receipts or chat
  summary; synthetic imported senders are not valid live contact targets.
- Public media settings warnings/health omit the global recap-inclusion and
  review-question gates.
- There is no authenticated public staged-media, folder discovery, archive-review,
  or archive-action endpoint.
- The deployed backend's 49 unpushed commits should be pushed/tagged for recovery.

## Verification snapshot

At audit time, the deployed backend matched local `46acc32`; database and WAHA health
were good, the media worker was healthy, the listener was connected, current migrations
were present, and recent service logs showed no startup/error regression. MCP v2.4.0
passed its hermetic suite and the read-only live integration suite.
