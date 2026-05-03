import { afterEach, describe, expect, it } from "vitest";

import { ChatProviderConfigError, resolveChatProvider } from "@/lib/ai/provider";

function setEnv(vars: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

const originalEnv = { ...process.env };

afterEach(() => {
  setEnv({
    AI_PROVIDER: originalEnv.AI_PROVIDER,
    OPENAI_MODEL: originalEnv.OPENAI_MODEL,
    ANTHROPIC_MODEL: originalEnv.ANTHROPIC_MODEL,
    GOOGLE_MODEL: originalEnv.GOOGLE_MODEL,
  });
});

describe("resolveChatProvider", () => {
  it("returns openai + OPENAI_MODEL when AI_PROVIDER=openai", () => {
    setEnv({ AI_PROVIDER: "openai", OPENAI_MODEL: "gpt-4o-mini" });
    expect(resolveChatProvider()).toEqual({
      provider: "openai",
      model: "gpt-4o-mini",
    });
  });

  it("returns anthropic + ANTHROPIC_MODEL when AI_PROVIDER=anthropic", () => {
    setEnv({ AI_PROVIDER: "anthropic", ANTHROPIC_MODEL: "claude-3-5-sonnet" });
    expect(resolveChatProvider()).toEqual({
      provider: "anthropic",
      model: "claude-3-5-sonnet",
    });
  });

  it("returns google + GOOGLE_MODEL when AI_PROVIDER=google", () => {
    setEnv({ AI_PROVIDER: "google", GOOGLE_MODEL: "gemini-2.0-flash" });
    expect(resolveChatProvider()).toEqual({
      provider: "google",
      model: "gemini-2.0-flash",
    });
  });

  it("defaults to openai when AI_PROVIDER is unset", () => {
    setEnv({ AI_PROVIDER: undefined, OPENAI_MODEL: "gpt-4o" });
    expect(resolveChatProvider()).toEqual({
      provider: "openai",
      model: "gpt-4o",
    });
  });

  it("defaults to openai when AI_PROVIDER is an unknown value", () => {
    setEnv({ AI_PROVIDER: "mistral", OPENAI_MODEL: "gpt-4o" });
    expect(resolveChatProvider()).toEqual({
      provider: "openai",
      model: "gpt-4o",
    });
  });

  it("accepts AI_PROVIDER in mixed case", () => {
    setEnv({ AI_PROVIDER: "Anthropic", ANTHROPIC_MODEL: "claude-3-5-haiku" });
    expect(resolveChatProvider()).toEqual({
      provider: "anthropic",
      model: "claude-3-5-haiku",
    });
  });

  it("throws ChatProviderConfigError when OPENAI_MODEL is missing", () => {
    setEnv({ AI_PROVIDER: "openai", OPENAI_MODEL: undefined });
    expect(() => resolveChatProvider()).toThrow(ChatProviderConfigError);
    try {
      resolveChatProvider();
    } catch (err) {
      expect(err).toBeInstanceOf(ChatProviderConfigError);
      const e = err as ChatProviderConfigError;
      expect(e.envVar).toBe("OPENAI_MODEL");
      expect(e.provider).toBe("openai");
    }
  });

  it("throws ChatProviderConfigError when ANTHROPIC_MODEL is missing", () => {
    setEnv({ AI_PROVIDER: "anthropic", ANTHROPIC_MODEL: undefined });
    expect(() => resolveChatProvider()).toThrow(ChatProviderConfigError);
  });

  it("throws ChatProviderConfigError when GOOGLE_MODEL is missing", () => {
    setEnv({ AI_PROVIDER: "google", GOOGLE_MODEL: undefined });
    expect(() => resolveChatProvider()).toThrow(ChatProviderConfigError);
  });

  it("treats a blank *_MODEL env as missing", () => {
    setEnv({ AI_PROVIDER: "openai", OPENAI_MODEL: "   " });
    expect(() => resolveChatProvider()).toThrow(ChatProviderConfigError);
  });
});
