import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { getTokenizer } from "./local.js";

/**
 * Token-accurate chunking (feature 008, US2, research D5).
 *
 * Splits the composite document into ~200-token fragments using LangChain's
 * `RecursiveCharacterTextSplitter` with a length function backed by the MiniLM
 * tokenizer — character counts only approximate tokens and can overflow the
 * model's ~256-token window (triggering silent truncation), the exact failure
 * we're avoiding. Spill-over fragments (deep specs that no longer carry the
 * product name) are prefixed with the product identity (research D4) so they
 * stay self-describing, and `chunkSize` budgets for the prefix so every
 * embedded string stays within the window.
 *
 * The composite document leads with the bare product name, so the first
 * fragment already carries identity (name + the brand/category sections that
 * immediately follow). We therefore skip the prefix on any fragment that
 * already starts with the name — prepending the full `name — brand (category)`
 * prefix there would duplicate the name inside chunk 0 and skew its vector.
 *
 * Guarantees ≥1 chunk whenever there is any text (document or identity), so a
 * name-only product is indexed, never skipped.
 */

const TARGET_TOKENS = 200;
const OVERLAP_TOKENS = 30;
const MIN_CHUNK_TOKENS = 32;

export async function chunk(document: string, identityPrefix: string, productName?: string | null): Promise<string[]> {
  const tokenizer = await getTokenizer();
  // `encode` returns the token-id array; its length is the token count.
  const countTokens = (text: string): number => tokenizer.encode(text).length;

  const prefix = identityPrefix.trim();
  const prefixTokens = prefix.length > 0 ? countTokens(prefix) : 0;
  // Leave room for the prefix (+ a newline) within the target window.
  const chunkSize = Math.max(MIN_CHUNK_TOKENS, TARGET_TOKENS - prefixTokens);
  // Keep overlap well below chunkSize so the splitter always makes forward
  // progress. A very long identity prefix can shrink chunkSize toward
  // MIN_CHUNK_TOKENS (32); a fixed 30-token overlap would then re-include almost
  // the whole previous chunk — exploding into near-duplicate fragments (and
  // LangChain throws outright once overlap ≥ chunkSize).
  const chunkOverlap = Math.min(OVERLAP_TOKENS, Math.floor(chunkSize / 4));

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap,
    lengthFunction: countTokens,
  });

  const fragments = (await splitter.splitText(document.trim())).map((f) => f.trim()).filter((f) => f.length > 0);

  // Nothing to split but we still have an identity → emit the identity alone so
  // the product remains discoverable (≥1 chunk guarantee).
  if (fragments.length === 0) {
    return prefix.length > 0 ? [prefix] : [];
  }

  if (prefix.length === 0) return fragments;

  // Only the FIRST fragment can already be self-describing: the document leads
  // with the product name, and with overlap every later fragment starts with the
  // tail of its predecessor (spec text), never the name. So we scope the
  // skip-prefix check to index 0 — a deeper spec fragment that merely happens to
  // begin with the name (e.g. a short name like "Pro" preceding "Profile: ...")
  // must still get the identity prefix. Match against the bare name when we have
  // it — the full prefix is `name — brand (category)`, which the document never
  // leads with, so matching on the prefix alone would fail and double-prepend the
  // identity onto chunk 0.
  const name = productName?.trim() ?? "";
  const leadsWithIdentity = (fragment: string): boolean =>
    name.length > 0 ? fragment.startsWith(name) : fragment.startsWith(prefix);

  return fragments.map((fragment, index) =>
    index === 0 && leadsWithIdentity(fragment) ? fragment : `${prefix}\n${fragment}`,
  );
}
