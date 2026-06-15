import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * chunk() splits a document into ~200-token fragments and prefixes each with the
 * product identity. We mock the tokenizer (word-count stands in for tokens) so
 * no model is loaded, but use the REAL RecursiveCharacterTextSplitter so the
 * recursive boundary + overlap behavior is exercised. The contract: bounded
 * fragment sizes, overlap present, single-chunk degradation for short input,
 * identity prefix on every chunk, and no content silently dropped.
 */

const localMock = vi.hoisted(() => ({
  getTokenizer: vi.fn(async () => ({
    // Token == whitespace-separated word, a deterministic stand-in.
    encode: (t: string) => (t.trim() ? t.trim().split(/\s+/) : []),
  })),
}));

vi.mock("./local.js", () => localMock);

import { chunk } from "./chunk";

const PREFIX = "Widget — Acme (Monitors)";
const PREFIX_TOKENS = PREFIX.split(/\s+/).length;
const TARGET_TOKENS = 200;
const expectedMaxFragmentTokens = TARGET_TOKENS - PREFIX_TOKENS;

/** Strip the prepended identity prefix back off a chunk to inspect the fragment. */
function fragmentOf(c: string): string {
  if (c === PREFIX) return "";
  return c.startsWith(`${PREFIX}\n`) ? c.slice(PREFIX.length + 1) : c;
}

function tokenCount(s: string): number {
  return s.trim() ? s.trim().split(/\s+/).length : 0;
}

beforeEach(() => {
  localMock.getTokenizer.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("chunk", () => {
  it("returns a single chunk for short input (no needless splitting)", async () => {
    const chunks = await chunk("A compact colour-accurate monitor.", PREFIX);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.startsWith(PREFIX)).toBe(true);
  });

  it("splits long input into multiple bounded fragments, each within the token window", async () => {
    const words = Array.from({ length: 600 }, (_, i) => `w${i}`).join(" ");
    const chunks = await chunk(words, PREFIX);

    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      // prefix budget keeps every embedded string within the ~256 token window
      expect(tokenCount(fragmentOf(c))).toBeLessThanOrEqual(expectedMaxFragmentTokens);
      expect(tokenCount(c)).toBeLessThanOrEqual(TARGET_TOKENS);
    }
  });

  it("prepends the identity prefix to every chunk", async () => {
    const words = Array.from({ length: 600 }, (_, i) => `w${i}`).join(" ");
    const chunks = await chunk(words, PREFIX);
    for (const c of chunks) {
      expect(c.startsWith(PREFIX)).toBe(true);
    }
  });

  it("produces overlap between consecutive chunks (repeated tokens)", async () => {
    const words = Array.from({ length: 600 }, (_, i) => `w${i}`).join(" ");
    const chunks = await chunk(words, PREFIX);

    const fragmentTokenTotal = chunks.reduce((sum, c) => sum + tokenCount(fragmentOf(c)), 0);
    const uniqueTokens = new Set(chunks.flatMap((c) => fragmentOf(c).split(/\s+/)).filter(Boolean));
    // Overlap means some tokens appear in more than one chunk.
    expect(fragmentTokenTotal).toBeGreaterThan(uniqueTokens.size);
  });

  it("drops no content — every input token survives in some chunk", async () => {
    const words = Array.from({ length: 600 }, (_, i) => `w${i}`);
    const chunks = await chunk(words.join(" "), PREFIX);
    const seen = new Set(chunks.flatMap((c) => fragmentOf(c).split(/\s+/)).filter(Boolean));
    for (const w of words) {
      expect(seen.has(w)).toBe(true);
    }
  });

  it("emits the identity alone when the document is empty (≥1 chunk, never skipped)", async () => {
    const chunks = await chunk("", PREFIX);
    expect(chunks).toEqual([PREFIX]);
  });

  it("returns no chunks only when there is truly nothing to embed", async () => {
    const chunks = await chunk("", "");
    expect(chunks).toEqual([]);
  });
});
