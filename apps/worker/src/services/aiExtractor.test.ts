import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * aiExtract is the AI fallback inside the 2-tier scraper. The behaviour we
 * pin here is independent of which provider runs: HTML preparation,
 * provider-name selection, dollar→cents conversion, the "no title or price"
 * guard, and error-path shape. The Vercel AI SDK is mocked at the module
 * boundary so we exercise the orchestration logic, not the network.
 */

const aiMocks = vi.hoisted(() => ({
  generateObject: vi.fn(),
  openai: vi.fn((name: string) => ({ provider: "openai", name })),
  anthropic: vi.fn((name: string) => ({ provider: "anthropic", name })),
  google: vi.fn((name: string) => ({ provider: "google", name })),
}));

vi.mock("ai", () => ({ generateObject: aiMocks.generateObject }));
vi.mock("@ai-sdk/openai", () => ({ openai: aiMocks.openai }));
vi.mock("@ai-sdk/anthropic", () => ({ anthropic: aiMocks.anthropic }));
vi.mock("@ai-sdk/google", () => ({ google: aiMocks.google }));

import { aiExtract } from "./aiExtractor";

const ENV_KEYS = ["AI_PROVIDER", "OPENAI_MODEL", "ANTHROPIC_MODEL", "GOOGLE_MODEL", "DEBUG_LOG"] as const;
const originalEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) originalEnv[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.OPENAI_MODEL = "gpt-test";
  aiMocks.generateObject.mockReset();
  aiMocks.openai.mockClear();
  aiMocks.anthropic.mockClear();
  aiMocks.google.mockClear();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (originalEnv[k] === undefined) delete process.env[k];
    else process.env[k] = originalEnv[k];
  }
  vi.restoreAllMocks();
});

describe("aiExtract — happy path", () => {
  it("converts the AI's decimal price to integer cents", async () => {
    aiMocks.generateObject.mockResolvedValueOnce({
      object: { title: "Widget", price: 19.99, currency: "USD", imageUrl: "https://cdn/x.jpg" },
    });

    const result = await aiExtract("https://shop/x", "<html><body><h1>Widget</h1></body></html>");

    expect(result).toEqual({
      success: true,
      method: "ai",
      data: { title: "Widget", price: 1999, currency: "USD", imageUrl: "https://cdn/x.jpg" },
    });
  });

  it("rounds the price (avoids floating-point drift like 19.999 → 1999.9)", async () => {
    aiMocks.generateObject.mockResolvedValueOnce({
      object: { title: "x", price: 19.999, currency: "USD", imageUrl: "https://cdn/x.jpg" },
    });

    const result = await aiExtract("https://shop/x", "<html><body><h1>x</h1></body></html>");

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    expect(result.data.price).toBe(2000);
  });
});

describe("aiExtract — provider selection", () => {
  it("uses the OpenAI provider with OPENAI_MODEL by default", async () => {
    aiMocks.generateObject.mockResolvedValueOnce({
      object: { title: "x", price: 1, currency: "USD", imageUrl: "https://cdn/x.jpg" },
    });

    await aiExtract("https://shop/x", "<html><body><h1>x</h1></body></html>");

    expect(aiMocks.openai).toHaveBeenCalledWith("gpt-test");
    expect(aiMocks.anthropic).not.toHaveBeenCalled();
    expect(aiMocks.google).not.toHaveBeenCalled();
  });

  it("uses Anthropic when AI_PROVIDER=anthropic", async () => {
    process.env.AI_PROVIDER = "anthropic";
    process.env.ANTHROPIC_MODEL = "claude-test";
    aiMocks.generateObject.mockResolvedValueOnce({
      object: { title: "x", price: 1, currency: "USD", imageUrl: "https://cdn/x.jpg" },
    });

    await aiExtract("https://shop/x", "<html><body><h1>x</h1></body></html>");

    expect(aiMocks.anthropic).toHaveBeenCalledWith("claude-test");
  });

  it("uses Google when AI_PROVIDER=google", async () => {
    process.env.AI_PROVIDER = "google";
    process.env.GOOGLE_MODEL = "gemini-test";
    aiMocks.generateObject.mockResolvedValueOnce({
      object: { title: "x", price: 1, currency: "USD", imageUrl: "https://cdn/x.jpg" },
    });

    await aiExtract("https://shop/x", "<html><body><h1>x</h1></body></html>");

    expect(aiMocks.google).toHaveBeenCalledWith("gemini-test");
  });

  it("ignores unknown AI_PROVIDER values and falls back to openai", async () => {
    process.env.AI_PROVIDER = "mistral";
    aiMocks.generateObject.mockResolvedValueOnce({
      object: { title: "x", price: 1, currency: "USD", imageUrl: "https://cdn/x.jpg" },
    });

    await aiExtract("https://shop/x", "<html><body><h1>x</h1></body></html>");

    expect(aiMocks.openai).toHaveBeenCalled();
  });

  it("throws if the per-provider model env var is missing", async () => {
    delete process.env.OPENAI_MODEL;
    await expect(aiExtract("https://shop/x", "<html><body><h1>x</h1></body></html>")).rejects.toThrow(
      /OPENAI_MODEL/,
    );
    expect(aiMocks.generateObject).not.toHaveBeenCalled();
  });
});

