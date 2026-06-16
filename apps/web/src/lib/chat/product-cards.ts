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

export interface RetrievedProduct {
  id: string;
  name: string | null;
  url: string;
  currentPriceFormatted: string | null;
  currentPriceCents: number | null;
  currency: string | null;
}

export interface MessageProductSurface {
  /** Every distinct product retrieved this message, in first-seen order. */
  byId: Map<string, RetrievedProduct>;
  /** First `MAX_PRODUCT_CARDS` retrieved products. */
  cards: RetrievedProduct[];
  /** Count of distinct products beyond the cap (`0` when none). */
  overflowCount: number;
}

// Both product tools share this core shape. Unknown extra fields (semantic
// search adds metadata) are stripped by Zod's default object behavior.
const retrievedProductSchema = z.object({
  id: z.string().min(1),
  name: z.string().nullish(),
  url: z.string(),
  currentPriceFormatted: z.string().nullish(),
  currentPriceCents: z.number().nullish(),
  currency: z.string().nullish(),
});

const productArraySchema = z.array(retrievedProductSchema);

function normalize(raw: z.infer<typeof retrievedProductSchema>): RetrievedProduct {
  return {
    id: raw.id,
    name: raw.name ?? null,
    url: raw.url,
    currentPriceFormatted: raw.currentPriceFormatted ?? null,
    currentPriceCents: raw.currentPriceCents ?? null,
    currency: raw.currency ?? null,
  };
}

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
 * Parse a product array out of one tool-result text. Handles the plain-JSON case
 * and the semantic tool's low-confidence form (a prose preamble followed by the
 * JSON array) by retrying from the first `[`. Any failure yields `[]`.
 */
function parseProducts(text: string): RetrievedProduct[] {
  const tryParse = (candidate: string): RetrievedProduct[] | null => {
    let json: unknown;
    try {
      json = JSON.parse(candidate);
    } catch {
      return null;
    }
    const parsed = productArraySchema.safeParse(json);
    return parsed.success ? parsed.data.map(normalize) : null;
  };

  const direct = tryParse(text);
  if (direct) return direct;

  // Low-confidence semantic result: "<prose>:\n[ ...json... ]" → parse the array.
  const start = text.indexOf("[");
  if (start > 0) {
    const fromArray = tryParse(text.slice(start));
    if (fromArray) return fromArray;
  }
  return [];
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
