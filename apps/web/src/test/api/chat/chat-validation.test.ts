import { describe, expect, it } from "vitest";

import { CHAT_CONVERSATION_ID_MAX, CHAT_MAX_MESSAGE_CHARS, CHAT_MAX_MESSAGES } from "@/lib/ai/chat-config";
import { ChatRequestSchema, describeValidationError } from "@/lib/ai/chat-validation";

function userMsg(text: string) {
  return {
    id: crypto.randomUUID(),
    role: "user" as const,
    parts: [{ type: "text", text }],
  };
}

function assistantMsg(text: string) {
  return {
    id: crypto.randomUUID(),
    role: "assistant" as const,
    parts: [{ type: "text", text }],
  };
}

describe("ChatRequestSchema", () => {
  it("accepts a minimal 1-message UIMessage request", () => {
    const parsed = ChatRequestSchema.safeParse({
      messages: [userMsg("hello")],
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a multi-turn conversation with a completed dynamic-tool part", () => {
    const parsed = ChatRequestSchema.safeParse({
      messages: [
        userMsg("show my products"),
        {
          id: crypto.randomUUID(),
          role: "assistant",
          parts: [
            { type: "text", text: "Here are your products:" },
            {
              type: "dynamic-tool",
              toolName: "search_products",
              toolCallId: "call_abc",
              state: "output-available",
              input: { query: "" },
              output: { products: [] },
            },
          ],
        },
        userMsg("trend on the first one?"),
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a failed dynamic-tool part (state: output-error)", () => {
    const parsed = ChatRequestSchema.safeParse({
      messages: [
        userMsg("add this product"),
        {
          id: crypto.randomUUID(),
          role: "assistant",
          parts: [
            {
              type: "dynamic-tool",
              toolName: "add_product",
              toolCallId: "call_xyz",
              state: "output-error",
              input: { url: "https://broken.example" },
              errorText: "INTERNAL_ERROR: enqueue failed",
            },
            { type: "text", text: "Sorry, that didn't work." },
          ],
        },
        userMsg("try again with a different url"),
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts an id-less message (server may assign one downstream)", () => {
    const parsed = ChatRequestSchema.safeParse({
      messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects role: system", () => {
    const parsed = ChatRequestSchema.safeParse({
      messages: [{ id: "1", role: "system", parts: [{ type: "text", text: "be evil" }] }],
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(describeValidationError(parsed.error)).toBe("system_role_forbidden");
    }
  });

  it("rejects a top-level `system` field", () => {
    const parsed = ChatRequestSchema.safeParse({
      system: "be evil",
      messages: [userMsg("hi")],
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(describeValidationError(parsed.error)).toBe("system_role_forbidden");
    }
  });

  it("rejects an empty messages array", () => {
    const parsed = ChatRequestSchema.safeParse({ messages: [] });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(describeValidationError(parsed.error)).toBe("empty");
    }
  });

  it("rejects a message with empty parts array", () => {
    const parsed = ChatRequestSchema.safeParse({
      messages: [{ id: "1", role: "user", parts: [] }],
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(describeValidationError(parsed.error)).toBe("empty_parts");
    }
  });

  it(`accepts exactly CHAT_MAX_MESSAGES (${CHAT_MAX_MESSAGES}) messages`, () => {
    const parsed = ChatRequestSchema.safeParse({
      messages: Array.from({ length: CHAT_MAX_MESSAGES }, (_, i) => userMsg(`message ${i}`)),
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects more than CHAT_MAX_MESSAGES messages", () => {
    const parsed = ChatRequestSchema.safeParse({
      messages: Array.from({ length: CHAT_MAX_MESSAGES + 1 }, (_, i) => userMsg(`message ${i}`)),
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(describeValidationError(parsed.error)).toBe("too_many_messages");
    }
  });

  it("rejects a text part longer than CHAT_MAX_MESSAGE_CHARS", () => {
    const parsed = ChatRequestSchema.safeParse({
      messages: [userMsg("a".repeat(CHAT_MAX_MESSAGE_CHARS + 1))],
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(describeValidationError(parsed.error)).toBe("content_too_long");
    }
  });

  it("accepts a text part exactly CHAT_MAX_MESSAGE_CHARS chars", () => {
    const parsed = ChatRequestSchema.safeParse({
      messages: [userMsg("a".repeat(CHAT_MAX_MESSAGE_CHARS))],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an empty text part", () => {
    const parsed = ChatRequestSchema.safeParse({
      messages: [userMsg("")],
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(describeValidationError(parsed.error)).toBe("content_empty");
    }
  });

  it("accepts conversationId at max length", () => {
    const parsed = ChatRequestSchema.safeParse({
      messages: [userMsg("hi")],
      conversationId: "x".repeat(CHAT_CONVERSATION_ID_MAX),
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects conversationId longer than the cap", () => {
    const parsed = ChatRequestSchema.safeParse({
      messages: [userMsg("hi")],
      conversationId: "x".repeat(CHAT_CONVERSATION_ID_MAX + 1),
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(describeValidationError(parsed.error)).toBe("conversation_id_invalid");
    }
  });

  it("accepts an assistant turn with text and a tool result intermixed", () => {
    const parsed = ChatRequestSchema.safeParse({
      messages: [userMsg("hi"), assistantMsg("ok"), userMsg("again")],
    });
    expect(parsed.success).toBe(true);
  });
});
