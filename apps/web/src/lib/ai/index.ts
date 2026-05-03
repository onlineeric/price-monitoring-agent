// Barrel export for the chat-streaming helpers used by POST /api/chat.
// See specs/004-chat-streaming-api/plan.md for the module layout.

export {
  CHAT_CONVERSATION_ID_MAX,
  CHAT_MAX_MESSAGE_CHARS,
  CHAT_MAX_MESSAGES,
  CHAT_MAX_STEPS,
  CHAT_SYSTEM_PROMPT,
  CHAT_TURN_TIMEOUT_MS,
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
  type BuildMcpToolsOptions,
  buildMcpTools,
  jsonSchemaToZod,
} from "./chat-tools";
export {
  type ChatRequest,
  ChatRequestSchema,
  type ChatRequestUIMessage,
  describeValidationError,
} from "./chat-validation";
export {
  type ChatProvider,
  ChatProviderConfigError,
  getChatModel,
  type ResolvedChatProvider,
  resolveChatProvider,
} from "./provider";
