import fs from "node:fs";
import path from "node:path";
import { spawn, execSync } from "node:child_process";
import { PATHS, PACKAGE_ROOT } from "../config/env.js";

export interface DaemonInfo {
  pid: number;
  port: number;
  host: string;
  startedAt: number;
  apiKeySet: boolean;
}

export function isProcessAlive(pid: number): boolean {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: any) {
    return err.code === "EPERM";
  }
}

export function readPidFile(): DaemonInfo | null {
  try {
    if (!fs.existsSync(PATHS.PID_FILE)) {
      return null;
    }
    const raw = fs.readFileSync(PATHS.PID_FILE, "utf-8").trim();
    if (!raw) return null;
    return JSON.parse(raw) as DaemonInfo;
  } catch {
    return null;
  }
}

export function writePidFile(data: DaemonInfo): void {
  const dir = path.dirname(PATHS.PID_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(PATHS.PID_FILE, JSON.stringify(data, null, 2), "utf-8");
}

export function removePidFile(): void {
  try {
    if (fs.existsSync(PATHS.PID_FILE)) {
      fs.unlinkSync(PATHS.PID_FILE);
    }
  } catch {
    // Ignore error if already deleted
  }
}

export async function startDaemon(options: {
  port: number;
  host: string;
  apiKey?: string;
}): Promise<void> {
  const existing = readPidFile();
  if (existing && isProcessAlive(existing.pid)) {
    console.log(
      `\x1b[33mWhatsApp MCP daemon is already running (PID: ${existing.pid}) on http://${existing.host}:${existing.port}\x1b[0m`
    );
    console.log(`To check status: whatsapp-mcp status`);
    console.log(`To stop daemon:  whatsapp-mcp stop`);
    return;
  }

  // Remove stale PID file if any
  removePidFile();

  // Ensure logs directory exists
  const logsDir = path.dirname(PATHS.LOG_FILE);
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  // Find the compiled entry script
  let entryScript = path.join(PACKAGE_ROOT, "dist", "index.js");
  if (!fs.existsSync(entryScript)) {
    entryScript = path.resolve(process.argv[1]);
  }

  const childArgs = [
    entryScript,
    "--transport",
    "http",
    "--port",
    String(options.port),
    "--host",
    options.host,
  ];

  if (options.apiKey && options.apiKey.trim().length > 0) {
    childArgs.push("--api-key", options.apiKey.trim());
  }

  const child = spawn(process.execPath, childArgs, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env: { ...process.env },
  });

  if (!child.pid) {
    console.error("\x1b[31mFailed to spawn background daemon process.\x1b[0m");
    process.exit(1);
  }

  // Save PID file
  writePidFile({
    pid: child.pid,
    port: options.port,
    host: options.host,
    startedAt: Date.now(),
    apiKeySet: Boolean(options.apiKey && options.apiKey.trim().length > 0),
  });

  child.unref();

  console.log(`Starting WhatsApp MCP server daemon (PID: ${child.pid})...`);

  // Wait and poll /health endpoint to verify startup
  const checkHost = options.host === "0.0.0.0" ? "127.0.0.1" : options.host;
  const healthUrl = `http://${checkHost}:${options.port}/health`;
  let started = false;

  for (let i = 0; i < 15; i++) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    try {
      const res = await fetch(healthUrl);
      if (res.ok) {
        started = true;
        break;
      }
    } catch {
      // Continue polling
    }
  }

  if (started) {
    console.log(`\x1b[32m✔ WhatsApp MCP daemon is active and running in background!\x1b[0m`);
    console.log(`  PID:             ${child.pid}`);
    console.log(`  Host:            ${options.host}`);
    console.log(`  Port:            ${options.port}`);
    console.log(`  Streamable HTTP: http://${checkHost}:${options.port}/mcp`);
    console.log(`  SSE:             http://${checkHost}:${options.port}/sse`);
    console.log(`  Health Check:    ${healthUrl}`);
    console.log(`  Log File:        ${PATHS.LOG_FILE}`);
    if (options.apiKey) {
      console.log(`  Security:        API Key / Bearer token authentication enabled`);
    }
    console.log("");
    console.log("Commands:");
    console.log(`  Check status:    whatsapp-mcp status`);
    console.log(`  Stop daemon:     whatsapp-mcp stop`);
  } else {
    console.log(
      `\x1b[33mDaemon process spawned (PID: ${child.pid}), but health check did not respond yet.\x1b[0m`
    );
    console.log(`Check logs for details: ${PATHS.LOG_FILE}`);
  }
}

