import { describe, expect, it } from "vitest";

import { isRetryable, parseChatErrorPayload } from "@/lib/chat/chat-error-parsing";
import type { ChatErrorCode } from "@/stores/chat/types";

const ALL_CODES: ChatErrorCode[] = [
  "validation_error",
  "provider_config_missing",
  "mcp_unreachable",
  "provider_error",
  "step_budget_exceeded",
  "turn_timeout",
  "empty_response",
];

const RETRYABLE: ChatErrorCode[] = [
  "mcp_unreachable",
  "provider_error",
  "step_budget_exceeded",
  "turn_timeout",
  "empty_response",
];

const NON_RETRYABLE: ChatErrorCode[] = ["validation_error", "provider_config_missing"];

describe("parseChatErrorPayload", () => {
  it("parses every documented ChatErrorCode cleanly", () => {
    for (const code of ALL_CODES) {
      const result = parseChatErrorPayload({ error: { code, message: `oops: ${code}` } }, "pre-stream");
      expect(result.code).toBe(code);
      expect(result.message).toBe(`oops: ${code}`);
      expect(result.surface).toBe("pre-stream");
    }
  });

  it("parses an in-stream JSON string into the right shape", () => {
    const json = JSON.stringify({
      error: { code: "turn_timeout", message: "took too long" },
    });
    const parsed = parseChatErrorPayload(json, "in-stream");
    expect(parsed.code).toBe("turn_timeout");
    expect(parsed.message).toBe("took too long");
    expect(parsed.surface).toBe("in-stream");
  });

  it("falls back to provider_error on malformed JSON", () => {
    const result = parseChatErrorPayload("{not json}", "in-stream");
    expect(result.code).toBe("provider_error");
    expect(result.surface).toBe("in-stream");
  });

  it("falls back to provider_error on unknown code", () => {
    const result = parseChatErrorPayload({ error: { code: "made_up_code", message: "nope" } }, "pre-stream");
    expect(result.code).toBe("provider_error");
  });

  it("falls back to provider_error on missing envelope", () => {
    const result = parseChatErrorPayload({ foo: "bar" }, "pre-stream");
    expect(result.code).toBe("provider_error");
  });

  it("never throws on non-string non-object input", () => {
    expect(() => parseChatErrorPayload(undefined, "in-stream")).not.toThrow();
    expect(() => parseChatErrorPayload(null, "in-stream")).not.toThrow();
    expect(() => parseChatErrorPayload(42, "in-stream")).not.toThrow();
    expect(() => parseChatErrorPayload(true, "in-stream")).not.toThrow();
  });

  it("clamps oversized fallback messages to ≤500 chars", () => {
    const huge = "x".repeat(2000);
    const result = parseChatErrorPayload(huge, "in-stream");
    expect(result.code).toBe("provider_error");
    expect(result.message.length).toBeLessThanOrEqual(500);
  });

  it("preserves a small valid message verbatim", () => {
    const result = parseChatErrorPayload({ error: { code: "provider_error", message: "short" } }, "pre-stream");
    expect(result.message).toBe("short");
  });
});

describe("isRetryable", () => {
  it("returns true for retryable codes", () => {
    for (const code of RETRYABLE) {
      expect(isRetryable(code)).toBe(true);
    }
  });

  it("returns false for non-retryable codes", () => {
    for (const code of NON_RETRYABLE) {
      expect(isRetryable(code)).toBe(false);
    }
  });
});
