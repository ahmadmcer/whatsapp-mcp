import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { MediaManager } from "../../src/core/media.js";

describe("MediaManager", () => {
  let tempMediaDir: string;
  let mediaManager: MediaManager;

  beforeEach(() => {
    tempMediaDir = path.join(os.tmpdir(), `test-media-${Date.now()}`);
    fs.mkdirSync(tempMediaDir, { recursive: true });
    mediaManager = new MediaManager(tempMediaDir);
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempMediaDir)) {
        fs.rmSync(tempMediaDir, { recursive: true, force: true });
      }
    } catch {
      // Ignored
    }
  });

  it("safely generates media path without directory traversal vulnerability", () => {
    const safePath = mediaManager.getSafeSavePath("user1@s.whatsapp.net", "msg123", "jpg");
    expect(safePath.startsWith(tempMediaDir)).toBe(true);
    expect(safePath.endsWith("msg123.jpg")).toBe(true);

    // Attempt traversal
    expect(() => {
      mediaManager.getSafeSavePath("../../etc", "passwd", "txt");
    }).toThrow(/traversal/i);
  });

  it("detects mime types and extensions correctly", () => {
    expect(mediaManager.getExtensionForMime("image/jpeg")).toBe("jpg");
    expect(mediaManager.getExtensionForMime("image/png")).toBe("png");
    expect(mediaManager.getExtensionForMime("audio/ogg; codecs=opus")).toBe("ogg");
    expect(mediaManager.getExtensionForMime("application/pdf")).toBe("pdf");
    expect(mediaManager.getExtensionForMime("video/mp4")).toBe("mp4");
  });

  it("saves buffer to disk and generates base64 for small images", async () => {
    const dummyBuffer = Buffer.from("fake-image-bytes");
    const result = await mediaManager.saveMediaBuffer({
      chatJid: "user1@s.whatsapp.net",
      messageId: "img001",
      buffer: dummyBuffer,
      mimeType: "image/png",
      includeBase64: true,
    });

    expect(fs.existsSync(result.filePath)).toBe(true);
    expect(result.fileSize).toBe(dummyBuffer.length);
    expect(result.mimeType).toBe("image/png");
    expect(result.base64Url).toBe(`data:image/png;base64,${dummyBuffer.toString("base64")}`);
  });
});
