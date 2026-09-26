import { describe, expect, it } from "vitest";
import { bigEmojiCount } from "./chatText";

describe("bigEmojiCount", () => {
  it("counts 1–3 emoji (incl. skin tones, ZWJ, flags)", () => {
    expect(bigEmojiCount("❤️")).toBe(1);
    expect(bigEmojiCount("😂😂")).toBe(2);
    expect(bigEmojiCount("👍🏽 👨‍👩‍👧 🇮🇳")).toBe(3);
  });
  it("ignores text, 4+ emoji and plain digits", () => {
    expect(bigEmojiCount("hi ❤️")).toBe(0);
    expect(bigEmojiCount("😂😂😂😂")).toBe(0);
    expect(bigEmojiCount("123")).toBe(0);
    expect(bigEmojiCount("")).toBe(0);
  });
});
