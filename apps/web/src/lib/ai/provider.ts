/**
 * Resolve the active AI provider for POST /api/chat.
 *
 * Mirrors the pattern used by `apps/worker/src/services/aiExtractor.ts` — but
 * is deliberately duplicated rather than shared, per research Decision 5: the
 * worker calls `generateObject` and the web calls `streamText`, and the two
 * call sites may diverge on retry / telemetry / caching before any shared
 * abstraction is stable.
 *
 * Environment contract:
 *   - `AI_PROVIDER`   — one of `openai` | `anthropic` | `google`; defaults to
 *                       `openai` when unset or unrecognized (FR-006).
 *   - `OPENAI_MODEL` | `ANTHROPIC_MODEL` | `GOOGLE_MODEL` — required for the
 *     resolved provider; a missing value throws `ChatProviderConfigError`
 *     which the route turns into a pre-stream HTTP 500 with
 *     `provider_config_missing` (FR-007).
 */

import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export type ChatProvider = "openai" | "anthropic" | "google";

export interface ResolvedChatProvider {
  provider: ChatProvider;
  model: string;
}

const MODEL_ENV_VAR: Record<ChatProvider, string> = {
  openai: "OPENAI_MODEL",
  anthropic: "ANTHROPIC_MODEL",
  google: "GOOGLE_MODEL",
};

export class ChatProviderConfigError extends Error {
  public readonly envVar: string;
  public readonly provider: ChatProvider;

  constructor(provider: ChatProvider, envVar: string) {
    super(
      `Missing ${envVar} environment variable for AI_PROVIDER="${provider}".`,
    );
    this.name = "ChatProviderConfigError";
    this.provider = provider;
    this.envVar = envVar;
  }
}

function readProviderEnv(): ChatProvider {
  const raw = process.env.AI_PROVIDER?.toLowerCase();
  if (raw === "anthropic" || raw === "google") return raw;
  // Unset OR any unknown value → default to OpenAI (FR-006).
  return "openai";
}

/**
 * Return the resolved provider + model name.
 *
 * Throws `ChatProviderConfigError` if the matching `*_MODEL` env is missing.
 */
export function resolveChatProvider(): ResolvedChatProvider {
  const provider = readProviderEnv();
  const envVar = MODEL_ENV_VAR[provider];
  const model = process.env[envVar];
  if (!model || model.trim() === "") {
    throw new ChatProviderConfigError(provider, envVar);
  }
  return { provider, model: model.trim() };
}

/**
 * Construct the AI SDK language model instance for the resolved provider.
 *
 * The three provider factories (`openai()`, `anthropic()`, `google()`)
 * accept the model id as their first argument; no extra options are needed
 * for this phase.
 */
export function getChatModel(resolved: ResolvedChatProvider): LanguageModel {
  switch (resolved.provider) {
    case "anthropic":
      return anthropic(resolved.model);
    case "google":
      return google(resolved.model);
    default:
      return openai(resolved.model);
  }
}
