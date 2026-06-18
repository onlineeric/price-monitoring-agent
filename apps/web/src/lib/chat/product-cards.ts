import { z } from "zod";

import type { ToolCallEvent } from "@/stores/chat/types";

/**
 * Extracts the products a chat assistant retrieved in a single reply, from the
 * raw tool results stored on its `toolEvents`. This is the ONE parse that feeds
 * BOTH product surfaces (009):
 *   - `cards`        → the clickable product card list (capped at 5 + overflow).
 *   - `byId`         → the resolution set for inline `product:<id>` links
 *                      (an inline mention only acts if its id is in here).
 *
 * It is deliberately tolerant: anything that is not a well-formed product array
 * (the "No products found." sentence, a low-confidence prose preamble, malformed
 * JSON, a failed tool) contributes nothing rather than throwing.
 */

const PRODUCT_TOOL_NAMES = new Set(["search_products", "semantic_search_products"]);

/** Max cards shown per reply (spec FR-009 / clarification: cap 5 + "+N more"). */
export const MAX_PRODUCT_CARDS = 5;

/**
 * Fragment-scheme prefix for inline product links (`#product-<id>`). A fragment
 * (not a custom `product:` protocol) so it survives Streamdown's rehype-sanitize
 * allow-list untouched. Single source of truth for the three-way contract: the
 * system prompt instructs the model to emit this exact form, `markdown-content`
 * parses it, and the sanitizer passes it through.
 */
export const PRODUCT_LINK_PREFIX = "#product-";

// Both product tools share this core shape. Optional display fields normalize to
// `null` (never `undefined`) via `.default(null)`; unknown extra fields (semantic
// search adds metadata) are stripped by Zod's default object behavior.
const retrievedProductSchema = z.object({
  id: z.string().min(1),
  name: z.string().nullable().default(null),
  url: z.string(),
  currentPriceFormatted: z.string().nullable().default(null),
});

/**
 * A product parsed out of a chat tool result. Zod-inferred — the schema above is
 * the single source of truth for the shape.
 */
export type RetrievedProduct = z.infer<typeof retrievedProductSchema>;

export interface MessageProductSurface {
  /** Every distinct product retrieved this message, in first-seen order. */
  byId: Map<string, RetrievedProduct>;
  /** First `MAX_PRODUCT_CARDS` retrieved products. */
  cards: RetrievedProduct[];
  /** Count of distinct products beyond the cap (`0` when none). */
  overflowCount: number;
}

const productArraySchema = z.array(retrievedProductSchema);

/** Collect the `text` payloads from an MCP `CallToolResult`-shaped value. */
function textPartsOf(result: unknown): string[] {
  if (!result || typeof result !== "object") return [];
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) return [];

  const texts: string[] = [];
  for (const part of content) {
    if (
      part &&
      typeof part === "object" &&
      (part as { type?: unknown }).type === "text" &&
      typeof (part as { text?: unknown }).text === "string"
    ) {
      texts.push((part as { text: string }).text);
    }
  }
  return texts;
}

/**
 * Parse a product array out of a single tool-result text part. Product tools emit
 * their machine JSON as its own text part (the semantic tool's low-confidence
 * prose nudge is a SEPARATE part), so a part is either a clean product-array JSON
 * or it is not — anything that doesn't parse to a valid product array yields `[]`.
 */
function parseProducts(text: string): RetrievedProduct[] {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return [];
  }
  const parsed = productArraySchema.safeParse(json);
  return parsed.success ? parsed.data : [];
}

function productsFromEvent(event: ToolCallEvent): RetrievedProduct[] {
  if (event.status !== "completed") return [];
  if (!PRODUCT_TOOL_NAMES.has(event.toolName)) return [];
  return textPartsOf(event.result).flatMap(parseProducts);
}

/**
 * Build the per-message product surface from an assistant message's tool events:
 * merge all product-tool results in event order, dedupe by id (first wins), then
 * derive the capped card list + overflow count.
 */
export function buildMessageProductSurface(toolEvents: ToolCallEvent[]): MessageProductSurface {
  const byId = new Map<string, RetrievedProduct>();
  for (const event of toolEvents) {
    for (const product of productsFromEvent(event)) {
      if (!byId.has(product.id)) {
        byId.set(product.id, product);
      }
    }
  }

  const all = [...byId.values()];
  const cards = all.slice(0, MAX_PRODUCT_CARDS);
  return { byId, cards, overflowCount: all.length - cards.length };
}
