# @ahmadmcer/whatsapp-mcp

> Production-grade Model Context Protocol (MCP) server integrated with WhatsApp Web via [Baileys](https://github.com/WhiskeySockets/Baileys), engineered with a **Daemon-First** architecture.

`whatsapp-mcp` allows AI assistants (such as Claude Desktop, Cursor, Antigravity, and Cline) to search and read conversations, retrieve messages with surrounding conversational context, send text and rich media (images, audio, video, documents, stickers), react with emojis, manage groups, and handle WhatsApp multi-device authentication—all running locally with zero secrets leaked.

---

## Why Daemon-First? (Avoiding Stdio)

WhatsApp Web enforces a strict protocol rule: **only one active WebSocket session per paired device credential**.

```
❌ The Stdio Problem (Multiple Agents Conflict):
Agent 1 (Cursor)      --> spawns npx whatsapp-mcp (Stdio) ---> WA Socket A \_ CONFLICT LOOP!
Agent 2 (Antigravity) --> spawns npx whatsapp-mcp (Stdio) ---> WA Socket B /  (Code 440: replaced)

✔ The Daemon Solution (Centralized Shared Server):
Agent 1 (Cursor)      ---\
Agent 2 (Antigravity) -----> HTTP (http://127.0.0.1:3000/mcp) ---> [ whatsapp-mcp Daemon ] ---> 1 Active WA Socket
Agent 3 (Phone/Tailscale)-/
```

Running `whatsapp-mcp` as a standalone daemon provides critical advantages:
1. **Zero Connection Collisions**: Maintains exactly **one persistent WebSocket connection** to WhatsApp. Multiple agents connect over Streamable HTTP without kicking each other offline (`statusCode: 440 conflict: replaced`).
2. **Centralized Anti-Ban Rate Limiter**: All outgoing messages from every agent share a single FIFO queue with randomized human typing jitter (1000–3000ms), protecting your WhatsApp account from spam detection.
3. **Single Database Writer**: SQLite (`better-sqlite3` in WAL mode) is accessed safely by a single process, avoiding file lock contention.
4. **Multi-Agent & Multi-Device Access**: Simultaneous access for local IDE agents, secondary laptops, and mobile devices over Tailscale or LAN.

---

## Features

- **Daemon-First Transport**: Powered by **Streamable HTTP** (`/mcp`, MCP Spec 2025-03-26) and legacy Server-Sent Events (`/sse`, MCP Spec 2024-11-05).
- **Background Daemon CLI**: Start, monitor, and stop the daemon directly via `npx @ahmadmcer/whatsapp-mcp --daemon`, `status`, and `stop`.
- **Multi-Device Authentication**: Interactive terminal login supporting both ASCII QR code scanning and phone number pairing codes.
- **Embedded SQLite Storage**: Built on `better-sqlite3` with WAL mode. Messages, chats, contacts, and groups are indexed locally, powering instant queries, FTS5 full-text search, and fulfilling Baileys' Signal retry lookups (`getMessage`).
- **Safety & Anti-Ban Rate Limiter**: Simulates human typing presence (`composing`) with 1000–3000ms randomized jitter before sending messages. All mutating tools include an optional `dryRun` mode.
- **Optional Endpoint Security**: Secure your `/mcp` endpoint with `--api-key <token>` or `MCP_API_KEY` for remote/public network deployments.
- **Rich Media Pipeline**: Automatically decrypts and caches incoming images, audio, video, and documents to `./data/media/`. Includes base64 data URIs for images under 1MB.

---

## Quick Start

### 1. Authenticate with WhatsApp

Pair your WhatsApp account once (stored securely in `~/.whatsapp-mcp/auth_info/`):

```bash
# Instant interactive login (supports ASCII QR code & phone pairing code)
npx -y @ahmadmcer/whatsapp-mcp login
```

Choose your preferred pairing method:
1. **Scan QR Code**: Scan the ASCII QR code printed directly in your terminal using WhatsApp on your phone (`Settings` -> `Linked Devices` -> `Link a Device`).
2. **Pairing Code**: Enter your phone number with country code (e.g. `628123456789`) to receive an 8-digit pairing code to enter on your phone.

---

### 2. Start the Server Daemon

You can run the server either as a detached background daemon or in foreground:

#### Option A: Background Daemon (Recommended)

```bash
# Start server in background (binds to 0.0.0.0:3000)
npx -y @ahmadmcer/whatsapp-mcp --daemon

# Check running status, PID, uptime, and WhatsApp connection state
npx -y @ahmadmcer/whatsapp-mcp status

# Stop background daemon
npx -y @ahmadmcer/whatsapp-mcp stop
```

#### Option B: Foreground Server

Ideal for containers (Docker), debugging, or custom process supervisors:

```bash
npx -y @ahmadmcer/whatsapp-mcp
```

#### Option C: Process Manager (PM2)

For production auto-restart on boot:

```bash
pm2 start ecosystem.config.cjs
pm2 save
```

---

## CLI Options & Flags

```
Usage: whatsapp-mcp [options] [command]

Options:
  -V, --version           output the version number
  -d, --daemon            Run server as a detached background daemon process
  -p, --port <number>     Port for HTTP daemon (default: 3000)
  -H, --host <address>    Host address to bind HTTP daemon (default: "0.0.0.0")
  -k, --api-key <token>   Optional API key token required in Authorization or x-api-key header
  -t, --transport <type>  MCP transport protocol: http (default), sse, or stdio (deprecated)
  -h, --help              display help for command

Commands:
  status [options]        Check the running status of the WhatsApp MCP background daemon
  stop                    Stop the running WhatsApp MCP background daemon process
  login                   Interactive terminal login for WhatsApp Web
```

> **Data Persistence**: When launched via `npx`, authentication keys and database storage automatically persist safely in `~/.whatsapp-mcp/` across sessions and package updates.

---

## MCP Client Configuration

Connect your AI assistants directly to the running HTTP daemon URL:

### Antigravity / Cursor

In your MCP settings (`~/.gemini/config/mcp_config.json` or Cursor Settings):

```json
{
  "mcpServers": {
    "whatsapp": {
      "serverUrl": "http://127.0.0.1:3000/mcp"
    }
  }
}
```

### Remote / Tailscale Access

If the daemon is running on another machine (e.g. PC at home, accessed from a laptop or mobile phone):

```json
{
  "mcpServers": {
    "whatsapp": {
      "serverUrl": "http://100.89.190.38:3000/mcp"
    }
  }
}
```

### With Optional API Key Authentication

If you launched the daemon with `--api-key my-secret-token` (or `MCP_API_KEY=my-secret-token`):

```json
{
  "mcpServers": {
    "whatsapp": {
      "serverUrl": "http://127.0.0.1:3000/mcp",
      "headers": {
        "Authorization": "Bearer my-secret-token"
      }
    }
  }
}
```

### Claude Desktop

Claude Desktop natively connects to HTTP/SSE servers or via proxy:

```json
{
  "mcpServers": {
    "whatsapp": {
      "serverUrl": "http://127.0.0.1:3000/mcp"
    }
  }
}
```

---

## Diagnostic Endpoints

The HTTP server exposes a built-in health & diagnostic endpoint:

- **GET `/health`**: Returns daemon uptime, process ID, and WhatsApp connection status.
  ```json
  {
    "status": "healthy",
    "timestamp": 1730998800000,
    "uptime": 3600,
    "pid": 27888,
    "transport": "http",
    "whatsapp": {
      "status": "connected",
      "user": {
        "jid": "628123456789@s.whatsapp.net",
        "name": "Ahmad",
        "phoneNumber": "628123456789"
      },
      "hasPairingCode": false,
      "hasQr": false
    }
  }
  ```

---

## Available MCP Tools (19 Primitives)

### 🔐 Authentication Tools
| Tool | Description | Parameters |
| :--- | :--- | :--- |
| `get_connection_status` | Returns connection status (`connected`, `qr_ready`, `logged_out`), pairing codes, and user info | None |
| `request_pairing_code` | Requests an 8-digit pairing code for linking via phone number | `phoneNumber: string` |
| `logout` | Logs out current session and wipes local credentials | `confirm: boolean` |

### 💬 Chat & Conversation Tools
| Tool | Description | Parameters |
| :--- | :--- | :--- |
| `list_chats` | Lists recent conversations sorted by latest activity | `limit?: number`, `query?: string`, `unreadOnly?: boolean` |
| `get_chat_history` | Fetches chronological message history from a chat | `chatJid: string`, `limit?: number`, `beforeTimestamp?: number` |
| `get_message_context` | Retrieves surrounding messages before and after a specific message | `chatJid: string`, `messageId: string`, `contextSize?: number` |
| `search_messages` | Full-text search across messages with optional chat filtering | `query: string`, `chatJid?: string`, `limit?: number` |
| `mark_chat_read` | Marks a chat as read | `chatJid: string` |

### ✉️ Messaging Tools
| Tool | Description | Parameters |
| :--- | :--- | :--- |
| `send_message` | Sends text message with typing simulation, jitter, replies, and mentions | `recipientJid: string`, `message: string`, `quotedMessageId?: string`, `mentions?: string[]`, `dryRun?: boolean` |
| `send_media` | Sends images, videos, audio/voice notes, documents, or stickers | `recipientJid: string`, `mediaPathOrUrl: string`, `mediaType: 'image'\|'video'\|'audio'\|'document'\|'sticker'`, `caption?: string`, `quotedMessageId?: string`, `dryRun?: boolean` |
| `react_to_message` | Adds or clears emoji reaction on a message | `chatJid: string`, `messageId: string`, `emoji: string` |

### 📁 Media Tools
| Tool | Description | Parameters |
| :--- | :--- | :--- |
| `download_media` | Decrypts and saves media from an inbound message | `chatJid: string`, `messageId: string`, `includeBase64?: boolean` |

### 👤 Contact Tools
| Tool | Description | Parameters |
| :--- | :--- | :--- |
| `list_contacts` | Lists synchronized WhatsApp contacts | `limit?: number`, `query?: string` |
| `get_contact_profile` | Retrieves contact details, 'About' status text, and profile picture URL | `contactJid: string` |

### 👥 Group Management Tools
| Tool | Description | Parameters |
| :--- | :--- | :--- |
| `list_groups` | Lists all joined WhatsApp groups with member counts | None |
| `get_group_metadata` | Returns complete group details, member roles, and settings | `groupJid: string` |
| `create_group` | Creates a new group with specified members | `subject: string`, `participants: string[]` |
| `manage_group_participants` | Adds, removes, promotes, or demotes group participants | `groupJid: string`, `action: 'add'\|'remove'\|'promote'\|'demote'`, `participants: string[]` |
| `get_group_invite_link` | Retrieves or regenerates group invite link | `groupJid: string`, `revoke?: boolean` |

---

## Testing

Run unit and integration test suites via Vitest:

```bash
npm run test
```

---

## License

MIT © [Ahmad](https://github.com/ahmadmcer)
