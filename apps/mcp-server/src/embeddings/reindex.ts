import { db, eq, productEmbeddings, products } from "@price-monitor/db";
import { chunk } from "./chunk.js";
import { buildDocument, buildIdentityPrefix } from "./document.js";
import { embedTexts } from "./provider.js";

/**
 * Reindex one product's embeddings (feature 008, US2).
 *
 * Load the product + its 007 metadata → build the composite document → chunk it
 * (token-accurate, identity-prefixed) → embed each chunk → **delete-and-replace**
 * the product's `product_embeddings` rows in a single transaction (FR-012). The
 * transaction makes the swap atomic so a concurrent search sees the old set or
 * the new set, never a half-written one.
 *
 * The model is loaded only here / in search — this is the single embedding
 * authority. Callers (worker job, backfill) reach this via the HTTP endpoint.
 */

/** Thrown when the product id does not exist, so the HTTP route can return 404. */
export class ProductNotFoundError extends Error {
  constructor(public readonly productId: string) {
    super(`product not found: ${productId}`);
    this.name = "ProductNotFoundError";
  }
}

export async function reindexProduct(productId: string): Promise<number> {
  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
    columns: {
      name: true,
      brand: true,
      category: true,
      countryOfOrigin: true,
      description: true,
      attributes: true,
    },
  });

  if (!product) {
    throw new ProductNotFoundError(productId);
  }

  const document = buildDocument(product);
  const identityPrefix = buildIdentityPrefix(product);
  const contents = await chunk(document, identityPrefix);

  const embeddings = await embedTexts(contents);
  const rows = contents.map((content, chunkIndex) => {
    const embedding = embeddings[chunkIndex];
    if (!embedding) {
      throw new Error(`embedding missing for chunk ${chunkIndex} of product ${productId}`);
    }
    return { productId, chunkIndex, content, embedding };
  });

  // Atomic delete-and-replace: a concurrent reader sees old-or-new, never half.
  await db.transaction(async (tx) => {
    await tx.delete(productEmbeddings).where(eq(productEmbeddings.productId, productId));
    if (rows.length > 0) {
      await tx.insert(productEmbeddings).values(rows);
    }
  });

  return rows.length;
}
