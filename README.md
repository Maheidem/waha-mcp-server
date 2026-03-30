# WAHA WhatsApp MCP Server

[![npm](https://img.shields.io/npm/v/@marcos-heidemann/waha-mcp-server)](https://www.npmjs.com/package/@marcos-heidemann/waha-mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org)

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that lets Claude interact with WhatsApp through the [WAHA](https://waha.devlike.pro/) (WhatsApp HTTP API) REST API. 19 tools for reading chats, sending/editing/deleting/forwarding messages, downloading media, transcribing voice messages, managing groups and contacts, reacting to messages, full-text search, contact graphs, chat summaries, and activity stats.

Built with TypeScript, the MCP SDK, and Axios. Stdio transport, zero browser dependencies.

## Features

- **19 Tools** -- Check session, list chats (with previews), read messages (with mark-as-read), download media, transcribe audio, send/edit/delete/forward text, react, verify numbers, list contacts, list groups, group info, search messages, contact graph, chat summary, stats
- **Message Store Integration** -- Optional persistent message history with full-text search, contact graphs, chat summaries, and activity stats
- **Rate-Limited Sends** -- Built-in throttle between outbound messages to avoid WhatsApp detection
- **Pagination** -- All list endpoints support limit/offset for large datasets
- **Graceful Errors** -- WAHA API errors mapped to clear, actionable MCP error messages
- **Type-Safe** -- Full TypeScript with Zod schema validation on all tool inputs

## Prerequisites

A running [WAHA](https://waha.devlike.pro/) instance with an authenticated WhatsApp session. WAHA provides the WhatsApp REST API that this MCP server connects to.

You will need:
- Your WAHA API base URL (e.g., `http://your-server:3000/api`)
- Your WAHA API key

## Installation

### Claude Code

```bash
claude mcp add waha-whatsapp -- npx -y @marcos-heidemann/waha-mcp-server \
  -e WAHA_API_URL=http://your-waha:3000/api \
  -e WAHA_API_KEY=your-api-key
```

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "waha-whatsapp": {
      "command": "npx",
      "args": ["-y", "@marcos-heidemann/waha-mcp-server"],
      "env": {
        "WAHA_API_URL": "http://your-waha:3000/api",
        "WAHA_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "waha-whatsapp": {
      "command": "npx",
      "args": ["-y", "@marcos-heidemann/waha-mcp-server"],
      "env": {
        "WAHA_API_URL": "http://your-waha:3000/api",
        "WAHA_API_KEY": "your-api-key"
      }
    }
  }
}
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `WAHA_API_URL` | No | `http://localhost:3000/api` | WAHA API base URL (no trailing slash) |
| `WAHA_API_KEY` | **Yes** | -- | WAHA API key for authentication |
| `WAHA_SESSION` | No | `default` | WAHA session name |
| `WAHA_SEND_DELAY_MS` | No | `1000` | Minimum delay (ms) between outbound messages |
| `WAHA_TRANSCRIPTION_API_KEY` | No | -- | API key for transcription (OpenAI, Groq, or self-hosted) |
| `WAHA_TRANSCRIPTION_URL` | No | `https://api.openai.com/v1/audio/transcriptions` | Transcription endpoint (any OpenAI-compatible API) |
| `WAHA_TRANSCRIPTION_MODEL` | No | `whisper-1` | Transcription model (`whisper-1` for OpenAI, `large-v3` for faster-whisper) |
| `WAHA_TRANSCRIPTION_LANGUAGE` | No | auto-detect | Language hint (ISO 639-1, e.g., `pt` for Portuguese) |
| `WAHA_STORE_URL` | No | -- | Message Store API base URL (enables search, graph, summary, stats tools) |
| `WAHA_STORE_API_KEY` | Conditional | -- | Message Store API key (required when `WAHA_STORE_URL` is set) |

## Tools

### Session

#### `whatsapp_session_status`

Check if the WhatsApp session is connected and working.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| -- | -- | -- | No parameters |

Returns session name, status (`WORKING`/`STOPPED`), connected phone number, display name, and last activity timestamp.

#### `whatsapp_account_info`

Get the authenticated WhatsApp account's phone number, display name, and WhatsApp ID.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| -- | -- | -- | No parameters |

### Chats

#### `whatsapp_list_chats`

List recent WhatsApp chats with last message preview and profile pictures.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `limit` | number (1-100) | No | 20 | Number of chats to return |
| `offset` | number | No | 0 | Pagination offset |

Returns chat ID, name, profile picture URL, and a preview of the last message (body, sender, timestamp, hasMedia).

#### `whatsapp_read_messages`

Read messages from a specific chat. Supports pagination via offset to go back in time, and timestamp filters to read messages from a specific date range. Returns message IDs needed for reactions and replies.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `chatId` | string | Yes | -- | Chat ID (e.g., `5511999999999@c.us` or `id@g.us`) |
| `limit` | number (1-100) | No | 20 | Number of messages to return |
| `offset` | number | No | 0 | Skip N messages for pagination (go further back in history) |
| `timestampFrom` | number | No | -- | Only messages after this Unix timestamp (seconds) |
| `timestampTo` | number | No | -- | Only messages before this Unix timestamp (seconds) |
| `fromMe` | boolean | No | -- | Filter: `true` = only sent, `false` = only received |
| `downloadMedia` | boolean | No | false | Include media download URLs |
| `markAsRead` | boolean | No | false | Mark messages as read after fetching (for inbox triage) |

### Messaging

#### `whatsapp_send_text`

Send a text message. WAHA CORE tier supports text only (no images, video, audio, or documents).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `chatId` | string | Yes | Recipient chat ID (`5511999999999@c.us` for contacts, `id@g.us` for groups) |
| `text` | string | Yes | Message text (max 65,536 chars) |
| `replyTo` | string | No | Message ID to quote-reply to |

#### `whatsapp_react`

React to a message with an emoji. Send an empty string to remove a reaction.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `chatId` | string | Yes | Chat ID where the message is |
| `messageId` | string | Yes | Message ID to react to |
| `reaction` | string | Yes | Emoji to react with (empty string removes reaction) |

#### `whatsapp_edit_message`

Edit a previously sent text message. Only works on your own messages.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `chatId` | string | Yes | Chat ID containing the message |
| `messageId` | string | Yes | Message ID to edit (must be your own) |
| `text` | string | Yes | New text content |

#### `whatsapp_delete_message`

Delete (unsend) a message from a chat. Removes it for everyone.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `chatId` | string | Yes | Chat ID containing the message |
| `messageId` | string | Yes | Message ID to delete |

#### `whatsapp_forward_message`

Forward a message from one chat to another. Shows "Forwarded" label and preserves original sender.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `chatId` | string | Yes | Destination chat ID to forward TO |
| `messageId` | string | Yes | Message ID to forward (from `whatsapp_read_messages`) |

### Media

#### `whatsapp_download_media`

Download media (image, audio, video, document) from a WhatsApp message. Images and audio are returned inline so Claude can see/hear them directly. Videos and documents are saved to `/tmp/whatsapp-media/`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `chatId` | string | Yes | Chat ID containing the message |
| `messageId` | string | Yes | Message ID with media (from `whatsapp_read_messages` with `hasMedia: true`) |

#### `whatsapp_transcribe_audio`

Transcribe a WhatsApp voice message to text using OpenAI Whisper (or any compatible API). Optionally replies to the audio message with the transcription.

Requires `WAHA_TRANSCRIPTION_API_KEY` to be configured.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `chatId` | string | Yes | -- | Chat ID containing the audio message |
| `messageId` | string | Yes | -- | Message ID of the audio to transcribe |
| `replyWithTranscription` | boolean | No | false | If true, sends transcription as a WhatsApp reply to the audio |

### Groups

#### `whatsapp_list_groups`

List all WhatsApp groups you are a member of.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `limit` | number (1-100) | No | 20 | Number of groups to return |
| `offset` | number | No | 0 | Pagination offset |

#### `whatsapp_get_group_info`

Get information about a WhatsApp group including all participants with phone numbers and admin status.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `groupId` | string | Yes | Group chat ID (ending in `@g.us`, from `whatsapp_list_chats`) |

### Contacts

#### `whatsapp_check_number`

Verify if a phone number is registered on WhatsApp before sending a message.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `phone` | string | Yes | Phone number with country code, no spaces or dashes (e.g., `5511999999999`) |

#### `whatsapp_list_contacts`

List WhatsApp contacts with names and IDs.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `limit` | number (1-100) | No | 20 | Maximum contacts to return |
| `offset` | number | No | 0 | Pagination offset |

### Message Store (optional)

These tools require a running [Message Store](https://github.com/Maheidem/waha-message-store) API instance. Set `WAHA_STORE_URL` and `WAHA_STORE_API_KEY` to enable them. When the Message Store is configured, `whatsapp_read_messages` and `whatsapp_list_contacts` are also upgraded with persistent history, full-text search, and activity stats.

#### `whatsapp_search_messages`

Search across all WhatsApp message history. Supports full-text search, date ranges, sender filtering, and message type filtering.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `search` | string | Yes | -- | Text to search for (case insensitive) |
| `chatId` | string | No | -- | Scope search to a specific chat JID |
| `sender` | string | No | -- | Filter by sender name or JID |
| `since` | string | No | -- | ISO date string -- messages after this date |
| `until` | string | No | -- | ISO date string -- messages before this date |
| `type` | string | No | -- | Message type filter: `chat`, `image`, `album`, `e2e_notification` |
| `fromMe` | boolean | No | -- | Filter: `true` = sent, `false` = received |
| `limit` | number (1-100) | No | 20 | Results per page |
| `offset` | number | No | 0 | Pagination offset |

#### `whatsapp_contact_graph`

Get social graph for a contact -- shared groups, mutual connections, and interaction stats.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `contactId` | number | Yes | Numeric contact ID from the Message Store |

Returns contact info (name, JID, first/last seen), shared groups with message counts, and mutual connections.

#### `whatsapp_chat_summary`

Get a readable summary of recent messages in a chat, optimized for readability.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `chatId` | string | Yes | -- | Chat JID (e.g., `5511999999999@c.us` or `id@g.us`) |
| `limit` | number (1-200) | No | 50 | Number of recent messages to include |

Returns chat metadata (name, type, message count, date range) and messages with sender name, body, timestamp, and type.

#### `whatsapp_stats`

Overview dashboard of WhatsApp activity. No parameters needed.

Returns:
- **Totals**: messages, contacts, chats, groups, DMs
- **Activity**: messages today, messages this week
- **Top 5 chats** by message count
- **Top 5 contacts** by message count

## WAHA CORE Tier Limitations

This server works with the free WAHA CORE tier, which has these constraints:

- **Can send**: Text messages only
- **Cannot send**: Images, video, audio, documents, stickers (requires PLUS tier at $19/mo)
- **Can receive**: All message types (text, media, etc.)
- **Sessions**: 1 maximum

## Troubleshooting

### "WAHA_API_KEY environment variable is required"

The server requires `WAHA_API_KEY` to be set. Make sure it is included in your MCP client config's `env` block.

### "Cannot reach WAHA server"

The server could not connect to the WAHA instance at the configured `WAHA_API_URL`. Verify:
- The WAHA container is running
- The URL is reachable from the machine running the MCP server
- The port is correct (default WAHA port is 3000)

### "WAHA API key rejected" (401)

The API key is wrong. Check the `WAHA_API_KEY` value matches your WAHA instance configuration.

### "Session not found"

The configured session name does not exist on the WAHA instance. Check `WAHA_SESSION` or ensure the `default` session is started.

### Server not starting

Check Node.js version with `node --version`. Requires Node.js >= 18.

Try running the server directly in your terminal to see error output:

```bash
WAHA_API_URL=http://your-waha:3000/api WAHA_API_KEY=your-key npx @marcos-heidemann/waha-mcp-server
```

## Development

```bash
git clone https://github.com/Maheidem/waha-mcp-server.git
cd waha-mcp-server
npm install
npm run build
```

### Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Compile TypeScript |
| `npm test` | Run integration tests against a live WAHA instance |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:live` | Run tests with verbose output |
| `npm run dev` | Start in dev mode with tsx |

### Testing

Tests run against a live WAHA instance using in-memory MCP transport (no stdio). Set `WAHA_API_URL` and `WAHA_API_KEY` environment variables, then:

```bash
npm test
```

Tests are organized by risk level:

| Level | File | Description |
|-------|------|-------------|
| 1 | `level1-readonly.test.ts` | Read-only operations (session, chats, messages, contacts) |
| 2 | `level2-self-write.test.ts` | Sends messages to your own chat only |
| 3 | `level3-contact-write.test.ts` | Sends to an approved test contact (requires `WAHA_TEST_LEVEL=3`) |
| -- | `error-handling.test.ts` | Invalid inputs, server resilience after errors |

Level 3 tests are skipped by default. Set `WAHA_TEST_LEVEL=3` to enable them.

## Contributing

Contributions are welcome.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes with tests
4. Ensure `npm test` passes
5. Submit a pull request

## License

[MIT](LICENSE)
