import { describe, it, expect } from "vitest";
import { validateEmail } from "./email-validator";

describe("validateEmail", () => {
  // Valid emails
  it("accepts standard email", () => {
    expect(validateEmail("user@example.com")).toBe("user@example.com");
  });

  it("accepts university email", () => {
    expect(validateEmail("j.smith@mit.edu")).toBe("j.smith@mit.edu");
  });

  it("accepts subdomain email", () => {
    expect(validateEmail("me@mail.company.org")).toBe("me@mail.company.org");
  });

  it("normalises to lowercase", () => {
    expect(validateEmail("User@EXAMPLE.COM")).toBe("user@example.com");
  });

  it("trims whitespace", () => {
    expect(validateEmail("  user@example.com  ")).toBe("user@example.com");
  });

  it("normalises uppercase + trims together", () => {
    expect(validateEmail("  MIKEY@GMAIL.COM  ")).toBe("mikey@gmail.com");
  });

  // Invalid emails
  it("rejects missing @", () => {
    expect(validateEmail("notanemail")).toBeNull();
  });

  it("rejects missing domain", () => {
    expect(validateEmail("user@")).toBeNull();
  });

  it("rejects missing TLD", () => {
    expect(validateEmail("user@domain")).toBeNull();
  });

  it("rejects email starting with @", () => {
    expect(validateEmail("@domain.com")).toBeNull();
  });

  it("rejects email with spaces", () => {
    expect(validateEmail("user name@example.com")).toBeNull();
  });

  it("rejects empty string", () => {
    expect(validateEmail("")).toBeNull();
  });

  it("rejects whitespace-only string", () => {
    expect(validateEmail("   ")).toBeNull();
  });

  // Non-string inputs
  it("rejects null", () => {
    expect(validateEmail(null)).toBeNull();
  });

  it("rejects undefined", () => {
    expect(validateEmail(undefined)).toBeNull();
  });

  it("rejects number", () => {
    expect(validateEmail(42)).toBeNull();
  });

  it("rejects object", () => {
    expect(validateEmail({ email: "user@example.com" })).toBeNull();
  });

  it("rejects array", () => {
    expect(validateEmail(["user@example.com"])).toBeNull();
  });
});
