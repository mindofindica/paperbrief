import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { checkRateLimit, _resetStore } from "./rate-limiter";

describe("checkRateLimit", () => {
  beforeEach(() => {
    _resetStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows first attempt", () => {
    const result = checkRateLimit("1.2.3.4");
    expect(result.limited).toBe(false);
    expect(result.remaining).toBe(2);
  });

  it("counts down remaining on each attempt", () => {
    expect(checkRateLimit("1.2.3.4").remaining).toBe(2);
    expect(checkRateLimit("1.2.3.4").remaining).toBe(1);
    expect(checkRateLimit("1.2.3.4").remaining).toBe(0);
  });

  it("blocks after maxAttempts exceeded", () => {
    checkRateLimit("1.2.3.4");
    checkRateLimit("1.2.3.4");
    checkRateLimit("1.2.3.4");
    const result = checkRateLimit("1.2.3.4");
    expect(result.limited).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("tracks different IPs independently", () => {
    checkRateLimit("1.1.1.1");
    checkRateLimit("1.1.1.1");
    checkRateLimit("1.1.1.1");
    expect(checkRateLimit("1.1.1.1").limited).toBe(true);
    expect(checkRateLimit("2.2.2.2").limited).toBe(false);
  });

  it("respects custom maxAttempts", () => {
    checkRateLimit("5.5.5.5", { maxAttempts: 1 });
    const result = checkRateLimit("5.5.5.5", { maxAttempts: 1 });
    expect(result.limited).toBe(true);
  });

  it("resets after window expires", () => {
    const oneHour = 60 * 60 * 1000;
    checkRateLimit("7.7.7.7");
    checkRateLimit("7.7.7.7");
    checkRateLimit("7.7.7.7");
    expect(checkRateLimit("7.7.7.7").limited).toBe(true);

    // Advance clock by 1 hour + 1ms → old attempts expire
    vi.advanceTimersByTime(oneHour + 1);

    const afterExpiry = checkRateLimit("7.7.7.7");
    expect(afterExpiry.limited).toBe(false);
    expect(afterExpiry.remaining).toBe(2);
  });

  it("doesn't reset before window expires", () => {
    checkRateLimit("8.8.8.8");
    checkRateLimit("8.8.8.8");
    checkRateLimit("8.8.8.8");
    vi.advanceTimersByTime(30 * 60 * 1000); // 30 min — still in window
    expect(checkRateLimit("8.8.8.8").limited).toBe(true);
  });

  it("allows 'unknown' IP (doesn't crash)", () => {
    const result = checkRateLimit("unknown");
    expect(result.limited).toBe(false);
  });
});
