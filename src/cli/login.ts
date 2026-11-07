import readline from "node:readline";
import qrcode from "qrcode-terminal";
import { baileysClient } from "../core/baileys.js";
import { logger } from "../utils/logger.js";

export async function runInteractiveLogin() {
  console.error("\n=======================================================");
  console.error("      WhatsApp MCP Server - Interactive Login");
  console.error("=======================================================\n");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (query: string): Promise<string> => {
    return new Promise((resolve) => rl.question(query, resolve));
  };

  const choice = await question(
    "Choose pairing method:\n  [1] Scan QR code in terminal (Default)\n  [2] Enter phone number for 8-digit pairing code\nChoice (1/2): "
  );

  const usePairingCode = choice.trim() === "2";

  baileysClient.on("qr", (qr) => {
    if (!usePairingCode) {
      console.error("\nScan this QR code with WhatsApp (Settings -> Linked Devices -> Link a Device):\n");
      qrcode.generate(qr, { small: true });
    }
  });

  baileysClient.on("connected", (user) => {
    console.error("\n[SUCCESS] Successfully linked with WhatsApp!");
    console.error(`Linked Phone: ${user.phoneNumber || user.jid}`);
    if (user.name) console.error(`Account Name: ${user.name}`);
    console.error("\nCredentials saved securely.");
    console.error("You can now start the MCP server or connect it to Claude Desktop / Cursor / Antigravity.\n");
    rl.close();
    process.exit(0);
  });

  baileysClient.on("status", (status) => {
    logger.debug({ status }, "Login status changed");
  });

  console.error("\nInitializing WhatsApp connection...");
  await baileysClient.start();

  if (usePairingCode) {
    const phoneInput = await question(
      "\nEnter your phone number with country code (digits only, e.g. 15551234567 or 6281234567890):\n> "
    );

    try {
      console.error("\nRequesting pairing code from WhatsApp...");
      const code = await baileysClient.requestPairingCode(phoneInput.trim());
      console.error("\n-------------------------------------------------------");
      console.error(`  YOUR PAIRING CODE:  ${code}`);
      console.error("-------------------------------------------------------");
      console.error("\nOn your phone:");
      console.error("1. Open WhatsApp -> Settings -> Linked Devices -> Link a Device");
      console.error("2. Tap 'Link with phone number instead'");
      console.error(`3. Enter the 8-digit code: ${code}\n`);
    } catch (err: any) {
      console.error(`\n[ERROR] Failed to obtain pairing code: ${err.message}`);
      rl.close();
      process.exit(1);
    }
  }
}

const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith("login.ts") || process.argv[1].endsWith("login.js"));

if (isDirectRun) {
  runInteractiveLogin().catch((err) => {
    console.error("Fatal login error:", err);
    process.exit(1);
  });
}