export async function stopDaemon(): Promise<void> {
  const existing = readPidFile();
  if (!existing) {
    console.log("No running WhatsApp MCP daemon found (no PID file present).");
    return;
  }

  const { pid } = existing;
  if (!isProcessAlive(pid)) {
    removePidFile();
    console.log(
      `Cleaned up stale PID file (process with PID ${pid} was no longer running).`
    );
    return;
  }

  console.log(`Stopping WhatsApp MCP daemon (PID: ${pid})...`);

  try {
    if (process.platform === "win32") {
      try {
        execSync(`taskkill /pid ${pid} /T /F`, { stdio: "ignore" });
      } catch {
        process.kill(pid, "SIGTERM");
      }
    } else {
      process.kill(pid, "SIGTERM");
    }
  } catch (err: any) {
    console.error(`Failed to terminate process ${pid}: ${err.message}`);
  }

  // Poll until process is gone or timeout
  for (let i = 0; i < 10; i++) {
    if (!isProcessAlive(pid)) break;
    await new Promise((r) => setTimeout(r, 200));
  }

  removePidFile();
  console.log(`\x1b[32m✔ WhatsApp MCP daemon (PID: ${pid}) has stopped.\x1b[0m`);
}

export async function getDaemonStatus(customPort?: number, customHost?: string): Promise<void> {
  const existing = readPidFile();

  if (!existing) {
    // If no PID file, probe default port in case server is managed by PM2, Docker, or external runner
    const probePort = customPort || 3000;
    const probeHost = customHost || "127.0.0.1";
    const healthUrl = `http://${probeHost}:${probePort}/health`;

    try {
      const res = await fetch(healthUrl);
      if (res.ok) {
        const data = (await res.json()) as any;
        const uptimeSec = data.uptime || 0;
        const hours = Math.floor(uptimeSec / 3600);
        const minutes = Math.floor((uptimeSec % 3600) / 60);
        const seconds = uptimeSec % 60;
        const uptimeStr = `${hours}h ${minutes}m ${seconds}s`;

        console.log("\x1b[32mWhatsApp MCP Server Status: ACTIVE (Managed via PM2 / Service)\x1b[0m");
        console.log(`  PID:             ${data.pid || "external"}`);
        console.log(`  Uptime:          ${uptimeStr}`);
        console.log(`  Host:            ${probeHost}`);
        console.log(`  Port:            ${probePort}`);
        console.log(`  Streamable HTTP: http://${probeHost}:${probePort}/mcp`);
        console.log(`  SSE Endpoint:    http://${probeHost}:${probePort}/sse`);
        console.log(`  Health Check:    ${healthUrl}`);
        console.log(`  WhatsApp Status: ${data.whatsapp?.status || "unknown"}`);
        if (data.whatsapp?.user?.phoneNumber) {
          console.log(`  WhatsApp User:   ${data.whatsapp.user.phoneNumber}`);
        }
        return;
      }
    } catch {
      // Server not reachable
    }

    console.log("\x1b[33mWhatsApp MCP daemon is NOT running.\x1b[0m");
    console.log("To start daemon in background: whatsapp-mcp --daemon");
    console.log("To run in foreground:          whatsapp-mcp");
    return;
  }

  const { pid, port, host, startedAt } = existing;
  const targetPort = customPort || port;
  const targetHost = customHost || host;
  const checkHost = targetHost === "0.0.0.0" ? "127.0.0.1" : targetHost;
  const healthUrl = `http://${checkHost}:${targetPort}/health`;

  if (!isProcessAlive(pid)) {
    console.log(`\x1b[31mWhatsApp MCP daemon process (PID: ${pid}) is NOT alive.\x1b[0m`);
    console.log(`Stale PID file detected. Run 'whatsapp-mcp stop' to clean up.`);
    return;
  }

  try {
    const res = await fetch(healthUrl);
    if (res.ok) {
      const data = (await res.json()) as any;
      const uptimeSec = data.uptime || Math.floor((Date.now() - startedAt) / 1000);
      const hours = Math.floor(uptimeSec / 3600);
      const minutes = Math.floor((uptimeSec % 3600) / 60);
      const seconds = uptimeSec % 60;
      const uptimeStr = `${hours}h ${minutes}m ${seconds}s`;

      console.log("\x1b[32mWhatsApp MCP Daemon Status: ACTIVE\x1b[0m");
      console.log(`  PID:             ${pid}`);
      console.log(`  Uptime:          ${uptimeStr}`);
      console.log(`  Host:            ${targetHost}`);
      console.log(`  Port:            ${targetPort}`);
      console.log(`  Streamable HTTP: http://${checkHost}:${targetPort}/mcp`);
      console.log(`  SSE Endpoint:    http://${checkHost}:${targetPort}/sse`);
      console.log(`  Health Check:    ${healthUrl}`);
      console.log(`  WhatsApp Status: ${data.whatsapp?.status || "unknown"}`);
      if (data.whatsapp?.user?.phoneNumber) {
        console.log(`  WhatsApp User:   ${data.whatsapp.user.phoneNumber}`);
      }
      console.log(`  Log File:        ${PATHS.LOG_FILE}`);
      console.log(`  PID File:        ${PATHS.PID_FILE}`);
      return;
    }
  } catch {
    // Health check unreachable
  }

  console.log(`\x1b[33mWhatsApp MCP daemon process (PID: ${pid}) is running, but HTTP endpoint is unreachable.\x1b[0m`);
  console.log(`Check logs: ${PATHS.LOG_FILE}`);
}
