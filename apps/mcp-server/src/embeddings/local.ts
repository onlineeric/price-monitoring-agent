import {
  env,
  type FeatureExtractionPipeline,
  pipeline,
  type PreTrainedTokenizer,
} from "@huggingface/transformers";
import { getEmbeddingConfig } from "../config.js";

/**
 * Local embedding model authority (feature 008).
 *
 * Wraps a Transformers.js feature-extraction pipeline running
 * `Xenova/all-MiniLM-L6-v2` (384-dim, int8 quantized, mean-pooled +
 * normalized). The mcp-server is the ONLY process that loads this model
 * (RAM budget — the worker/backfill never embed), so both query-time search
 * and write-time reindex share this singleton.
 *
 * Module import is side-effect-free: the pipeline is built lazily on first
 * use (`getPipeline()`), matching the project's lazy-init conventions and
 * keeping stdio/HTTP startup from blocking on a model download. In production
 * (`NODE_ENV === "production"`) remote model fetches are disabled — weights
 * are baked into the image's cache dir (Dockerfile, research D3) so a running
 * container never reaches the Hugging Face Hub.
 */

const MODEL_DIMENSIONS = 384;

let pipelinePromise: Promise<FeatureExtractionPipeline> | null = null;

/** Apply Transformers.js env settings once, derived from the embedding config. */
function configureEnv(): void {
  const { cacheDir } = getEmbeddingConfig();
  if (cacheDir) {
    env.cacheDir = cacheDir;
  }
  // Production runs fully offline: weights are baked into the image. Dev keeps
  // remote downloads so the first run can pull the model into the local cache.
  if (process.env.NODE_ENV === "production") {
    env.allowRemoteModels = false;
  }
}

/**
 * Lazily build (and cache) the feature-extraction pipeline. Concurrent callers
 * share the same in-flight promise so the model loads exactly once.
 */
export function getPipeline(): Promise<FeatureExtractionPipeline> {
  if (!pipelinePromise) {
    configureEnv();
    const { model } = getEmbeddingConfig();
    pipelinePromise = pipeline("feature-extraction", model, { dtype: "int8" });
  }
  return pipelinePromise;
}

/**
 * Embed a batch of texts → one 384-dim, mean-pooled, L2-normalized vector per
 * input. Empty input short-circuits to `[]` so callers don't pay model init
 * for nothing.
 */
export async function embedLocal(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const extractor = await getPipeline();
  const output = await extractor(texts, { pooling: "mean", normalize: true });
  // `tolist()` yields a number[][] (one row per input text).
  return output.tolist() as number[][];
}

/** The local model's vector dimension (matches the `vector(384)` column). */
export const dimensions = MODEL_DIMENSIONS;

/**
 * The model's tokenizer — used by the chunker for token-accurate splitting so
 * embedded strings stay within MiniLM's ~256-token window. Loaded lazily and
 * cached alongside the pipeline.
 */
let tokenizerPromise: Promise<PreTrainedTokenizer> | null = null;
export function getTokenizer(): Promise<PreTrainedTokenizer> {
  if (!tokenizerPromise) {
    // Reuse the pipeline's tokenizer once the model is loaded.
    tokenizerPromise = getPipeline().then((extractor) => extractor.tokenizer);
  }
  return tokenizerPromise;
}
