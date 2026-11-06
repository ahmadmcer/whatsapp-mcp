import fs from "node:fs";
import { useMultiFileAuthState, type AuthenticationState } from "@whiskeysockets/baileys";
import { PATHS } from "../config/env.js";
import { logger } from "../utils/logger.js";

export interface AuthStateWrapper {
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
  isRegistered: boolean;
  clearAuth: () => void;
}

export async function loadAuthState(authDir: string = PATHS.AUTH_DIR): Promise<AuthStateWrapper> {
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const isRegistered = Boolean(state.creds?.registered);

  const clearAuth = () => {
    try {
      if (fs.existsSync(authDir)) {
        fs.rmSync(authDir, { recursive: true, force: true });
        fs.mkdirSync(authDir, { recursive: true });
        logger.info({ authDir }, "Cleared authentication credentials directory");
      }
    } catch (err) {
      logger.error({ err }, "Failed to clear auth directory");
    }
  };

  return {
    state,
    saveCreds,
    isRegistered,
    clearAuth,
  };
}