describe("aiExtract — guards", () => {
  it("returns a structured failure when neither title nor price is present", async () => {
    aiMocks.generateObject.mockResolvedValueOnce({
      object: { title: null, price: null, currency: null, imageUrl: null },
    });

    const result = await aiExtract("https://shop/x", "<html><body></body></html>");

    expect(result).toEqual({
      success: false,
      method: "ai",
      error: expect.stringMatching(/no title or price/i),
    });
  });

  it("treats an empty string title as 'no title' (still requires price to succeed)", async () => {
    aiMocks.generateObject.mockResolvedValueOnce({
      object: { title: "", price: null, currency: null, imageUrl: null },
    });

    const result = await aiExtract("https://shop/x", "<html><body></body></html>");

    expect(result.success).toBe(false);
  });

  it("succeeds when only the title is present (price stays null)", async () => {
    aiMocks.generateObject.mockResolvedValueOnce({
      object: { title: "Widget", price: null, currency: null, imageUrl: "https://cdn/x.jpg" },
    });

    const result = await aiExtract("https://shop/x", "<html><body><h1>Widget</h1></body></html>");

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    expect(result.data.price).toBeNull();
  });

  it("wraps a thrown SDK error in the structured failure shape (no thrown rejection)", async () => {
    aiMocks.generateObject.mockRejectedValueOnce(new Error("rate limited"));

    const result = await aiExtract("https://shop/x", "<html><body><h1>x</h1></body></html>");

    expect(result).toEqual({
      success: false,
      method: "ai",
      error: expect.stringContaining("rate limited"),
    });
  });
});

describe("aiExtract — HTML preparation", () => {
  it("strips executable <script> tags but preserves JSON-LD before sending to the model", async () => {
    aiMocks.generateObject.mockResolvedValueOnce({
      object: { title: "x", price: 1, currency: "USD", imageUrl: "https://cdn/x.jpg" },
    });

    // No <main>/<article> so the <body> branch returns; both scripts live inside <body>
    // so the cleanHtml() pass is what determines whether they survive.
    const html = `<html><body>
      <h1>Widget</h1>
      <script>alert("xss")</script>
      <script type="application/ld+json">{"@type":"Product"}</script>
      <p>filler</p>
    </body></html>`;

    await aiExtract("https://shop/x", html);

    const prompt = aiMocks.generateObject.mock.calls[0][0].prompt as string;
    expect(prompt).not.toContain('alert("xss")');
    expect(prompt).toContain("application/ld+json");
  });

  it("truncates very large HTML so we stay inside provider context limits", async () => {
    aiMocks.generateObject.mockResolvedValueOnce({
      object: { title: "x", price: 1, currency: "USD", imageUrl: "https://cdn/x.jpg" },
    });

    const huge = `<html><body><main>${"a".repeat(200000)}</main></body></html>`;

    await aiExtract("https://shop/x", huge);

    const prompt = aiMocks.generateObject.mock.calls[0][0].prompt as string;
    expect(prompt).toContain("[truncated]");
  });
});
