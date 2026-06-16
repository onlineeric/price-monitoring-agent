import { z } from "zod";
import pkg from "../package.json" with { type: "json" };

/**
 * Hard-coded constants. These are not env-configurable on purpose:
 * - `0.0.0.0` matches both Coolify's internal-network expectation and the
 *   docker-compose `3002:3002` mapping in the local dev path (research.md
 *   Decision 4). Port `3002` is chosen to avoid colliding with the worker
 *   health server, which defaults to `3001`.
 * - The 10 s graceful-shutdown window matches the project's actual tool
 *   latency profile (every tool is a single Drizzle query or BullMQ
 *   enqueue) and stays inside the orchestrator's default 30 s `docker
 *   stop` window (research.md Decision 8).
 * - The 30 s per-request timeout sits inside the chat-side 60 s per-turn
 *   budget so a hung tool surfaces as a clean MCP-layer error before the
 *   chat side gives up (research.md Decision 5).
 */
const HTTP_HOST = "0.0.0.0" as const;
const GRACE_PERIOD_MS = 10_000 as const;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000 as const;

const transportSchema = z.union([z.literal("stdio"), z.literal("http")]).default("stdio");

const portSchema = z.coerce.number().int().min(1).max(65_535).default(3002);

// Test-only override (T010 case g, T025 cases a/d). Lets the integration
// suite drive the per-request timeout in milliseconds rather than seconds.
// NOT documented in README.md — production deploys must rely on the 30 s
// default.
const requestTimeoutSchema = z.coerce.number().int().min(1).max(600_000).optional();

export interface ServerConfig {
  transport: "stdio" | "http";
  httpPort: number;
  httpHost: typeof HTTP_HOST;
  version: string;
  gracePeriodMs: number;
  requestTimeoutMs: number;
}

/**
 * Embedding + semantic-search config (feature 008). Read once at module load.
 * The mcp-server is the single embedding authority, so this config lives here
 * (not in the worker, which only enqueues reindex jobs).
 *
 * Defaults match `.env.example` and `plan.md`. `SEMANTIC_SEARCH_MAX_DISTANCE`
 * is the cosine-distance relevance cutoff (lower = stricter) — tuned against
 * the real catalog during 4.8; `0.55` is the starting point.
 */
export type EmbeddingProvider = "local" | "openai" | "google";

export interface EmbeddingConfig {
  provider: EmbeddingProvider;
  model: string;
  cacheDir: string | undefined;
  topN: number;
  maxDistance: number;
}

const providerSchema = z
  .union([z.literal("local"), z.literal("openai"), z.literal("google")])
  .default("local");
const topNSchema = z.coerce.number().int().min(1).max(50).default(5);
// Cosine-distance cutoff for a *confident* match. Re-tuned against the real
// catalog for conversational queries (the chat agent's actual input): a
// distilled, product-shaped query lands on-topic ~0.55–0.77 (e.g. red wine for
// "wine and drinks for a dinner party" ≈ 0.62) while clearly off-topic items
// sit ≥0.90, so 0.78 separates them with margin. Earlier values (0.55 research
// D7, then 0.70 in 4.8) were tuned only against terse product-shaped queries
// and silently dropped relevant items for verbose intent queries. Anything past
// this cutoff is not dropped outright — `semanticSearch` falls back to the
// single nearest product as a low-confidence match (see search.ts).
const maxDistanceSchema = z.coerce.number().min(0).max(2).default(0.78);

export function loadEmbeddingConfig(env: NodeJS.ProcessEnv = process.env): EmbeddingConfig {
  const provider = providerSchema.safeParse(env.EMBEDDING_PROVIDER);
  if (!provider.success) {
    throw new ConfigError(
      `invalid EMBEDDING_PROVIDER="${env.EMBEDDING_PROVIDER}" (expected "local", "openai", or "google")`,
    );
  }

  const topN = topNSchema.safeParse(env.SEMANTIC_SEARCH_TOP_N);
  if (!topN.success) {
    throw new ConfigError(
      `invalid SEMANTIC_SEARCH_TOP_N="${env.SEMANTIC_SEARCH_TOP_N}" (expected integer in [1, 50])`,
    );
  }

  const maxDistance = maxDistanceSchema.safeParse(env.SEMANTIC_SEARCH_MAX_DISTANCE);
  if (!maxDistance.success) {
    throw new ConfigError(
      `invalid SEMANTIC_SEARCH_MAX_DISTANCE="${env.SEMANTIC_SEARCH_MAX_DISTANCE}" (expected number in [0, 2])`,
    );
  }

  const cacheDir = env.EMBEDDING_CACHE_DIR?.trim();

  return {
    provider: provider.data,
    model: env.EMBEDDING_MODEL?.trim() || "Xenova/all-MiniLM-L6-v2",
    cacheDir: cacheDir && cacheDir.length > 0 ? cacheDir : undefined,
    topN: topN.data,
    maxDistance: maxDistance.data,
  };
}

/**
 * Module-level singleton so the search tool and reindex path read the same
 * config without re-parsing env on every call. Loaded lazily on first access
 * to keep module import side-effect-free (consistent with the local-model
 * singleton).
 */
let cachedEmbeddingConfig: EmbeddingConfig | null = null;
export function getEmbeddingConfig(): EmbeddingConfig {
  if (!cachedEmbeddingConfig) {
    cachedEmbeddingConfig = loadEmbeddingConfig();
  }
  return cachedEmbeddingConfig;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const rawTransport = env.MCP_TRANSPORT;
  const transportResult = transportSchema.safeParse(rawTransport);
  if (!transportResult.success) {
    throw new ConfigError(`invalid MCP_TRANSPORT="${rawTransport}" (expected "stdio" or "http")`);
  }

  const rawPort = env.MCP_HTTP_PORT;
  const portResult = portSchema.safeParse(rawPort);
  if (!portResult.success) {
    throw new ConfigError(`invalid MCP_HTTP_PORT="${rawPort}" (expected positive integer in [1, 65535])`);
  }

  const rawTimeout = env.MCP_REQUEST_TIMEOUT_MS;
  const timeoutResult = requestTimeoutSchema.safeParse(rawTimeout);
  if (!timeoutResult.success) {
    throw new ConfigError(`invalid MCP_REQUEST_TIMEOUT_MS="${rawTimeout}" (expected positive integer in [1, 600000])`);
  }

  return {
    transport: transportResult.data,
    httpPort: portResult.data,
    httpHost: HTTP_HOST,
    version: pkg.version,
    gracePeriodMs: GRACE_PERIOD_MS,
    requestTimeoutMs: timeoutResult.data ?? DEFAULT_REQUEST_TIMEOUT_MS,
  };
}
