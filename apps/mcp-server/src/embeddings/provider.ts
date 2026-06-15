import { getEmbeddingConfig } from "../config.js";
import { dimensions as localDimensions, embedLocal } from "./local.js";

/**
 * Embedding provider seam (feature 008, research D8).
 *
 * Exposes a provider-agnostic surface — `embedTexts`, `embedQuery`,
 * `dimensions` — and dispatches on `EMBEDDING_PROVIDER`. `local` (the default)
 * is the only path built and exercised today; `openai`/`google` are wired as
 * guarded branches that throw a clear, actionable error until someone installs
 * the AI SDK adapter AND migrates the `vector(N)` column to the provider's
 * dimension (1536 for OpenAI, 768 for Google). Switching providers is a
 * deliberate migration, not a runtime toggle.
 */

const NON_LOCAL_PROVIDER_MESSAGE =
  'EMBEDDING_PROVIDER="%p" is not wired. Only "local" is implemented. To use a non-local ' +
  "provider: install `ai` + the matching adapter (`@ai-sdk/openai` or `@ai-sdk/google`) in " +
  "apps/mcp-server, implement the embedMany branch in embeddings/provider.ts, and migrate the " +
  "product_embeddings.embedding column to the provider's dimension (OpenAI 1536, Google 768), " +
  "then re-run the embeddings backfill and rebuild the HNSW index.";

function notWired(provider: string): never {
  throw new Error(NON_LOCAL_PROVIDER_MESSAGE.replace("%p", provider));
}

/** Embed a batch of documents → one vector per input (write/index path). */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const { provider } = getEmbeddingConfig();
  switch (provider) {
    case "local":
      return embedLocal(texts);
    // case "openai": return embedMany(openai.embedding(...), texts);
    // case "google": return embedMany(google.textEmbedding(...), texts);
    default:
      return notWired(provider);
  }
}

/** Embed a single query string → one vector (read/search path). */
export async function embedQuery(query: string): Promise<number[]> {
  const { provider } = getEmbeddingConfig();
  switch (provider) {
    case "local": {
      const [vector] = await embedLocal([query]);
      if (!vector) {
        throw new Error("embedQuery: local model returned no vector");
      }
      return vector;
    }
    default:
      return notWired(provider);
  }
}

/** The active provider's vector dimension (must match the DB column width). */
export function dimensions(): number {
  const { provider } = getEmbeddingConfig();
  switch (provider) {
    case "local":
      return localDimensions;
    default:
      return notWired(provider);
  }
}
