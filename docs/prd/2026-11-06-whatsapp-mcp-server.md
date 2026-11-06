# PRD: WhatsApp-MCP-Server

- **Status**: Approved
- **Author**: Engineering Team
- **Date**: 2026-11-06
- **Target Release**: v1.0.0

---

## 1. Executive Summary & Problem Space
AI desktop and IDE agents (Claude Desktop, Cursor, Antigravity, Cline) lack native, compliant, and privacy-preserving integration with WhatsApp. While Meta Cloud API exists for enterprise bots, personal account automation without phone bans or privacy leaks requires running locally via WhatsApp Web's multi-device protocol. 

`whatsapp-mcp` is an open-source, production-grade Model Context Protocol (MCP) server powered by Baileys (`@whiskeysockets/baileys`). It provides rich tools for conversation retrieval, contextual message search, media decryption/dispatch, group management, and multi-device authentication with local embedded SQLite storage and built-in anti-ban safeguards.

## 2. Personas & Use Cases
- **AI Agent User (Developer / Knowledge Worker)**: Wants Claude Desktop or Cursor to summarize recent WhatsApp chats, draft messages, find specific files or links shared in groups, and send messages on command.
- **Automation / Workflow Engineer**: Wants to run WhatsApp as an MCP service in a local container or background daemon using SSE or Stdio transports for scheduled workflows.

## 3. Scope Boundaries
### In-Scope (Goals)
- [x] Multi-device authentication via terminal interactive QR code and phone number pairing code.
- [x] Embedded SQLite (`better-sqlite3`) database for indexing chats, contacts, messages, and handling Baileys `getMessage` retries.
- [x] Standard `stdio` transport for desktop MCP clients and optional `sse` HTTP transport.
- [x] 19 comprehensive MCP tool primitives covering auth, chats, messages, media, contacts, and groups.
- [x] Media decryption pipeline saving media to `data/media/` with optional base64 image data for vision models.
- [x] Anti-ban rate limiting with realistic typing presence (`composing`) and jitter.
- [x] Strict logging discipline: `stdout` reserved for JSON-RPC; all logs routed to `stderr` and rotating file.

### Out-of-Scope (Non-Goals)
- Sending bulk unsolicited marketing / spam broadcasts.
- Webhook bridge to external proprietary cloud SaaS.
- Voice/video call answering or WebRTC audio streaming.

## 4. Functional Requirements (MoSCoW)
### Must Have
- **REQ-01 (Authentication)**: Support `useMultiFileAuthState` with credentials in `./auth_info/`. Provide CLI `whatsapp-mcp login` for QR / pairing code and MCP tools `get_connection_status` and `request_pairing_code`.
- **REQ-02 (Chat Management)**: Provide `list_chats`, `get_chat_history`, `get_message_context`, `search_messages`, and `mark_chat_read`.
- **REQ-03 (Messaging)**: Provide `send_message`, `send_media`, and `react_to_message` with typing presence and anti-ban jitter. Support `dryRun`.
- **REQ-04 (Media Handling)**: Decrypt inbound media via `download_media` into `./data/media/` and return metadata and optional base64.
- **REQ-05 (Group Operations)**: Provide `list_groups`, `get_group_metadata`, `create_group`, `manage_group_participants`, and `get_group_invite_link`.
- **REQ-06 (Contacts)**: Provide `list_contacts` and `get_contact_profile`.

### Should Have
- **REQ-07 (Multi-Transport)**: Allow switching transport between `stdio` and `sse` via `--transport` CLI flag.
- **REQ-08 (Logging)**: Strictly protect `stdout` JSON-RPC; log to `stderr` and `./logs/whatsapp-mcp.log`.

### Could Have
- **REQ-09 (Full-Text Search)**: SQLite full-text search indexing on message text content.

## 5. Acceptance Criteria (Gherkin Scenarios)

```gherkin
Scenario: Listing recent conversations
  Given an authenticated WhatsApp multi-device connection
  When the agent calls list_chats with limit=10
  Then the system returns the 10 most recent chats with names, JIDs, unread counts, and last message timestamps

Scenario: Contextual message retrieval
  Given a message ID in a conversation
  When the agent calls get_message_context with contextSize=3
  Then the system returns up to 3 messages before and 3 messages after the target message in chronological order

Scenario: Sending a message with human simulation
  Given a valid recipient phone number or JID and message text
  When the agent calls send_message with dryRun=false
  Then the system emits typing presence to the recipient
  And waits 1000-3000ms jitter before sending the message
  And returns the generated message ID and timestamp
```

## 6. Non-Functional Requirements (NFRs)
- **Protocol Integrity**: 0 unformatted bytes on `stdout`.
- **Performance**: SQLite query response time < 20ms for pagination and context lookups.
- **Security**: Local credentials and media secured with restricted file permissions; `.gitignore` covers all sensitive paths.
