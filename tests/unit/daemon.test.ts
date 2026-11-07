import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import {
  isProcessAlive,
  writePidFile,
  readPidFile,
  removePidFile,
  type DaemonInfo,
} from "../../src/cli/daemon.js";
import { PATHS, CONFIG } from "../../src/config/env.js";

describe("Daemon Process & PID Manager", () => {
  beforeEach(() => {
    removePidFile();
  });

  afterEach(() => {
    removePidFile();
  });

  it("checks process liveness accurately", () => {
    expect(isProcessAlive(process.pid)).toBe(true);
    expect(isProcessAlive(0)).toBe(false);
    expect(isProcessAlive(-1)).toBe(false);
    expect(isProcessAlive(9999999)).toBe(false);
  });

  it("writes, reads, and cleans up PID file correctly", () => {
    const dummyInfo: DaemonInfo = {
      pid: process.pid,
      port: 3000,
      host: "0.0.0.0",
      startedAt: Date.now(),
      apiKeySet: false,
    };

    writePidFile(dummyInfo);
    expect(fs.existsSync(PATHS.PID_FILE)).toBe(true);

    const readBack = readPidFile();
    expect(readBack).not.toBeNull();
    expect(readBack?.pid).toBe(process.pid);
    expect(readBack?.port).toBe(3000);
    expect(readBack?.host).toBe("0.0.0.0");

    removePidFile();
    expect(fs.existsSync(PATHS.PID_FILE)).toBe(false);
    expect(readPidFile()).toBeNull();
  });

  it("defaults transport to HTTP and host to 0.0.0.0 in CONFIG", () => {
    expect(CONFIG.DEFAULT_TRANSPORT).toBe("http");
    expect(CONFIG.DEFAULT_HOST).toBe("0.0.0.0");
    expect(CONFIG.DEFAULT_PORT).toBe(3000);
  });
});
