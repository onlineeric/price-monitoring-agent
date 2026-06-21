import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type ChatErrorWriter,
  emitChatError,
  makeChatError,
  scrubMessage,
} from "@/lib/ai/chat-errors";

/**
 * chat-errors owns the client-facing error taxonomy for POST /api/chat. The
 * security-critical piece is `scrubMessage` (NFR-003): it must never let an API
 * key, stack frame, or absolute path reach the browser. These tests pin that
 * redaction contract so a future refactor of the regexes can't silently start
 * leaking secrets.
 */

describe("scrubMessage", () => {
  it("returns a safe default for empty input", () => {
    expect(scrubMessage("")).toBe("An error occurred.");
  });

  it("falls back to the default when scrubbing empties the message", () => {
    // A message that is entirely an absolute path collapses to the placeholder
    // text, never an empty string.
    expect(scrubMessage("/home/onlineeric/secret/file")).toBe("[redacted-path]");
  });

  it("strips 'at <frame>' stack frames", () => {
    const raw = "Boom happened\n    at handler (server.ts:10:5)\n    at run (index.ts:1:1)";
    const scrubbed = scrubMessage(raw);
    expect(scrubbed).not.toContain(" at ");
    expect(scrubbed).toContain("Boom happened");
  });

  it("redacts absolute POSIX paths", () => {
    const scrubbed = scrubMessage("Failed reading /etc/passwd now");
    expect(scrubbed).not.toContain("/etc/passwd");
    expect(scrubbed).toContain("[redacted-path]");
  });

  it("redacts absolute Windows paths", () => {
    const scrubbed = scrubMessage("Failed reading C:\\Users\\eric\\key.txt now");
    expect(scrubbed).not.toContain("C:\\Users");
    expect(scrubbed).toContain("[redacted-path]");
  });

  it("redacts API-key-shaped tokens", () => {
    const scrubbed = scrubMessage("Invalid key sk-abcd1234efgh5678 provided");
    expect(scrubbed).not.toContain("sk-abcd1234efgh5678");
    expect(scrubbed).toContain("[redacted-secret]");
  });

  it("redacts Bearer tokens", () => {
    const scrubbed = scrubMessage("Auth header Bearer abc.def-123 rejected");
    expect(scrubbed).not.toContain("abc.def-123");
    expect(scrubbed).toContain("Bearer [redacted-secret]");
  });

  it("redacts the literal value of a configured API-key env var", () => {
    // A value that does NOT match the key-prefix regex, so only the env-var
    // defense-in-depth branch can catch it.
    vi.stubEnv("OPENAI_API_KEY", "plainsecretvalue1234");
    const scrubbed = scrubMessage("provider rejected plainsecretvalue1234 outright");
    expect(scrubbed).not.toContain("plainsecretvalue1234");
    expect(scrubbed).toContain("[redacted-secret]");
  });

  it("does not over-redact a short env value (< 8 chars)", () => {
    vi.stubEnv("OPENAI_API_KEY", "short");
    const scrubbed = scrubMessage("the word short should survive");
    expect(scrubbed).toContain("short");
  });

  it("leaves an ordinary message untouched", () => {
    expect(scrubMessage("The request timed out.")).toBe("The request timed out.");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });
});

describe("makeChatError", () => {
  it("wraps code + message into the payload shape", () => {
    expect(makeChatError("turn_timeout", "Turn exceeded 60s timeout.")).toEqual({
      error: { code: "turn_timeout", message: "Turn exceeded 60s timeout." },
    });
  });

  it("scrubs the message it stores", () => {
    const payload = makeChatError("provider_error", "boom at handler (/srv/app.ts:1:1)");
    expect(payload.error.message).not.toContain("/srv/app.ts");
    expect(payload.error.code).toBe("provider_error");
  });
});

describe("emitChatError", () => {
  it("writes a JSON-serialized error event to the stream writer", () => {
    const write = vi.fn();
    const writer: ChatErrorWriter = { write };

    emitChatError(writer, "step_budget_exceeded", "Too many steps.");

    expect(write).toHaveBeenCalledTimes(1);
    const chunk = write.mock.calls[0][0];
    expect(chunk.type).toBe("error");
    expect(JSON.parse(chunk.errorText)).toEqual({
      error: { code: "step_budget_exceeded", message: "Too many steps." },
    });
  });
});
