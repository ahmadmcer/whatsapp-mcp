import makeWASocket, {
  DisconnectReason,
  type WASocket,
  type WAMessage,
  type AnyMessageContent,
  getContentType,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import { EventEmitter } from "node:events";
import { loadAuthState } from "./auth.js";
import { rateLimiter } from "./rate-limiter.js";
import { mediaManager } from "./media.js";
import { initDatabase } from "../db/database.js";
import { ChatsRepository } from "../db/chats.repo.js";
import { MessagesRepository } from "../db/messages.repo.js";
import { ContactsRepository } from "../db/contacts.repo.js";
import { GroupsRepository } from "../db/groups.repo.js";
import { toJid, isGroupJid, jidToPhoneNumber } from "../utils/jid.js";
import { RECONNECT } from "../config/constants.js";
import { logger } from "../utils/logger.js";

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "qr_ready"
  | "logged_out";

export interface UserSessionInfo {
  jid: string;
  name?: string;
  phoneNumber?: string;
}

export class BaileysClient extends EventEmitter {
  private sock: WASocket | null = null;
  private status: ConnectionStatus = "disconnected";
  private latestQr: string | null = null;
  private pairingCode: string | null = null;
  private userInfo: UserSessionInfo | null = null;
  private reconnectAttempts = 0;
  private isExplicitStop = false;

  public db = initDatabase();
  public chatsRepo = new ChatsRepository(this.db);
  public messagesRepo = new MessagesRepository(this.db);
  public contactsRepo = new ContactsRepository(this.db);
  public groupsRepo = new GroupsRepository(this.db);

  constructor() {
    super();
  }

  getStatus(): {
    status: ConnectionStatus;
    qr: string | null;
    pairingCode: string | null;
    user: UserSessionInfo | null;
  } {
    return {
      status: this.status,
      qr: this.latestQr,
      pairingCode: this.pairingCode,
      user: this.userInfo,
    };
  }

  getSocket(): WASocket | null {
    return this.sock;
  }

  async start(): Promise<void> {
    if (this.status === "connecting" || this.status === "connected") {
      return;
    }

    this.isExplicitStop = false;
    this.status = "connecting";
    this.emit("status", this.status);

    const { state, saveCreds, clearAuth } = await loadAuthState();

    const sock = makeWASocket({
      auth: state,
      logger,
      printQRInTerminal: false,
      browser: ["whatsapp-mcp", "Chrome", "1.0.0"],
      // Message lookup for Signal retry decrypts
      getMessage: async (key) => {
        if (key.remoteJid && key.id) {
          const raw = this.messagesRepo.getRawMessage(key.remoteJid, key.id);
          if (raw) {
            try {
              return JSON.parse(raw);
            } catch {
              return undefined;
            }
          }
        }
        return undefined;
      },
      cachedGroupMetadata: async (jid) => {
        const group = this.groupsRepo.getGroup(jid);
        return (group as any) || undefined;
      },
    });

    this.sock = sock;

    // Credentials update
    sock.ev.on("creds.update", saveCreds);

    // Connection lifecycle
    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.latestQr = qr;
        this.status = "qr_ready";
        this.emit("qr", qr);
        this.emit("status", this.status);
      }

      if (connection === "open") {
        this.status = "connected";
        this.latestQr = null;
        this.pairingCode = null;
        this.reconnectAttempts = 0;

        const userJid = sock.user?.id ? toJid(sock.user.id.split(":")[0]) : "unknown";
        this.userInfo = {
          jid: userJid,
          name: sock.user?.name || undefined,
          phoneNumber: jidToPhoneNumber(userJid) || undefined,
        };

        logger.info({ user: this.userInfo }, "Connected to WhatsApp successfully");
        this.emit("connected", this.userInfo);
        this.emit("status", this.status);
      }

      if (connection === "close") {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;

        logger.warn(
          { statusCode, error: lastDisconnect?.error, isLoggedOut },
          "WhatsApp connection closed"
        );

        if (isLoggedOut) {
          this.status = "logged_out";
          this.userInfo = null;
          this.latestQr = null;
          clearAuth();
          this.emit("status", this.status);
        } else if (!this.isExplicitStop) {
          this.status = "disconnected";
          this.emit("status", this.status);
          this.scheduleReconnect();
        }
      }
    });

    // Inbound & Outbound messages
    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      for (const msg of messages) {
        this.processIncomingMessage(msg);
      }
    });

    // History sync on initial pairing
    sock.ev.on("messaging-history.set", ({ chats, contacts, messages, isLatest }) => {
      logger.info(
        { chatsCount: chats.length, contactsCount: contacts.length, messagesCount: messages.length, isLatest },
        "Received history sync from WhatsApp"
      );

      for (const chat of chats) {
        this.chatsRepo.upsertChat({
          jid: chat.id,
          name: chat.name || undefined,
          unreadCount: chat.unreadCount ?? 0,
          isGroup: isGroupJid(chat.id),
          isArchived: Boolean(chat.archived),
          isPinned: Boolean(chat.pinned),
        });
      }

      for (const contact of contacts) {
        this.contactsRepo.upsertContact({
          jid: contact.id,
          name: contact.name || undefined,
          notifyName: contact.notify || undefined,
          verifiedName: contact.verifiedName || undefined,
        });
      }

      for (const msg of messages) {
        this.processIncomingMessage(msg);
      }
    });

    // Contacts updates
    sock.ev.on("contacts.upsert", (contacts) => {
      for (const contact of contacts) {
        this.contactsRepo.upsertContact({
          jid: contact.id,
          name: contact.name || undefined,
          notifyName: contact.notify || undefined,
          verifiedName: contact.verifiedName || undefined,
        });
      }
    });

    // Group participants update
    sock.ev.on("group-participants.update", async ({ id }) => {
      try {
        const metadata = await sock.groupMetadata(id);
        this.cacheGroupMetadata(metadata);
      } catch (err) {
        logger.debug({ err, groupJid: id }, "Could not refresh group metadata on participants update");
      }
    });
  }

  async requestPairingCode(phoneNumber: string): Promise<string> {
    if (!this.sock) {
      await this.start();
    }

    const cleanNumber = phoneNumber.replace(/\D/g, "");
    if (!cleanNumber) {
      throw new Error("Invalid phone number. Provide numbers with country code (e.g. 15551234567)");
    }

    if (!this.sock) {
      throw new Error("Socket initialization failed");
    }

    const code = await this.sock.requestPairingCode(cleanNumber);
    this.pairingCode = code;
    this.emit("pairingCode", code);
    return code;
  }

  async logout(): Promise<void> {
    this.isExplicitStop = true;
    if (this.sock) {
      try {
        await this.sock.logout();
      } catch (err) {
        logger.warn({ err }, "Error during socket logout call");
      }
    }
    const { clearAuth } = await loadAuthState();
    clearAuth();
    this.status = "logged_out";
    this.userInfo = null;
    this.sock = null;
    this.emit("status", this.status);
  }

  async sendMessage(
    recipient: string,
    text: string,
    options: {
      quotedMessageId?: string;
      mentions?: string[];
      dryRun?: boolean;
    } = {}
  ): Promise<any> {
    const targetJid = toJid(recipient);

    return await rateLimiter.executeWithSimulation({
      recipientJid: targetJid,
      dryRun: options.dryRun,
      sendComposing: async (jid) => {
        if (this.sock) await this.sock.sendPresenceUpdate("composing", jid);
      },
      action: async () => {
        if (!this.sock) throw new Error("WhatsApp socket not connected");

        let quoted: any;
        if (options.quotedMessageId) {
          const raw = this.messagesRepo.getRawMessage(targetJid, options.quotedMessageId);
          if (raw) quoted = JSON.parse(raw);
        }

        const payload: AnyMessageContent = {
          text,
          mentions: options.mentions?.map(toJid),
        };

        const result = await this.sock.sendMessage(targetJid, payload, { quoted });
        if (result) this.processIncomingMessage(result);
        return {
          id: result?.key.id,
          chatJid: targetJid,
          status: "sent",
          timestamp: Date.now(),
        };
      },
    });
  }

  async sendMedia(
    recipient: string,
    mediaPathOrUrl: string,
    mediaType: "image" | "video" | "audio" | "document" | "sticker",
    options: {
      caption?: string;
      quotedMessageId?: string;
      dryRun?: boolean;
    } = {}
  ): Promise<any> {
    const targetJid = toJid(recipient);

    return await rateLimiter.executeWithSimulation({
      recipientJid: targetJid,
      dryRun: options.dryRun,
      sendComposing: async (jid) => {
        if (this.sock) await this.sock.sendPresenceUpdate("composing", jid);
      },
      action: async () => {
        if (!this.sock) throw new Error("WhatsApp socket not connected");

        const content = mediaManager.resolveOutboundMedia(mediaPathOrUrl, mediaType, options.caption);

        let quoted: any;
        if (options.quotedMessageId) {
          const raw = this.messagesRepo.getRawMessage(targetJid, options.quotedMessageId);
          if (raw) quoted = JSON.parse(raw);
        }

        const result = await this.sock.sendMessage(targetJid, content, { quoted });
        if (result) this.processIncomingMessage(result);
        return {
          id: result?.key.id,
          chatJid: targetJid,
          mediaType,
          status: "sent",
          timestamp: Date.now(),
        };
      },
    });
  }

  async reactToMessage(chat: string, messageId: string, emoji: string): Promise<any> {
    const chatJid = toJid(chat);
    if (!this.sock) throw new Error("WhatsApp socket not connected");

    const message = this.messagesRepo.getMessage(chatJid, messageId);
    const key = {
      remoteJid: chatJid,
      id: messageId,
      fromMe: message ? message.fromMe : false,
    };

    const reactionMessage = {
      react: {
        text: emoji,
        key,
      },
    };

    const result = await this.sock.sendMessage(chatJid, reactionMessage);
    return {
      success: true,
      chatJid,
      messageId,
      emoji,
      resultKey: result?.key.id,
    };
  }

  async downloadMedia(chat: string, messageId: string, includeBase64 = false): Promise<any> {
    const chatJid = toJid(chat);
    if (!this.sock) throw new Error("WhatsApp socket not connected");

    const raw = this.messagesRepo.getRawMessage(chatJid, messageId);
    if (!raw) throw new Error(`Message ${messageId} not found in chat ${chatJid}`);

    const msg: WAMessage = JSON.parse(raw);
    const saved = await mediaManager.downloadAndSaveMedia(msg, this.sock, includeBase64);

    // Update DB with local media path
    this.messagesRepo.upsertMessage({
      id: messageId,
      chatJid,
      senderJid: msg.key.participant || chatJid,
      timestamp: Number(msg.messageTimestamp) * 1000 || Date.now(),
      fromMe: Boolean(msg.key.fromMe),
      mediaPath: saved.filePath,
      mediaMime: saved.mimeType,
      rawPayload: raw,
    });

    return saved;
  }

  async getGroupMetadata(group: string): Promise<any> {
    const groupJid = toJid(group);
    if (!isGroupJid(groupJid)) throw new Error(`${groupJid} is not a valid WhatsApp group JID`);

    if (this.sock) {
      try {
        const metadata = await this.sock.groupMetadata(groupJid);
        this.cacheGroupMetadata(metadata);
        return metadata;
      } catch (err) {
        logger.debug({ err, groupJid }, "Could not fetch live group metadata, using cached");
      }
    }

    const cached = this.groupsRepo.getGroup(groupJid);
    if (!cached) throw new Error(`Group metadata for ${groupJid} not found`);
    return cached;
  }

  async createGroup(subject: string, participants: string[]): Promise<any> {
    if (!this.sock) throw new Error("WhatsApp socket not connected");
    const targetParticipants = participants.map(toJid);
    const group = await this.sock.groupCreate(subject, targetParticipants);
    return group;
  }

  async manageGroupParticipants(
    group: string,
    action: "add" | "remove" | "promote" | "demote",
    participants: string[]
  ): Promise<any> {
    const groupJid = toJid(group);
    if (!this.sock) throw new Error("WhatsApp socket not connected");
    const targetParticipants = participants.map(toJid);
    const result = await this.sock.groupParticipantsUpdate(groupJid, targetParticipants, action);
    return result;
  }

  async getGroupInviteCode(group: string, revoke = false): Promise<string> {
    const groupJid = toJid(group);
    if (!this.sock) throw new Error("WhatsApp socket not connected");
    if (revoke) {
      await this.sock.groupRevokeInvite(groupJid);
    }
    const code = await this.sock.groupInviteCode(groupJid);
    return `https://chat.whatsapp.com/${code}`;
  }

  private processIncomingMessage(msg: WAMessage): void {
    if (!msg.key || !msg.message) return;

    const chatJid = toJid(msg.key.remoteJid || "");
    const messageId = msg.key.id || "";
    if (!chatJid || !messageId) return;

    const fromMe = Boolean(msg.key.fromMe);
    const senderJid = msg.key.participant ? toJid(msg.key.participant) : chatJid;
    const timestamp = msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : Date.now();

    const contentType = getContentType(msg.message);
    const messageContent = msg.message;
    let textContent: string | null = null;
    let messageType = "text";
    let mediaMime: string | null = null;

    if (contentType === "conversation") {
      textContent = messageContent.conversation || null;
      messageType = "text";
    } else if (contentType === "extendedTextMessage") {
      textContent = messageContent.extendedTextMessage?.text || null;
      messageType = "text";
    } else if (contentType === "imageMessage") {
      textContent = messageContent.imageMessage?.caption || null;
      mediaMime = messageContent.imageMessage?.mimetype || "image/jpeg";
      messageType = "image";
    } else if (contentType === "videoMessage") {
      textContent = messageContent.videoMessage?.caption || null;
      mediaMime = messageContent.videoMessage?.mimetype || "video/mp4";
      messageType = "video";
    } else if (contentType === "audioMessage") {
      mediaMime = messageContent.audioMessage?.mimetype || "audio/ogg";
      messageType = "audio";
    } else if (contentType === "documentMessage") {
      textContent = messageContent.documentMessage?.fileName || messageContent.documentMessage?.caption || null;
      mediaMime = messageContent.documentMessage?.mimetype || "application/octet-stream";
      messageType = "document";
    } else if (contentType === "stickerMessage") {
      mediaMime = messageContent.stickerMessage?.mimetype || "image/webp";
      messageType = "sticker";
    } else if (contentType === "reactionMessage") {
      textContent = messageContent.reactionMessage?.text || null;
      messageType = "reaction";
    } else {
      messageType = contentType || "other";
    }

    const rawPayload = JSON.stringify(msg);

    // Store message in SQLite
    this.messagesRepo.upsertMessage({
      id: messageId,
      chatJid,
      senderJid,
      timestamp,
      fromMe,
      messageType,
      textContent,
      mediaMime,
      rawPayload,
      status: fromMe ? "sent" : "received",
    });

    // Update chat metadata in SQLite
    const existingChat = this.chatsRepo.getChat(chatJid);
    const unreadCount = fromMe ? 0 : (existingChat?.unreadCount || 0) + 1;

    this.chatsRepo.upsertChat({
      jid: chatJid,
      name: msg.pushName || existingChat?.name || undefined,
      unreadCount,
      lastMessageTimestamp: timestamp,
      isGroup: isGroupJid(chatJid),
    });
  }

  private cacheGroupMetadata(metadata: any): void {
    if (!metadata || !metadata.id) return;
    this.groupsRepo.upsertGroup({
      jid: metadata.id,
      subject: metadata.subject,
      description: metadata.desc || undefined,
      ownerJid: metadata.owner || undefined,
      creationTimestamp: metadata.creation ? metadata.creation * 1000 : undefined,
      participants: (metadata.participants || []).map((p: any) => ({
        id: p.id,
        admin: p.admin || null,
      })),
    });
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts += 1;
    const delay = Math.min(
      RECONNECT.INITIAL_DELAY_MS * Math.pow(RECONNECT.FACTOR, this.reconnectAttempts - 1),
      RECONNECT.MAX_DELAY_MS
    );

    logger.info({ attempt: this.reconnectAttempts, delayMs: delay }, "Scheduling WhatsApp reconnect");
    setTimeout(() => {
      if (!this.isExplicitStop && this.status !== "connected") {
        this.start().catch((err) => {
          logger.error({ err }, "Reconnect attempt failed");
        });
      }
    }, delay);
  }
}

export const baileysClient = new BaileysClient();
