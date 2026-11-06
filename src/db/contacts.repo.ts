import type { Database } from "better-sqlite3";

export interface ContactRecord {
  jid: string;
  name?: string | null;
  notifyName?: string | null;
  verifiedName?: string | null;
  statusText?: string | null;
  updatedAt?: number;
}

export interface ListContactsOptions {
  query?: string;
  limit?: number;
}

export class ContactsRepository {
  constructor(private db: Database) {}

  upsertContact(contact: ContactRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO contacts (jid, name, notify_name, verified_name, status_text, updated_at)
      VALUES (@jid, @name, @notifyName, @verifiedName, @statusText, @updatedAt)
      ON CONFLICT(jid) DO UPDATE SET
        name = COALESCE(excluded.name, contacts.name),
        notify_name = COALESCE(excluded.notify_name, contacts.notify_name),
        verified_name = COALESCE(excluded.verified_name, contacts.verified_name),
        status_text = COALESCE(excluded.status_text, contacts.status_text),
        updated_at = excluded.updated_at
    `);

    stmt.run({
      jid: contact.jid,
      name: contact.name ?? null,
      notifyName: contact.notifyName ?? null,
      verifiedName: contact.verifiedName ?? null,
      statusText: contact.statusText ?? null,
      updatedAt: contact.updatedAt ?? Date.now(),
    });
  }

  getContact(jid: string): ContactRecord | null {
    const row = this.db.prepare("SELECT * FROM contacts WHERE jid = ?").get(jid) as any;
    if (!row) return null;
    return this.mapRow(row);
  }

  listContacts(options: ListContactsOptions = {}): ContactRecord[] {
    const limit = options.limit ?? 50;
    const conditions: string[] = [];
    const params: any[] = [];

    if (options.query) {
      conditions.push("(name LIKE ? OR notify_name LIKE ? OR jid LIKE ?)");
      params.push(`%${options.query}%`, `%${options.query}%`, `%${options.query}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const sql = `
      SELECT * FROM contacts
      ${whereClause}
      ORDER BY COALESCE(name, notify_name) ASC
      LIMIT ?
    `;
    params.push(limit);

    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map((r) => this.mapRow(r));
  }

  private mapRow(row: any): ContactRecord {
    return {
      jid: row.jid,
      name: row.name,
      notifyName: row.notify_name,
      verifiedName: row.verified_name,
      statusText: row.status_text,
      updatedAt: row.updated_at,
    };
  }
}
