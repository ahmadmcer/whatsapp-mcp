import type { Database } from "better-sqlite3";
import { LIMITS } from "../config/constants.js";

export interface ChatRecord {
  jid: string;
  name?: string | null;
  unreadCount?: number;
  lastMessageTimestamp?: number;
  isGroup?: boolean;
  isArchived?: boolean;
  isPinned?: boolean;
  updatedAt?: number;
}

export interface ListChatsOptions {
  limit?: number;
  query?: string;
  unreadOnly?: boolean;
}

export class ChatsRepository {
  constructor(private db: Database) {}

  upsertChat(chat: ChatRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO chats (jid, name, unread_count, last_message_timestamp, is_group, is_archived, is_pinned, updated_at)
      VALUES (@jid, @name, @unreadCount, @lastMessageTimestamp, @isGroup, @isArchived, @isPinned, @updatedAt)
      ON CONFLICT(jid) DO UPDATE SET
        name = COALESCE(excluded.name, chats.name),
        unread_count = COALESCE(excluded.unread_count, chats.unread_count),
        last_message_timestamp = MAX(chats.last_message_timestamp, excluded.last_message_timestamp),
        is_group = COALESCE(excluded.is_group, chats.is_group),
        is_archived = COALESCE(excluded.is_archived, chats.is_archived),
        is_pinned = COALESCE(excluded.is_pinned, chats.is_pinned),
        updated_at = excluded.updated_at
    `);

    stmt.run({
      jid: chat.jid,
      name: chat.name ?? null,
      unreadCount: chat.unreadCount ?? 0,
      lastMessageTimestamp: chat.lastMessageTimestamp ?? 0,
      isGroup: chat.isGroup ? 1 : 0,
      isArchived: chat.isArchived ? 1 : 0,
      isPinned: chat.isPinned ? 1 : 0,
      updatedAt: chat.updatedAt ?? Date.now(),
    });
  }

  getChat(jid: string): ChatRecord | null {
    const row = this.db.prepare("SELECT * FROM chats WHERE jid = ?").get(jid) as any;
    if (!row) return null;
    return this.mapRow(row);
  }

  listChats(options: ListChatsOptions = {}): ChatRecord[] {
    const limit = Math.min(options.limit ?? LIMITS.DEFAULT_CHAT_LIST_LIMIT, LIMITS.MAX_CHAT_LIST_LIMIT);
    const conditions: string[] = [];
    const params: any[] = [];

    if (options.unreadOnly) {
      conditions.push("unread_count > 0");
    }

    if (options.query) {
      conditions.push("(name LIKE ? OR jid LIKE ?)");
      params.push(`%${options.query}%`, `%${options.query}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const sql = `
      SELECT * FROM chats
      ${whereClause}
      ORDER BY last_message_timestamp DESC
      LIMIT ?
    `;

    params.push(limit);
    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map((r) => this.mapRow(r));
  }

  markChatRead(jid: string): void {
    this.db.prepare("UPDATE chats SET unread_count = 0, updated_at = ? WHERE jid = ?").run(Date.now(), jid);
  }

  private mapRow(row: any): ChatRecord {
    return {
      jid: row.jid,
      name: row.name,
      unreadCount: row.unread_count,
      lastMessageTimestamp: row.last_message_timestamp,
      isGroup: Boolean(row.is_group),
      isArchived: Boolean(row.is_archived),
      isPinned: Boolean(row.is_pinned),
      updatedAt: row.updated_at,
    };
  }
}
