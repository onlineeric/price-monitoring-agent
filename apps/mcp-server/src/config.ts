import { z } from "zod";
import pkg from "../package.json" with { type: "json" };

/**
 * Hard-coded constants. These are not env-configurable on purpose:
 * - `0.0.0.0` matches both Coolify's internal-network expectation and the
 *   docker-compose `3001:3001` mapping in the local dev path (research.md
 *   Decision 4).
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

const transportSchema = z
  .union([z.literal("stdio"), z.literal("http")])
  .default("stdio");

const portSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(65_535)
  .default(3001);

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
    throw new ConfigError(
      `invalid MCP_TRANSPORT="${rawTransport}" (expected "stdio" or "http")`,
    );
  }

  const rawPort = env.MCP_HTTP_PORT;
  const portResult = portSchema.safeParse(rawPort);
  if (!portResult.success) {
    throw new ConfigError(
      `invalid MCP_HTTP_PORT="${rawPort}" (expected positive integer in [1, 65535])`,
    );
  }

  const rawTimeout = env.MCP_REQUEST_TIMEOUT_MS;
  const timeoutResult = requestTimeoutSchema.safeParse(rawTimeout);
  if (!timeoutResult.success) {
    throw new ConfigError(
      `invalid MCP_REQUEST_TIMEOUT_MS="${rawTimeout}" (expected positive integer in [1, 600000])`,
    );
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
