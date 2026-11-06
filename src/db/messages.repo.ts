import type { Database } from "better-sqlite3";
import { LIMITS } from "../config/constants.js";

export interface MessageRecord {
  id: string;
  chatJid: string;
  senderJid: string;
  timestamp: number;
  fromMe: boolean;
  messageType?: string;
  textContent?: string | null;
  mediaPath?: string | null;
  mediaMime?: string | null;
  rawPayload?: string | null;
  status?: string;
}

export interface ListMessagesOptions {
  limit?: number;
  beforeTimestamp?: number;
  beforeId?: string;
}

export interface MessageContextResult {
  targetMessage: MessageRecord | null;
  beforeMessages: MessageRecord[];
  afterMessages: MessageRecord[];
}

export interface SearchMessagesOptions {
  chatJid?: string;
  limit?: number;
}

export class MessagesRepository {
  constructor(private db: Database) {}

  upsertMessage(msg: MessageRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO messages (
        id, chat_jid, sender_jid, timestamp, from_me, message_type, text_content, media_path, media_mime, raw_payload, status
      )
      VALUES (
        @id, @chatJid, @senderJid, @timestamp, @fromMe, @messageType, @textContent, @mediaPath, @mediaMime, @rawPayload, @status
      )
      ON CONFLICT(chat_jid, id) DO UPDATE SET
        timestamp = excluded.timestamp,
        message_type = excluded.message_type,
        text_content = COALESCE(excluded.text_content, messages.text_content),
        media_path = COALESCE(excluded.media_path, messages.media_path),
        media_mime = COALESCE(excluded.media_mime, messages.media_mime),
        raw_payload = COALESCE(excluded.raw_payload, messages.raw_payload),
        status = excluded.status
    `);

    stmt.run({
      id: msg.id,
      chatJid: msg.chatJid,
      senderJid: msg.senderJid,
      timestamp: msg.timestamp,
      fromMe: msg.fromMe ? 1 : 0,
      messageType: msg.messageType ?? "text",
      textContent: msg.textContent ?? null,
      mediaPath: msg.mediaPath ?? null,
      mediaMime: msg.mediaMime ?? null,
      rawPayload: msg.rawPayload ?? null,
      status: msg.status ?? "received",
    });
  }

  getMessage(chatJid: string, id: string): MessageRecord | null {
    const row = this.db.prepare("SELECT * FROM messages WHERE chat_jid = ? AND id = ?").get(chatJid, id) as any;
    if (!row) return null;
    return this.mapRow(row);
  }

  getRawMessage(chatJid: string, id: string): string | null {
    const row = this.db.prepare("SELECT raw_payload FROM messages WHERE chat_jid = ? AND id = ?").get(chatJid, id) as any;
    return row?.raw_payload ?? null;
  }

  listMessages(chatJid: string, options: ListMessagesOptions = {}): MessageRecord[] {
    const limit = Math.min(options.limit ?? LIMITS.DEFAULT_MESSAGE_HISTORY_LIMIT, LIMITS.MAX_MESSAGE_HISTORY_LIMIT);
    const conditions: string[] = ["chat_jid = ?"];
    const params: any[] = [chatJid];

    if (options.beforeTimestamp) {
      conditions.push("timestamp < ?");
      params.push(options.beforeTimestamp);
    }

    const sql = `
      SELECT * FROM messages
      WHERE ${conditions.join(" AND ")}
      ORDER BY timestamp DESC
      LIMIT ?
    `;
    params.push(limit);

    const rows = this.db.prepare(sql).all(...params) as any[];
    // Return in chronological order
    return rows.reverse().map((r) => this.mapRow(r));
  }

  getMessageContext(chatJid: string, messageId: string, contextSize: number = LIMITS.DEFAULT_CONTEXT_SIZE): MessageContextResult {
    const boundedSize = Math.min(contextSize, LIMITS.MAX_CONTEXT_SIZE);
    const target = this.getMessage(chatJid, messageId);

    if (!target) {
      return { targetMessage: null, beforeMessages: [], afterMessages: [] };
    }

    // Messages before target (chronologically earlier)
    const beforeRows = this.db.prepare(`
      SELECT * FROM messages
      WHERE chat_jid = ? AND timestamp <= ? AND id != ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(chatJid, target.timestamp, target.id, boundedSize) as any[];

    // Messages after target (chronologically later)
    const afterRows = this.db.prepare(`
      SELECT * FROM messages
      WHERE chat_jid = ? AND timestamp >= ? AND id != ?
      ORDER BY timestamp ASC
      LIMIT ?
    `).all(chatJid, target.timestamp, target.id, boundedSize) as any[];

    return {
      targetMessage: target,
      beforeMessages: beforeRows.reverse().map((r) => this.mapRow(r)),
      afterMessages: afterRows.map((r) => this.mapRow(r)),
    };
  }

  searchMessages(query: string, options: SearchMessagesOptions = {}): MessageRecord[] {
    const limit = Math.min(options.limit ?? LIMITS.DEFAULT_SEARCH_LIMIT, LIMITS.MAX_SEARCH_LIMIT);
    const cleanedQuery = query.replace(/[^\w\s]/gi, "").trim();
    if (!cleanedQuery) return [];

    let sql = `
      SELECT m.* FROM messages m
      JOIN messages_fts fts ON m.id = fts.message_id AND m.chat_jid = fts.chat_jid
      WHERE messages_fts MATCH ?
    `;
    const params: any[] = [`${cleanedQuery}*`];

    if (options.chatJid) {
      sql += " AND m.chat_jid = ?";
      params.push(options.chatJid);
    }

    sql += " ORDER BY m.timestamp DESC LIMIT ?";
    params.push(limit);

    try {
      const rows = this.db.prepare(sql).all(...params) as any[];
      return rows.map((r) => this.mapRow(r));
    } catch {
      // Fallback to LIKE if FTS expression has syntax quirks
      let fallbackSql = "SELECT * FROM messages WHERE text_content LIKE ?";
      const fallbackParams: any[] = [`%${query}%`];
      if (options.chatJid) {
        fallbackSql += " AND chat_jid = ?";
        fallbackParams.push(options.chatJid);
      }
      fallbackSql += " ORDER BY timestamp DESC LIMIT ?";
      fallbackParams.push(limit);
      const fallbackRows = this.db.prepare(fallbackSql).all(...fallbackParams) as any[];
      return fallbackRows.map((r) => this.mapRow(r));
    }
  }

  private mapRow(row: any): MessageRecord {
    return {
      id: row.id,
      chatJid: row.chat_jid,
      senderJid: row.sender_jid,
      timestamp: row.timestamp,
      fromMe: Boolean(row.from_me),
      messageType: row.message_type,
      textContent: row.text_content,
      mediaPath: row.media_path,
      mediaMime: row.media_mime,
      rawPayload: row.raw_payload,
      status: row.status,
    };
  }
}
