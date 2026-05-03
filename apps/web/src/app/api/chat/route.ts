// See specs/004-chat-streaming-api/contracts/chat-api.md for the HTTP + data-stream contract.
/**
 * POST /api/chat — streaming chat endpoint with MCP tool calling.
 *
 * Runtime: Node.js (not Edge) — the MCP client spawns a child process over
 * stdio, which is incompatible with Edge runtime.
 *
 * Responsibilities (see spec FR-001..FR-013, NFR-001..NFR-004):
 *   - Validate the request body through a single Zod schema.
 *   - Resolve the active provider (OpenAI / Anthropic / Google) from env.
 *   - Bridge live MCP tools into AI SDK `tool()` instances.
 *   - Stream the AI SDK v6 UI-message protocol back (`toUIMessageStreamResponse`).
 *   - Enforce a 5-step tool budget and a 60-second per-turn timeout.
 *   - Forward `request.signal` to abort model + tool work on client disconnect.
 *   - Surface every terminal failure as a structured error event (in-stream)
 *     or JSON response (pre-stream) with a documented `ChatErrorCode`.
 */

import { NextResponse } from "next/server";

import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";

import {
  buildMcpTools,
  CHAT_MAX_STEPS,
  CHAT_SYSTEM_PROMPT,
  CHAT_TURN_TIMEOUT_MS,
  ChatProviderConfigError,
  ChatRequestSchema,
  createChatLogger,
  describeValidationError,
  emitChatError,
  getChatModel,
  makeChatError,
  resolveChatProvider,
} from "@/lib/ai";

export const runtime = "nodejs";

function jsonError(status: number, code: Parameters<typeof makeChatError>[0], message: string): Response {
  return NextResponse.json(makeChatError(code, message), { status });
}

export async function POST(request: Request) {
  const turnId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const startedAt = Date.now();

  // --- 1. Parse + validate the request body ---------------------------------
  let bodyJson: unknown;
  try {
    bodyJson = await request.json();
  } catch {
    return jsonError(400, "validation_error", "Invalid JSON body.");
  }
  const parsed = ChatRequestSchema.safeParse(bodyJson);
  if (!parsed.success) {
    const reason = describeValidationError(parsed.error);
    const logger = createChatLogger({ turnId });
    logger.validationRejected({ reason });
    return jsonError(400, "validation_error", reason);
  }
  const { messages, conversationId } = parsed.data;
  const logger = createChatLogger({ turnId, conversationId });

  // --- 2. Resolve provider & model -----------------------------------------
  let resolved: ReturnType<typeof resolveChatProvider>;
  try {
    resolved = resolveChatProvider();
  } catch (err) {
    if (err instanceof ChatProviderConfigError) {
      logger.providerError({
        message: `missing ${err.envVar} for ${err.provider}`,
      });
      return jsonError(500, "provider_config_missing", err.message);
    }
    throw err;
  }

  // --- 3. Build MCP tool bridge; `mcp_unreachable` if the client cannot connect
  let tools: Awaited<ReturnType<typeof buildMcpTools>>;
  try {
    tools = await buildMcpTools({ logger });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.providerError({ message: `mcp_unreachable: ${message}` });
    return jsonError(502, "mcp_unreachable", "Upstream MCP server is unreachable.");
  }

  logger.turnReceived({
    messageCount: messages.length,
    provider: resolved.provider,
    model: resolved.model,
  });

  // --- 4. Set up turn-level abort (client disconnect OR 60s timeout) -------
  const turnAbort = new AbortController();
  const onClientDisconnect = () => turnAbort.abort(new Error("client_disconnect"));
  request.signal.addEventListener("abort", onClientDisconnect, { once: true });
  const timeoutHandle: NodeJS.Timeout = setTimeout(() => {
    turnAbort.abort(new Error("turn_timeout"));
  }, CHAT_TURN_TIMEOUT_MS);

  function clearTurnResources() {
    clearTimeout(timeoutHandle);
    request.signal.removeEventListener("abort", onClientDisconnect);
  }

  // Track observed events so we can emit `empty_response` / `step_budget_exceeded`.
  let sawTextDelta = false;
  let sawToolCall = false;

  // Convert the SDK's UIMessage wire shape into ModelMessages with proper
  // tool-call / tool-result content parts. Without this, providers that
  // require explicit tool_call_id linkage (OpenAI) reject any turn whose
  // history includes prior tool results.
  // `ignoreIncompleteToolCalls` is a safety net — the client already drops
  // stopped/errored partial turns (FR-004a) so this should never fire in
  // practice.
  const modelMessages = await convertToModelMessages(parsed.data.messages as UIMessage[], {
    tools,
    ignoreIncompleteToolCalls: true,
  });

  const result = streamText({
    model: getChatModel(resolved),
    system: CHAT_SYSTEM_PROMPT,
    messages: modelMessages,
    tools,
    stopWhen: stepCountIs(CHAT_MAX_STEPS),
    abortSignal: turnAbort.signal,
    onChunk({ chunk }) {
      if (chunk.type === "text-delta") sawTextDelta = true;
      if (chunk.type === "tool-call") sawToolCall = true;
    },
    onAbort() {
      // `onAbort` fires for any abort; map the reason back to the right log.
      const reason = (turnAbort.signal.reason as Error | undefined)?.message ?? "unknown";
      if (reason === "turn_timeout") {
        logger.turnTimeout({ elapsedMs: Date.now() - startedAt });
      } else {
        logger.turnAborted({ reason });
      }
    },
    onError({ error }) {
      const message = error instanceof Error ? error.message : String(error);
      logger.providerError({ message });
    },
    onFinish({ finishReason }) {
      clearTurnResources();
      logger.turnFinished({
        finishReason,
        elapsedMs: Date.now() - startedAt,
      });
    },
  });

  // Wrap the v6 UI-message stream so we can append distinguishable error
  // events for the conditions the SDK does not surface for us:
  //   - step_budget_exceeded  (finishReason === "tool-calls" on terminal finish)
  //   - turn_timeout          (our abort fired before the model finished)
  //   - empty_response        (no text-delta AND no tool-call during turn)
  // Provider-error is already surfaced by the SDK as a stream `error` event;
  // we log it via `onError` above and let the SDK's default error handler
  // propagate it.
  const baseStream = result.toUIMessageStream();

  const enhancedStream = createUIMessageStream({
    async execute({ writer }) {
      writer.merge(baseStream);

      try {
        const finishReason = await result.finishReason;

        if (turnAbort.signal.aborted) {
          const reason = (turnAbort.signal.reason as Error | undefined)?.message ?? "";
          if (reason === "turn_timeout") {
            emitChatError(writer, "turn_timeout", "Turn exceeded 60s timeout.");
          }
          // client_disconnect: skip writing — socket is gone.
          return;
        }

        if (finishReason === "tool-calls") {
          logger.budgetExceeded({ steps: CHAT_MAX_STEPS });
          emitChatError(writer, "step_budget_exceeded", `Model exceeded the ${CHAT_MAX_STEPS}-step tool budget.`);
          return;
        }

        if (!sawTextDelta && !sawToolCall) {
          logger.emptyResponse();
          emitChatError(writer, "empty_response", "Model produced no text and no tool call.");
          return;
        }
      } finally {
        clearTurnResources();
      }
    },
    onError(error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.providerError({ message });
      return JSON.stringify(makeChatError("provider_error", message));
    },
  });

  return createUIMessageStreamResponse({ stream: enhancedStream });
}
