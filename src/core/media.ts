import fs from "node:fs";
import path from "node:path";
import { downloadMediaMessage, type WAMessage } from "@whiskeysockets/baileys";
import { PATHS } from "../config/env.js";
import { LIMITS } from "../config/constants.js";
import { logger } from "../utils/logger.js";

export interface SaveMediaBufferOptions {
  chatJid: string;
  messageId: string;
  buffer: Buffer;
  mimeType: string;
  originalFileName?: string;
  includeBase64?: boolean;
}

export interface SavedMediaResult {
  filePath: string;
  mimeType: string;
  fileSize: number;
  fileName: string;
  base64Url?: string;
}

export class MediaManager {
  private mediaDir: string;

  constructor(mediaDir: string = PATHS.MEDIA_DIR) {
    this.mediaDir = path.resolve(mediaDir);
    if (!fs.existsSync(this.mediaDir)) {
      fs.mkdirSync(this.mediaDir, { recursive: true });
    }
  }

  /**
   * Generates a safe file save path preventing directory traversal.
   */
  getSafeSavePath(chatJid: string, messageId: string, extension: string): string {
    if (
      chatJid.includes("..") ||
      messageId.includes("..") ||
      /[\/\\]/.test(chatJid) ||
      /[\/\\]/.test(messageId)
    ) {
      throw new Error("Invalid path parameters: Directory traversal attempt detected");
    }

    const sanitizedChat = chatJid.replace(/[^\w@.-]/g, "_");
    const sanitizedMsgId = messageId.replace(/[^\w.-]/g, "_");
    const targetDir = path.resolve(this.mediaDir, sanitizedChat);

    if (!targetDir.startsWith(this.mediaDir)) {
      throw new Error("Invalid target directory: Path traversal attempt detected");
    }

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const cleanExt = extension.replace(/[^\w]/g, "");
    const fileName = `${sanitizedMsgId}.${cleanExt}`;
    const targetPath = path.resolve(targetDir, fileName);

    if (!targetPath.startsWith(this.mediaDir)) {
      throw new Error("Invalid file path: Path traversal attempt detected");
    }

    return targetPath;
  }

  /**
   * Saves a decrypted media buffer to disk and generates metadata.
   */
  async saveMediaBuffer(options: SaveMediaBufferOptions): Promise<SavedMediaResult> {
    const ext = this.getExtensionForMime(options.mimeType);
    const savePath = this.getSafeSavePath(options.chatJid, options.messageId, ext);

    await fs.promises.writeFile(savePath, options.buffer);
    const fileSize = options.buffer.length;
    const fileName = options.originalFileName || path.basename(savePath);

    let base64Url: string | undefined;
    if (
      options.includeBase64 &&
      options.mimeType.startsWith("image/") &&
      fileSize <= LIMITS.MAX_IMAGE_BASE64_BYTES
    ) {
      base64Url = `data:${options.mimeType};base64,${options.buffer.toString("base64")}`;
    }

    return {
      filePath: savePath,
      mimeType: options.mimeType,
      fileSize,
      fileName,
      base64Url,
    };
  }

  /**
   * Decrypts an inbound media message via Baileys and saves it locally.
   */
  async downloadAndSaveMedia(
    msg: WAMessage,
    sock: any,
    includeBase64: boolean = false
  ): Promise<SavedMediaResult> {
    const chatJid = msg.key.remoteJid || "unknown";
    const messageId = msg.key.id || `msg-${Date.now()}`;

    const buffer = await downloadMediaMessage(
      msg,
      "buffer",
      {},
      {
        logger,
        reuploadRequest: sock?.updateMediaMessage ? sock.updateMediaMessage.bind(sock) : undefined,
      }
    );

    const messageContent = msg.message;
    let mimeType = "application/octet-stream";
    let originalFileName: string | undefined;

    if (messageContent?.imageMessage?.mimetype) {
      mimeType = messageContent.imageMessage.mimetype;
    } else if (messageContent?.videoMessage?.mimetype) {
      mimeType = messageContent.videoMessage.mimetype;
    } else if (messageContent?.audioMessage?.mimetype) {
      mimeType = messageContent.audioMessage.mimetype;
    } else if (messageContent?.documentMessage?.mimetype) {
      mimeType = messageContent.documentMessage.mimetype;
      originalFileName = messageContent.documentMessage.fileName || undefined;
    } else if (messageContent?.stickerMessage?.mimetype) {
      mimeType = messageContent.stickerMessage.mimetype;
    }

    return await this.saveMediaBuffer({
      chatJid,
      messageId,
      buffer: buffer as Buffer,
      mimeType,
      originalFileName,
      includeBase64,
    });
  }

  /**
   * Resolves an outbound media file or url into a Baileys uploadable object.
   */
  resolveOutboundMedia(
    mediaPathOrUrl: string,
    mediaType: "image" | "video" | "audio" | "document" | "sticker",
    caption?: string
  ): any {
    const isUrl = /^https?:\/\//i.test(mediaPathOrUrl);
    const mediaSource = isUrl ? { url: mediaPathOrUrl } : { url: path.resolve(mediaPathOrUrl) };

    switch (mediaType) {
      case "image":
        return { image: mediaSource, caption };
      case "video":
        return { video: mediaSource, caption };
      case "audio":
        return { audio: mediaSource, ptt: false };
      case "document":
        return {
          document: mediaSource,
          fileName: path.basename(mediaPathOrUrl),
          caption,
        };
      case "sticker":
        return { sticker: mediaSource };
      default:
        throw new Error(`Unsupported media type: ${mediaType}`);
    }
  }

  getExtensionForMime(mime: string): string {
    const cleanMime = mime.split(";")[0].trim().toLowerCase();
    const map: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/jpg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif",
      "audio/ogg": "ogg",
      "audio/mpeg": "mp3",
      "audio/mp4": "m4a",
      "audio/aac": "aac",
      "video/mp4": "mp4",
      "video/3gpp": "3gp",
      "application/pdf": "pdf",
      "application/zip": "zip",
      "text/plain": "txt",
    };
    return map[cleanMime] || "bin";
  }
}

export const mediaManager = new MediaManager();
