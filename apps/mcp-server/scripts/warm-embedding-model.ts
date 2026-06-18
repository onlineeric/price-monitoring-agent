/**
 * Build-time model warm step (feature 008, research D3).
 *
 * Runs the local embedding pipeline once so the MiniLM int8 weights are
 * downloaded into `EMBEDDING_CACHE_DIR` and baked into the Docker image. After
 * this, a running production container (with `TRANSFORMERS_OFFLINE=1` /
 * `allowRemoteModels=false`) never reaches the Hugging Face Hub — cold start is
 * deterministic and offline-safe.
 *
 * Invoked from the Dockerfile with `NODE_ENV` NOT set to production (so the
 * download is allowed) and `EMBEDDING_CACHE_DIR` pointing at the baked path.
 */
import { embedLocal } from "../src/embeddings/local.js";

async function main(): Promise<void> {
  console.log(`[warm] downloading + warming embedding model into ${process.env.EMBEDDING_CACHE_DIR ?? "(default cache)"}`);
  const [vector] = await embedLocal(["warm up the embedding model"]);
  console.log(`[warm] done — produced a ${vector?.length ?? 0}-dim vector`);
}

main().catch((err) => {
  console.error("[warm] failed:", err);
  process.exit(1);
});
