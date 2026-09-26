/** 1–3 emoji and nothing else → shown big, without a bubble (like WhatsApp / iMessage). */
const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier}|‍\p{Extended_Pictographic}️?)*|\p{Regional_Indicator}{2}|\s)+$/u;

export function bigEmojiCount(text: string): number {
  const t = text.trim();
  if (!t || t.length > 40 || !EMOJI_ONLY.test(t)) return 0;
  const n = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(t)].filter((s) => s.segment.trim()).length;
  return n <= 3 ? n : 0;
}
