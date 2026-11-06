import type { Database } from "better-sqlite3";

export interface GroupParticipant {
  id: string;
  admin?: "admin" | "superadmin" | null;
}

export interface GroupMetadataRecord {
  jid: string;
  subject: string;
  description?: string | null;
  ownerJid?: string | null;
  creationTimestamp?: number;
  participants: GroupParticipant[];
  updatedAt?: number;
}

export class GroupsRepository {
  constructor(private db: Database) {}

  upsertGroup(group: GroupMetadataRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO groups_metadata (jid, subject, description, owner_jid, creation_timestamp, participants_json, updated_at)
      VALUES (@jid, @subject, @description, @ownerJid, @creationTimestamp, @participantsJson, @updatedAt)
      ON CONFLICT(jid) DO UPDATE SET
        subject = excluded.subject,
        description = excluded.description,
        owner_jid = excluded.owner_jid,
        creation_timestamp = excluded.creation_timestamp,
        participants_json = excluded.participants_json,
        updated_at = excluded.updated_at
    `);

    stmt.run({
      jid: group.jid,
      subject: group.subject,
      description: group.description ?? null,
      ownerJid: group.ownerJid ?? null,
      creationTimestamp: group.creationTimestamp ?? 0,
      participantsJson: JSON.stringify(group.participants || []),
      updatedAt: group.updatedAt ?? Date.now(),
    });
  }

  getGroup(jid: string): GroupMetadataRecord | null {
    const row = this.db.prepare("SELECT * FROM groups_metadata WHERE jid = ?").get(jid) as any;
    if (!row) return null;
    return this.mapRow(row);
  }

  listGroups(): GroupMetadataRecord[] {
    const rows = this.db.prepare("SELECT * FROM groups_metadata ORDER BY subject ASC").all() as any[];
    return rows.map((r) => this.mapRow(r));
  }

  private mapRow(row: any): GroupMetadataRecord {
    let participants: GroupParticipant[] = [];
    try {
      if (row.participants_json) {
        participants = JSON.parse(row.participants_json);
      }
    } catch {
      participants = [];
    }

    return {
      jid: row.jid,
      subject: row.subject,
      description: row.description,
      ownerJid: row.owner_jid,
      creationTimestamp: row.creation_timestamp,
      participants,
      updatedAt: row.updated_at,
    };
  }
}
