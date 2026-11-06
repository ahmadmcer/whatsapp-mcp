# whatsapp-mcp

> Production-grade Model Context Protocol (MCP) server integrated with WhatsApp Web via [Baileys](https://github.com/WhiskeySockets/Baileys).

`whatsapp-mcp` allows AI assistants (such as Claude Desktop, Cursor, Antigravity, and Cline) to search and read conversations, retrieve messages with surrounding conversational context, send text and rich media (images, audio, video, documents, stickers), react with emojis, manage groups, and handle WhatsApp multi-device authentication—all running locally with zero secrets leaked.

---

## Features

- **Multi-Device Authentication**: Interactive terminal login supporting both ASCII QR code scanning and phone number pairing codes.
- **Embedded SQLite Storage**: Built on `better-sqlite3` with WAL mode. Messages, chats, contacts, and groups are indexed locally, powering instant queries, FTS5 full-text search, and fulfilling Baileys' cryptographic Signal retry lookups (`getMessage`).
- **Multi-Transport Support**: Works seamlessly over standard `stdio` (default for desktop clients) or Server-Sent Events (`sse`) HTTP mode for background/headless instances.
- **Safety & Anti-Ban Rate Limiter**: Automatically simulates human typing presence (`composing`) with 1000–3000ms randomized jitter before sending messages. All mutating tools include an optional `dryRun` mode.
- **Rich Media Pipeline**: Automatically decrypts and caches incoming images, audio, video, and documents to `./data/media/`. Includes base64 data URIs for images under 1MB to support multimodal vision models.
- **Strict Protocol Integrity**: Standard output (`stdout`) is strictly reserved for MCP JSON-RPC protocol frames. All logs and Baileys debug traces are diverted to `stderr` and `./logs/whatsapp-mcp.log`.

---

## Quick Start

### 1. Prerequisites
- **Node.js** v20+
- **npm** v10+

### 2. Installation & Build

```bash
# Clone the repository
git clone https://github.com/your-username/whatsapp-mcp.git
cd whatsapp-mcp

# Install dependencies
npm install

# Build TypeScript to dist/
npm run build
```

### 3. Authenticate with WhatsApp

Run the interactive login command:

```bash
npm run login
```

Choose your preferred pairing method:
1. **Scan QR Code**: Scan the ASCII QR code printed directly in your terminal using WhatsApp on your phone (`Settings` -> `Linked Devices` -> `Link a Device`).
2. **Pairing Code**: Enter your phone number with country code (e.g. `15551234567`) to receive an 8-digit pairing code to enter on your phone.

Credentials are saved securely in `./auth_info/`. Once paired, subsequent runs connect automatically without re-authenticating.

---

## MCP Client Configuration

### Claude Desktop

Add `whatsapp-mcp` to your `claude_desktop_config.json`:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "whatsapp": {
      "command": "node",
      "args": ["c:/Users/ahmad/OneDrive/Projects/MCP/whatsapp-mcp/dist/index.js"]
    }
  }
}
```

### Cursor / Antigravity

In your MCP settings or `agy` MCP configuration:

```json
{
  "mcpServers": {
    "whatsapp": {
      "command": "node",
      "args": ["c:/Users/ahmad/OneDrive/Projects/MCP/whatsapp-mcp/dist/index.js"]
    }
  }
}
```

### Running as a Background Daemon (SSE Transport)

To run as an HTTP server accessible via SSE:

```bash
node dist/index.js --transport sse --port 3000
```
- SSE endpoint: `http://localhost:3000/sse`
- Health check: `http://localhost:3000/health`

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

## Architecture & Security

```
┌────────────────────────────────────────────────────────┐
│                      MCP Client                        │
│            (Claude Desktop / Cursor / IDE)             │
└──────────────────────────┬─────────────────────────────┘
                           │ JSON-RPC (stdio / SSE)
┌──────────────────────────▼─────────────────────────────┐
│                   whatsapp-mcp                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │                MCP Tool Registry                 │  │
│  └───────────────────────┬──────────────────────────┘  │
│                          │                             │
│  ┌───────────────────────▼──────────────────────────┐  │
│  │    Rate Limiter Queue & Typing Jitter Simulator  │  │
│  └───────────────────────┬──────────────────────────┘  │
│                          │                             │
│  ┌───────────────────────▼──────────────────────────┐  │
│  │             Baileys Socket Manager               │  │
│  └──────────┬───────────────────────────┬───────────┘  │
│             │                           │              │
│  ┌──────────▼───────────────┐ ┌─────────▼───────────┐  │
│  │  SQLite (better-sqlite3) │ │ Media Cache Manager │  │
│  │   Chats, Msgs, FTS5 FTS  │ │    ./data/media/    │  │
│  └──────────────────────────┘ └─────────────────────┘  │
└──────────────────────────┬─────────────────────────────┘
                           │ TLS WebSocket
┌──────────────────────────▼─────────────────────────────┐
│               WhatsApp Multi-Device API                │
└────────────────────────────────────────────────────────┘
```

- **Zero Secret Exposure**: Authentication credentials in `./auth_info/` are never returned in MCP tool outputs and are protected via `.gitignore`.
- **Directory Traversal Protection**: Inbound and outbound media file operations strictly validate filesystem boundaries against `./data/media/`.
- **Safe JSON-RPC Streams**: All log streams write exclusively to `stderr` and disk, preventing any corruption of `stdout`.

---

## Testing

Run unit and integration test suites via Vitest:

```bash
npm run test
```

---

## License

MIT
