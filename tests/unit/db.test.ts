import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { initDatabase } from "../../src/db/database.js";
import { ChatsRepository } from "../../src/db/chats.repo.js";
import { MessagesRepository } from "../../src/db/messages.repo.js";
import { ContactsRepository } from "../../src/db/contacts.repo.js";
import { GroupsRepository } from "../../src/db/groups.repo.js";

describe("SQLite Database & Repositories", () => {
  let tempDbPath: string;
  let db: ReturnType<typeof initDatabase>;
  let chatsRepo: ChatsRepository;
  let messagesRepo: MessagesRepository;
  let contactsRepo: ContactsRepository;
  let groupsRepo: GroupsRepository;

  beforeEach(() => {
    tempDbPath = path.join(os.tmpdir(), `test-wa-${Date.now()}-${Math.random().toString(36).substring(7)}.db`);
    db = initDatabase(tempDbPath);
    chatsRepo = new ChatsRepository(db);
    messagesRepo = new MessagesRepository(db);
    contactsRepo = new ContactsRepository(db);
    groupsRepo = new GroupsRepository(db);
  });

  afterEach(() => {
    db.close();
    try {
      if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
      const wal = `${tempDbPath}-wal`;
      if (fs.existsSync(wal)) fs.unlinkSync(wal);
      const shm = `${tempDbPath}-shm`;
      if (fs.existsSync(shm)) fs.unlinkSync(shm);
    } catch {
      // Ignored
    }
  });

  describe("Chats Repository", () => {
    it("upserts and lists chats in descending order of last message", () => {
      chatsRepo.upsertChat({
        jid: "user1@s.whatsapp.net",
        name: "Alice",
        unreadCount: 2,
        lastMessageTimestamp: 1000,
        isGroup: false,
      });

      chatsRepo.upsertChat({
        jid: "user2@s.whatsapp.net",
        name: "Bob",
        unreadCount: 0,
        lastMessageTimestamp: 2000,
        isGroup: false,
      });

      const chats = chatsRepo.listChats({ limit: 10 });
      expect(chats).toHaveLength(2);
      expect(chats[0].name).toBe("Bob");
      expect(chats[1].name).toBe("Alice");

      const unreadChats = chatsRepo.listChats({ unreadOnly: true });
      expect(unreadChats).toHaveLength(1);
      expect(unreadChats[0].name).toBe("Alice");
    });
  });

  describe("Messages Repository", () => {
    it("saves and retrieves raw proto message for Baileys retry lookups", () => {
      const rawPayload = JSON.stringify({ conversation: "Hello World" });
      messagesRepo.upsertMessage({
        id: "msg-001",
        chatJid: "user1@s.whatsapp.net",
        senderJid: "user1@s.whatsapp.net",
        timestamp: 1000,
        fromMe: false,
        messageType: "text",
        textContent: "Hello World",
        rawPayload,
      });

      const raw = messagesRepo.getRawMessage("user1@s.whatsapp.net", "msg-001");
      expect(raw).toBe(rawPayload);
    });

    it("retrieves surrounding message context accurately", () => {
      const chatJid = "user1@s.whatsapp.net";
      for (let i = 1; i <= 7; i++) {
        messagesRepo.upsertMessage({
          id: `msg-${i}`,
          chatJid,
          senderJid: chatJid,
          timestamp: 1000 + i * 10,
          fromMe: i % 2 === 0,
          messageType: "text",
          textContent: `Message ${i}`,
        });
      }

      const context = messagesRepo.getMessageContext(chatJid, "msg-4", 2);
      expect(context.targetMessage?.id).toBe("msg-4");
      expect(context.beforeMessages).toHaveLength(2);
      expect(context.beforeMessages.map((m) => m.id)).toEqual(["msg-2", "msg-3"]);
      expect(context.afterMessages).toHaveLength(2);
      expect(context.afterMessages.map((m) => m.id)).toEqual(["msg-5", "msg-6"]);
    });

    it("performs full-text search across indexed messages", () => {
      const chatJid = "user1@s.whatsapp.net";
      messagesRepo.upsertMessage({
        id: "msg-apple",
        chatJid,
        senderJid: chatJid,
        timestamp: 1010,
        fromMe: false,
        messageType: "text",
        textContent: "Remember to buy fresh apples from the store",
      });

      messagesRepo.upsertMessage({
        id: "msg-banana",
        chatJid,
        senderJid: chatJid,
        timestamp: 1020,
        fromMe: false,
        messageType: "text",
        textContent: "We also need yellow bananas today",
      });

      const searchResults = messagesRepo.searchMessages("apples");
      expect(searchResults).toHaveLength(1);
      expect(searchResults[0].id).toBe("msg-apple");
    });
  });

  describe("Contacts and Groups Repositories", () => {
    it("upserts and finds contacts by name or query", () => {
      contactsRepo.upsertContact({
        jid: "12345@s.whatsapp.net",
        name: "Charlie Brown",
        notifyName: "Charlie",
      });

      const results = contactsRepo.listContacts({ query: "Brown" });
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("Charlie Brown");
    });

    it("upserts and retrieves group metadata", () => {
      groupsRepo.upsertGroup({
        jid: "120363025@g.us",
        subject: "Project Core Team",
        description: "Coordination group",
        ownerJid: "user1@s.whatsapp.net",
        creationTimestamp: 1000,
        participants: [
          { id: "user1@s.whatsapp.net", admin: "admin" },
          { id: "user2@s.whatsapp.net", admin: null },
        ],
      });

      const group = groupsRepo.getGroup("120363025@g.us");
      expect(group).not.toBeNull();
      expect(group?.subject).toBe("Project Core Team");
      expect(group?.participants).toHaveLength(2);
    });
  });
});
