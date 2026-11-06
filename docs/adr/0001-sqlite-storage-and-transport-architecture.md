# ADR-0001: Architecture, Storage, and Transport for whatsapp-mcp

- **Status**: Accepted
- **Deciders**: Engineering Team
- **Date**: 2026-11-06

---

## 1. Context & Problem Statement
Baileys v7 intentionally deprecated `makeInMemoryStore`. In WhatsApp Web's Signal multi-device protocol, receiving clients need to query historical messages when WhatsApp servers request retransmission of unacknowledged or un-decrypted messages (`getMessage`). Without a message store, retry decryptions fail and users experience "This message took a while". Furthermore, MCP tools require querying past messages, search, and context lookups.

Additionally, MCP clients vary between local CLI/Desktop apps (requiring stdio JSON-RPC) and headless background server runners (requiring HTTP/SSE).

## 2. Decision Drivers
- **Reliability**: Immediate local message lookup for Baileys cryptographic retries.
- **Performance**: Low memory footprint and sub-millisecond query time.
- **Portability**: Works out-of-the-box on Windows, macOS, Linux with Node.js 20+.
- **Protocol Safety**: Never collide with `stdout` JSON-RPC streams.

## 3. Considered Options
1. **Option 1**: Embedded SQLite (`better-sqlite3`) with WAL mode.
2. **Option 2**: In-memory Map with periodic JSON serialization.
3. **Option 3**: External PostgreSQL / Redis container.

## 4. Decision Outcome
Chosen Option: **Option 1 (Embedded SQLite with better-sqlite3)**.

### Rationale
- `better-sqlite3` is synchronous, zero-latency, resilient to crashes, and handles WAL journaling for concurrent readers and writer.
- Schema tables for `chats`, `messages`, `contacts`, and `groups` provide indexed lookups and full-text search.
- Multi-transport abstraction allows stdio by default, with express SSE available on demand.

### Positive Consequences
- Retries always find the prior `proto.IMessage` in SQLite.
- History queries and message context searches are instant and paginated.
- Zero external database services needed.

### Negative Consequences / Trade-offs
- Native C++ addon binding required during npm install (verified working on Node v26 Windows x64).

## 5. Security & Protocol Invariants
- Logging strictly diverted to `stderr` and `./logs/whatsapp-mcp.log`.
- `auth_info/` and database files excluded from source control.
