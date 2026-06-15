import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { getTokenizer } from "./local.js";

/**
 * Token-accurate chunking (feature 008, US2, research D5).
 *
 * Splits the composite document into ~200-token fragments using LangChain's
 * `RecursiveCharacterTextSplitter` with a length function backed by the MiniLM
 * tokenizer — character counts only approximate tokens and can overflow the
 * model's ~256-token window (triggering silent truncation), the exact failure
 * we're avoiding. Each fragment is prefixed with the product identity (research
 * D4) so a specs-only chunk is still self-describing, and `chunkSize` budgets
 * for the prefix so every embedded string stays within the window.
 *
 * Guarantees ≥1 chunk whenever there is any text (document or identity), so a
 * name-only product is indexed, never skipped.
 */

const TARGET_TOKENS = 200;
const OVERLAP_TOKENS = 30;
const MIN_CHUNK_TOKENS = 32;

export async function chunk(document: string, identityPrefix: string): Promise<string[]> {
  const tokenizer = await getTokenizer();
  // `encode` returns the token-id array; its length is the token count.
  const countTokens = (text: string): number => tokenizer.encode(text).length;

  const prefix = identityPrefix.trim();
  const prefixTokens = prefix.length > 0 ? countTokens(prefix) : 0;
  // Leave room for the prefix (+ a newline) within the target window.
  const chunkSize = Math.max(MIN_CHUNK_TOKENS, TARGET_TOKENS - prefixTokens);

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap: OVERLAP_TOKENS,
    lengthFunction: countTokens,
  });

  const fragments = (await splitter.splitText(document.trim())).map((f) => f.trim()).filter((f) => f.length > 0);

  // Nothing to split but we still have an identity → emit the identity alone so
  // the product remains discoverable (≥1 chunk guarantee).
  if (fragments.length === 0) {
    return prefix.length > 0 ? [prefix] : [];
  }

  // Prepend the identity prefix to every fragment that doesn't already lead with
  // it (the first fragment usually starts with the name == prefix, so we avoid
  // duplicating it there).
  return fragments.map((fragment) => {
    if (prefix.length === 0 || fragment.startsWith(prefix)) return fragment;
    return `${prefix}\n${fragment}`;
  });
}
