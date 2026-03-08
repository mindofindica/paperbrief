import { describe, expect, it } from "vitest";
import {
  TRACK_TEMPLATES,
  getTemplateByKey,
  validateTemplateKeys,
} from "./track-templates";

describe("TRACK_TEMPLATES", () => {
  it("has at least 8 templates", () => {
    expect(TRACK_TEMPLATES.length).toBeGreaterThanOrEqual(8);
  });

  it("every template has a unique key", () => {
    const keys = TRACK_TEMPLATES.map((t) => t.key);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });

  it("every template has required fields with correct types", () => {
    for (const t of TRACK_TEMPLATES) {
      expect(typeof t.key).toBe("string");
      expect(typeof t.emoji).toBe("string");
      expect(typeof t.name).toBe("string");
      expect(typeof t.description).toBe("string");
      expect(Array.isArray(t.keywords)).toBe(true);
      expect(t.keywords.length).toBeGreaterThan(0);
      expect(Array.isArray(t.arxiv_cats)).toBe(true);
      expect(t.arxiv_cats.length).toBeGreaterThan(0);
      expect(typeof t.min_score).toBe("number");
      expect(t.min_score).toBeGreaterThan(0);
      expect(t.min_score).toBeLessThanOrEqual(1);
    }
  });

  it("every template has at least 4 keywords", () => {
    for (const t of TRACK_TEMPLATES) {
      expect(t.keywords.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("includes expected template keys", () => {
    const keys = TRACK_TEMPLATES.map((t) => t.key);
    expect(keys).toContain("llms");
    expect(keys).toContain("agents");
    expect(keys).toContain("computer_vision");
    expect(keys).toContain("safety");
  });
});

describe("getTemplateByKey", () => {
  it("returns the correct template for a known key", () => {
    const t = getTemplateByKey("llms");
    expect(t).toBeDefined();
    expect(t?.name).toContain("Language Model");
  });

  it("returns undefined for an unknown key", () => {
    expect(getTemplateByKey("does-not-exist")).toBeUndefined();
  });
});

describe("validateTemplateKeys", () => {
  it("returns valid=true for all known keys", () => {
    const allKeys = TRACK_TEMPLATES.map((t) => t.key);
    const result = validateTemplateKeys(allKeys);
    expect(result.valid).toBe(true);
    expect(result.unknown).toHaveLength(0);
  });

  it("returns valid=false and lists unknown keys", () => {
    const result = validateTemplateKeys(["llms", "fake-key", "another-fake"]);
    expect(result.valid).toBe(false);
    expect(result.unknown).toContain("fake-key");
    expect(result.unknown).toContain("another-fake");
  });

  it("returns valid=true for a single valid key", () => {
    const result = validateTemplateKeys(["agents"]);
    expect(result.valid).toBe(true);
  });

  it("returns valid=false for an empty-looking unknown key", () => {
    const result = validateTemplateKeys([""]);
    expect(result.valid).toBe(false);
  });
});
