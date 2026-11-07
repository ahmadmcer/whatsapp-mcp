# ADR-0002: Transition to Daemon-First HTTP Transport Architecture

- **Status**: Accepted
- **Deciders**: Engineering Team
- **Date**: 2026-11-08

---

## 1. Context & Problem Statement

Initially, `whatsapp-mcp` defaulted to standard I/O (`stdio`) transport for direct process-based desktop execution. However, in real-world agentic environments, developers frequently utilize multiple autonomous AI agents (e.g. Antigravity IDE, Cursor, Claude Code, Cline, and mobile clients over Tailscale) simultaneously.

Under WhatsApp's multi-device protocol, WhatsApp Web permits **only one active WebSocket session per paired device credential**. When multiple agents each spawn `whatsapp-mcp` via `stdio`, multiple independent processes attempt to connect with the same credentials in `~/.whatsapp-mcp/auth_info/`. WhatsApp detects the subsequent socket connection and immediately drops the previous socket with `statusCode: 440 (conflict: replaced)`. Both processes then attempt automatic reconnection, causing an infinite connection conflict loop that renders the tool inoperable and triggers risk of account rate-limiting from WhatsApp servers.

Additionally, running multiple separate processes creates competing SQLite writers and fragments the anti-ban human-like jitter queue.

## 2. Decision Drivers

- **Zero Socket Collisions**: Ensure exactly one persistent WhatsApp WebSocket connection regardless of how many agents or clients query tools.
- **Unified Anti-Ban Protection**: Route all outbound messaging through a single FIFO queue with randomized human typing jitter (1000–3000ms).
- **Concurrency & Multi-Device Accessibility**: Enable simultaneous access from multiple IDE windows, external CLI scripts, and remote devices (e.g., Samsung Galaxy A55 5G via Tailscale).
- **Graceful Lifecycle Management**: Support both foreground running and detached background daemon execution directly via `npx` (`--daemon`, `status`, `stop`).

## 3. Considered Options

1. **Option 1: Daemon-First HTTP Transport (Chosen)**
   - Default to Streamable HTTP (`/mcp`, Spec 2025-03-26) and SSE (`/sse`, Spec 2024-11-05) on port 3000 host 0.0.0.0.
   - Deprecate `--transport stdio` with informative warnings.
   - Provide native `--daemon`, `status`, and `stop` CLI subcommands.
   - Add optional API Key / Bearer token authentication.

2. **Option 2: Cross-Process File Lock Mutex on Stdio**
   - Retain Stdio as default and enforce a file lock on the auth directory.
   - *Rejected*: The second agent would simply be blocked and fail to launch while the first agent runs.

3. **Option 3: Hard Removal of Stdio**
   - Remove Stdio code entirely and throw hard errors if `--transport stdio` is supplied.
   - *Rejected*: Temporarily preserves backward compatibility with a friendly deprecation notice.

## 4. Decision Outcome

Chosen Option: **Option 1 (Daemon-First HTTP Transport)**.

### Rationale

- Streamable HTTP (`/mcp`) enables stateful multi-session multiplexing. Each connecting agent receives its own isolated `mcp-session-id`, while sharing the underlying singleton Baileys client, message queue, and SQLite store.
- Running a single background daemon completely eliminates socket conflicts, ensures consistent message rate limiting, and opens access to remote mobile devices across Tailscale/LAN.

### Positive Consequences

- All agents (Antigravity, Cursor, mobile clients) can query chats and send messages concurrently without socket drops.
- Account ban risk is minimized because outbound rate limiting is strictly centralized.
- Stale session recovery: Returning HTTP 404 on expired session IDs instructs compliant MCP clients to cleanly re-initialize without manual restarts.
- Endpoints can be secured with optional bearer tokens (`--api-key`).

### Deprecations

- `--transport stdio` is deprecated. Users running with `--transport stdio` receive an explicit warning on `stderr` advising them to connect via HTTP `serverUrl`.
