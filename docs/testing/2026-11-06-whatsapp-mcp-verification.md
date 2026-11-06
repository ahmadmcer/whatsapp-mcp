# Test Plan: WhatsApp MCP Server Verification

- **Status**: Active
- **Date**: 2026-11-06

---

## 1. Scope & Strategy
Follow the Testing Trophy:
- **Unit Tests**: JID utilities, SQLite database schema & repository queries, rate limiter jitter & queue logic.
- **Integration Tests**: MCP tool schema validation, mock Baileys event dispatch, media path sanitization.
- **Manual Verification**: Interactive CLI login (`npm run login`), MCP connection status, actual WhatsApp message flow with `dryRun` and real sends.

## 2. Test Execution
- Framework: Vitest (`npm run test`)
- Types: `npm run build` (tsc/tsup compilation check)

## 3. Success Criteria
- 100% pass rate on all automated unit and integration test suites.
- Clean build with zero TypeScript errors.
- Successful MCP server initialization over `stdio` and `sse`.
