/**
 * Utilities for WhatsApp JID manipulation and validation.
 */

export const JID_DOMAINS = {
  USER: "@s.whatsapp.net",
  GROUP: "@g.us",
  BROADCAST: "@broadcast",
  LID: "@lid",
} as const;

/**
 * Normalizes input string (phone number, raw JID, or group JID) into a valid JID.
 */
export function toJid(input: string): string {
  if (!input) return "";

  const trimmed = input.trim();

  // If already has a valid WhatsApp domain
  if (
    trimmed.endsWith(JID_DOMAINS.USER) ||
    trimmed.endsWith(JID_DOMAINS.GROUP) ||
    trimmed.endsWith(JID_DOMAINS.BROADCAST) ||
    trimmed.endsWith(JID_DOMAINS.LID)
  ) {
    return trimmed;
  }

  // Legacy group format is <creatorNumber>-<timestamp> (single hyphen between digits)
  if (/^\d+-\d+$/.test(trimmed)) {
    return `${trimmed}${JID_DOMAINS.GROUP}`;
  }

  // Strip non-digits
  const digits = trimmed.replace(/\D/g, "");
  return `${digits}${JID_DOMAINS.USER}`;
}

/**
 * Checks if the JID is a WhatsApp group.
 */
export function isGroupJid(jid: string): boolean {
  return typeof jid === "string" && jid.endsWith(JID_DOMAINS.GROUP);
}

/**
 * Checks if the JID is a standard individual user.
 */
export function isUserJid(jid: string): boolean {
  return typeof jid === "string" && jid.endsWith(JID_DOMAINS.USER);
}

/**
 * Extracts phone number digits from an individual user JID.
 */
export function jidToPhoneNumber(jid: string): string | null {
  if (!isUserJid(jid)) return null;
  return jid.replace(JID_DOMAINS.USER, "");
}

/**
 * Formats a JID for clean human-readable display.
 */
export function formatJidForDisplay(jid: string): string {
  if (isUserJid(jid)) {
    return `+${jidToPhoneNumber(jid)}`;
  }
  if (isGroupJid(jid)) {
    const id = jid.replace(JID_DOMAINS.GROUP, "");
    return `Group (${id})`;
  }
  return jid;
}
