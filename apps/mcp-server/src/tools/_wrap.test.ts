import { afterEach, describe, expect, it, vi } from "vitest";

import { ToolError, withErrorHandling } from "./_wrap";

/**
 * withErrorHandling is the single chokepoint that converts thrown errors from
 * tool handlers into structured `{ error: { code, message } }` payloads. It
 * also writes to stderr (never stdout — stdio transport reserves stdout for
 * JSON-RPC frames), so we pin both behaviours.
 */

describe("withErrorHandling", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the handler's CallToolResult unchanged on success", async () => {
    const wrapped = withErrorHandling("ok_tool", async () => ({
      content: [{ type: "text" as const, text: "hello" }],
    }));
    const result = await wrapped({});
    expect(result).toEqual({ content: [{ type: "text", text: "hello" }] });
    expect(result.isError).toBeUndefined();
  });

  it("converts thrown ToolError into a structured isError envelope and preserves the code", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const wrapped = withErrorHandling("bad_tool", async () => {
      throw new ToolError("BAD_INPUT", "missing field");
    });
    const result = await wrapped({});
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(JSON.parse(text)).toEqual({ error: { code: "BAD_INPUT", message: "missing field" } });
  });

  it("falls back to INTERNAL_ERROR for non-ToolError throws (the catch-all bucket)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const wrapped = withErrorHandling("crash_tool", async () => {
      throw new Error("kaboom");
    });
    const result = await wrapped({});
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.error.code).toBe("INTERNAL_ERROR");
    expect(parsed.error.message).toBe("kaboom");
  });

  it("stringifies non-Error throws so the response is never empty", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const wrapped = withErrorHandling("weird_tool", async () => {
      // eslint-disable-next-line no-throw-literal
      throw "string thrown";
    });
    const result = await wrapped({});
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.error.message).toBe("string thrown");
  });

  it("writes ONLY to stderr — stdout pollution would corrupt the stdio JSON-RPC stream", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const wrapped = withErrorHandling("noisy_tool", async () => {
      throw new Error("oops");
    });
    await wrapped({});
    expect(log).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalled();
  });
});
