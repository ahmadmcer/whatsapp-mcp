import { RATE_LIMIT } from "../config/constants.js";
import { logger } from "../utils/logger.js";

export interface RateLimiterOptions {
  minJitterMs?: number;
  maxJitterMs?: number;
  composingDelayMs?: number;
}

export interface SimulationOptions<T> {
  recipientJid: string;
  dryRun?: boolean;
  sendComposing?: (jid: string) => Promise<void>;
  action: () => Promise<T>;
}

export class RateLimiterQueue {
  private queue: Promise<any> = Promise.resolve();
  private minJitterMs: number;
  private maxJitterMs: number;
  private composingDelayMs: number;

  constructor(options: RateLimiterOptions = {}) {
    this.minJitterMs = options.minJitterMs ?? RATE_LIMIT.MIN_JITTER_MS;
    this.maxJitterMs = options.maxJitterMs ?? RATE_LIMIT.MAX_JITTER_MS;
    this.composingDelayMs = options.composingDelayMs ?? RATE_LIMIT.COMPOSING_DELAY_MS;
  }

  /**
   * Enqueues a task to be executed strictly sequentially.
   */
  enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(async () => {
      try {
        return await task();
      } finally {
        // Apply jitter between successive queued tasks
        const jitter = this.getRandomJitter();
        await this.sleep(jitter);
      }
    });

    // Update queue pointer catching errors so subsequent tasks still run
    this.queue = next.catch((err) => {
      logger.error({ err }, "Error in RateLimiterQueue task");
    });

    return next;
  }

  /**
   * Executes an outbound message action with human typing presence and jitter simulation.
   */
  async executeWithSimulation<T>(options: SimulationOptions<T>): Promise<T | any> {
    if (options.dryRun) {
      logger.info(
        { recipient: options.recipientJid },
        "[DRY RUN] Outbound action simulated without network dispatch"
      );
      return {
        success: true,
        dryRun: true,
        simulated: true,
        recipient: options.recipientJid,
        timestamp: Date.now(),
      };
    }

    return this.enqueue(async () => {
      // Step 1: Send typing presence
      if (options.sendComposing) {
        try {
          await options.sendComposing(options.recipientJid);
          await this.sleep(this.composingDelayMs);
        } catch (err) {
          logger.warn({ err, recipient: options.recipientJid }, "Could not send composing presence update");
        }
      }

      // Step 2: Execute action
      return await options.action();
    });
  }

  private getRandomJitter(): number {
    return Math.floor(Math.random() * (this.maxJitterMs - this.minJitterMs + 1)) + this.minJitterMs;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const rateLimiter = new RateLimiterQueue();
