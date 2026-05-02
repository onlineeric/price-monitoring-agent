// Barrel export for the chat-streaming helpers used by POST /api/chat.
// See specs/004-chat-streaming-api/plan.md for the module layout.

export {
  CHAT_MAX_MESSAGES,
  CHAT_MAX_MESSAGE_CHARS,
  CHAT_MAX_STEPS,
  CHAT_TURN_TIMEOUT_MS,
  CHAT_CONVERSATION_ID_MAX,
  CHAT_SYSTEM_PROMPT,
} from "./chat-config";

export {
  type ChatErrorCode,
  type ChatErrorPayload,
  emitChatError,
  makeChatError,
  scrubMessage,
} from "./chat-errors";

export {
  type ChatLogger,
  type ChatLoggerContext,
  createChatLogger,
} from "./chat-logger";

export {
  type ChatRequest,
  type ChatRequestUIMessage,
  ChatRequestSchema,
  describeValidationError,
} from "./chat-validation";

export {
  buildMcpTools,
  jsonSchemaToZod,
  type BuildMcpToolsOptions,
} from "./chat-tools";

export {
  type ChatProvider,
  type ResolvedChatProvider,
  ChatProviderConfigError,
  resolveChatProvider,
  getChatModel,
} from "./provider";
