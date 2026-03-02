import { describe, it, expect } from "vitest";
import { generateInviteToken } from "../invite-token";

describe("generateInviteToken", () => {
  it("returns a non-empty string", () => {
    expect(typeof generateInviteToken()).toBe("string");
    expect(generateInviteToken().length).toBeGreaterThan(0);
  });

  it("produces URL-safe characters only (no +, /, or =)", () => {
    for (let i = 0; i < 20; i++) {
      const token = generateInviteToken();
      expect(token).not.toMatch(/[+/=]/);
    }
  });

  it("generates unique tokens", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateInviteToken()));
    expect(tokens.size).toBe(100);
  });

  it("uses default byte length producing ~32 char token", () => {
    const token = generateInviteToken();
    // 24 bytes → 32 base64 chars (base64url strips =)
    expect(token.length).toBeGreaterThanOrEqual(30);
    expect(token.length).toBeLessThanOrEqual(36);
  });

  it("respects custom byte length", () => {
    const short = generateInviteToken(8);
    const long = generateInviteToken(48);
    expect(short.length).toBeLessThan(long.length);
  });
});
