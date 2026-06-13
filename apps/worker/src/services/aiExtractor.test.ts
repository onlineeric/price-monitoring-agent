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

import { z } from "zod";
import { aiExtract, aiExtractProductInfo, ProductInfoSchema } from "./aiExtractor";

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

describe("aiExtractProductInfo — rich metadata path", () => {
  it("returns the extended metadata fields and converts price to integer cents", async () => {
    aiMocks.generateObject.mockResolvedValueOnce({
      object: {
        title: "Chef Knife",
        price: 49.5,
        currency: "USD",
        imageUrl: "https://cdn/k.jpg",
        description: "An 8-inch chef knife.",
        category: "Kitchen",
        brand: "Acme",
        countryOfOrigin: "Japan",
        attributes: [
          { key: "Material", value: "Stainless steel" },
          { key: "Length", value: "8 inch" },
        ],
      },
    });

    const result = await aiExtractProductInfo("https://shop/k", "<html><body><h1>Chef Knife</h1></body></html>");

    expect(result).toEqual({
      success: true,
      method: "ai",
      data: {
        title: "Chef Knife",
        price: 4950,
        currency: "USD",
        imageUrl: "https://cdn/k.jpg",
        description: "An 8-inch chef knife.",
        category: "Kitchen",
        brand: "Acme",
        countryOfOrigin: "Japan",
        attributes: [
          { key: "Material", value: "Stainless steel" },
          { key: "Length", value: "8 inch" },
        ],
      },
    });
  });

  it("caps attributes at 100 even if the model returns more", async () => {
    const tooMany = Array.from({ length: 130 }, (_, i) => ({ key: `k${i}`, value: `v${i}` }));
    aiMocks.generateObject.mockResolvedValueOnce({
      object: {
        title: "x",
        price: 1,
        currency: "USD",
        imageUrl: "https://cdn/x.jpg",
        description: null,
        category: null,
        brand: null,
        countryOfOrigin: null,
        attributes: tooMany,
      },
    });

    const result = await aiExtractProductInfo("https://shop/x", "<html><body><h1>x</h1></body></html>");

    expect(result.success).toBe(true);
    if (!result.success || !result.data) throw new Error("expected success with data");
    expect(result.data.attributes).toHaveLength(100);
  });

  it("drops empty/blank attribute pairs and normalizes missing metadata to null/[]", async () => {
    aiMocks.generateObject.mockResolvedValueOnce({
      object: {
        title: "x",
        price: 10,
        currency: "USD",
        imageUrl: null,
        description: null,
        category: null,
        brand: null,
        countryOfOrigin: null,
        attributes: [
          { key: "Color", value: "Red" },
          { key: "", value: "ignored" },
          { key: "Size", value: "" },
        ],
      },
    });

    const result = await aiExtractProductInfo("https://shop/x", "<html><body><h1>x</h1></body></html>");

    if (!result.success || !result.data) throw new Error("expected success with data");
    expect(result.data.attributes).toEqual([{ key: "Color", value: "Red" }]);
    expect(result.data.description).toBeNull();
  });

  it("fails (no title or price) without throwing", async () => {
    aiMocks.generateObject.mockResolvedValueOnce({
      object: {
        title: null,
        price: null,
        currency: null,
        imageUrl: null,
        description: "orphan description",
        category: null,
        brand: null,
        countryOfOrigin: null,
        attributes: null,
      },
    });

    const result = await aiExtractProductInfo("https://shop/x", "<html><body></body></html>");

    expect(result).toEqual({
      success: false,
      method: "ai",
      error: expect.stringMatching(/no title or price/i),
    });
  });

  it("requests the metadata fields + attribute cap in the prompt", async () => {
    aiMocks.generateObject.mockResolvedValueOnce({
      object: {
        title: "x",
        price: 1,
        currency: "USD",
        imageUrl: null,
        description: null,
        category: null,
        brand: null,
        countryOfOrigin: null,
        attributes: null,
      },
    });

    await aiExtractProductInfo("https://shop/x", "<html><body><h1>x</h1></body></html>");

    const prompt = aiMocks.generateObject.mock.calls[0][0].prompt as string;
    expect(prompt).toMatch(/description/i);
    expect(prompt).toMatch(/brand/i);
    expect(prompt).toMatch(/country of origin/i);
    expect(prompt).toContain("100");
  });
});

/**
 * OpenAI strict structured outputs require `additionalProperties: false` on
 * EVERY object node. The AI SDK adds that automatically, but its post-processor
 * (`addAdditionalPropertiesToJsonSchema`) only walks object→properties and
 * array→items — it never descends into `anyOf`/`oneOf`/`allOf` branches. So any
 * object nested under a combinator (which is what `.nullable()` on an
 * array-of-objects produces) ships non-strict and OpenAI rejects the request
 * with `invalid_json_schema`. These tests mock the SDK, so they can't catch
 * that — this one converts the schema the same way the SDK does and guards the
 * invariant directly.
 */
describe("ProductInfoSchema OpenAI strict-mode compatibility", () => {
  /** Collect dotted paths of every `type: "object"` node reachable only through a combinator. */
  function objectsUnreachableByStrictPatch(
    node: unknown,
    path: string[] = [],
    underCombinator = false,
    found: string[] = [],
  ): string[] {
    if (node == null || typeof node !== "object") return found;
    const schema = node as Record<string, unknown>;

    if (underCombinator && schema.type === "object") found.push(path.join("."));

    for (const key of ["anyOf", "oneOf", "allOf"] as const) {
      const branches = schema[key];
      if (Array.isArray(branches)) {
        branches.forEach((b, i) => {
          objectsUnreachableByStrictPatch(b, [...path, key, String(i)], true, found);
        });
      }
    }
    if (schema.properties && typeof schema.properties === "object") {
      for (const [name, child] of Object.entries(schema.properties)) {
        objectsUnreachableByStrictPatch(child, [...path, "properties", name], underCombinator, found);
      }
    }
    if (schema.items != null) {
      const items = Array.isArray(schema.items) ? schema.items : [schema.items];
      items.forEach((it, i) => {
        objectsUnreachableByStrictPatch(it, [...path, "items", String(i)], underCombinator, found);
      });
    }
    return found;
  }

  it("emits no object nested under a combinator (so the SDK can mark all objects strict)", () => {
    // Same conversion the AI SDK performs for Zod 4 schemas before the strict patch.
    const jsonSchema = z.toJSONSchema(ProductInfoSchema, { target: "draft-7", io: "input" });
    expect(objectsUnreachableByStrictPatch(jsonSchema)).toEqual([]);
  });
});
