import { describe, it, expect, vi } from "vitest";
import { RateLimiterQueue } from "../../src/core/rate-limiter.js";

describe("RateLimiterQueue", () => {
  it("enforces sequential execution for queued tasks", async () => {
    const queue = new RateLimiterQueue({ minJitterMs: 20, maxJitterMs: 50 });
    const order: number[] = [];

    const p1 = queue.enqueue(async () => {
      order.push(1);
      return "res1";
    });

    const p2 = queue.enqueue(async () => {
      order.push(2);
      return "res2";
    });

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe("res1");
    expect(r2).toBe("res2");
    expect(order).toEqual([1, 2]);
  });

  it("supports dryRun bypass without executing side effects", async () => {
    const queue = new RateLimiterQueue({ minJitterMs: 5, maxJitterMs: 10 });
    const sideEffect = vi.fn();

    const result = await queue.executeWithSimulation({
      recipientJid: "user1@s.whatsapp.net",
      dryRun: true,
      action: async () => {
        sideEffect();
        return { messageId: "real-id" };
      },
    });

    expect(sideEffect).not.toHaveBeenCalled();
    expect(result.dryRun).toBe(true);
    expect(result.simulated).toBe(true);
  });

  it("executes simulated composing presence and action when not dryRun", async () => {
    const queue = new RateLimiterQueue({ minJitterMs: 10, maxJitterMs: 20 });
    const sendComposing = vi.fn().mockResolvedValue(undefined);
    const action = vi.fn().mockResolvedValue({ messageId: "sent-123" });

    const result = await queue.executeWithSimulation({
      recipientJid: "user1@s.whatsapp.net",
      dryRun: false,
      sendComposing,
      action,
    });

    expect(sendComposing).toHaveBeenCalledWith("user1@s.whatsapp.net");
    expect(action).toHaveBeenCalled();
    expect(result.messageId).toBe("sent-123");
  });
});
