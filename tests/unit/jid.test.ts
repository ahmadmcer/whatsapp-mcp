import { describe, it, expect } from "vitest";
import {
  toJid,
  isGroupJid,
  isUserJid,
  jidToPhoneNumber,
  formatJidForDisplay,
} from "../../src/utils/jid.js";

describe("JID Utility Functions", () => {
  it("normalizes standard phone number strings to user JIDs", () => {
    expect(toJid("15551234567")).toBe("15551234567@s.whatsapp.net");
    expect(toJid("+1 (555) 123-4567")).toBe("15551234567@s.whatsapp.net");
    expect(toJid("62-812-3456-7890")).toBe("6281234567890@s.whatsapp.net");
  });

  it("preserves already qualified JIDs", () => {
    expect(toJid("15551234567@s.whatsapp.net")).toBe("15551234567@s.whatsapp.net");
    expect(toJid("120363025441234567@g.us")).toBe("120363025441234567@g.us");
    expect(toJid("1234567890@lid")).toBe("1234567890@lid");
  });

  it("detects group JIDs correctly", () => {
    expect(isGroupJid("120363025441234567@g.us")).toBe(true);
    expect(isGroupJid("15551234567@s.whatsapp.net")).toBe(false);
  });

  it("detects user JIDs correctly", () => {
    expect(isUserJid("15551234567@s.whatsapp.net")).toBe(true);
    expect(isUserJid("120363025441234567@g.us")).toBe(false);
  });

  it("extracts phone numbers from user JIDs", () => {
    expect(jidToPhoneNumber("15551234567@s.whatsapp.net")).toBe("15551234567");
    expect(jidToPhoneNumber("120363025441234567@g.us")).toBeNull();
  });

  it("formats JIDs for display cleanly", () => {
    expect(formatJidForDisplay("15551234567@s.whatsapp.net")).toBe("+15551234567");
    expect(formatJidForDisplay("120363025441234567@g.us")).toBe("Group (120363025441234567)");
  });
});
