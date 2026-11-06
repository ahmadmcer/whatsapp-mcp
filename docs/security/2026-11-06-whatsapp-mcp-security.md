# STRIDE Threat Model: WhatsApp MCP Server

- **Status**: Active
- **Date**: 2026-11-06
- **System**: whatsapp-mcp

---

## 1. System Boundaries & Data Flows
- **Boundary 1 (MCP Client <-> whatsapp-mcp)**: JSON-RPC communication over stdin/stdout or localhost SSE HTTP.
- **Boundary 2 (whatsapp-mcp <-> WhatsApp Web Servers)**: TLS-encrypted WebSocket connection with Signal protocol end-to-end encryption.
- **Boundary 3 (whatsapp-mcp <-> Local Storage)**: Filesystem storage in `./auth_info/`, `./data/whatsapp.db`, and `./data/media/`.

## 2. Threat Analysis (STRIDE)

| Threat Category | Target Asset / Boundary | Description | Mitigation Strategy |
| :--- | :--- | :--- | :--- |
| **Spoofing** | WhatsApp Identity | Unauthorized actor attempts to impersonate user | Multi-device Signal key exchange; auth directory kept in local restricted directory with `.gitignore`. |
| **Tampering** | Local Database & Media | Malicious local process tampers with chat records or media paths | Path traversal validation (`path.resolve` boundary check); input validation with Zod schemas. |
| **Repudiation** | MCP Tool Execution | Unlogged actions performed by an agent | Comprehensive structured audit logs written to `stderr` and rotating file with timestamps and parameters. |
| **Information Disclosure** | Credentials & Chat Logs | Accidental leakage of WhatsApp session keys or messages | No credentials output to stdout or tool responses; all debug logging routed away from stdout. |
| **Denial of Service** | WhatsApp Account Ban | Automated burst messaging triggers anti-spam bans | Human simulation: typing presence (`composing`) + randomized jitter (1000-3000ms); concurrency limiting. |
| **Elevation of Privilege** | Media File Paths | Agent passes `../../` to read arbitrary system files | Strict path sanitization on outbound and inbound media files. |
