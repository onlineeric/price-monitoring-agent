import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The provider seam dispatches on EMBEDDING_PROVIDER. We mock the config so we
 * can drive the provider, and the local model so no weights are downloaded —
 * `embedLocal` returns deterministic 384-length vectors. The contract under
 * test is the dispatch + the "non-local not wired" guard, not the math.
 */

const DIM = 384;

const configMock = vi.hoisted(() => ({
  getEmbeddingConfig: vi.fn(),
}));

const localMock = vi.hoisted(() => {
  const dim = 384;
  const fixed = Array.from({ length: dim }, (_, i) => i / dim);
  return {
    embedLocal: vi.fn(async (texts: string[]) => texts.map(() => [...fixed])),
    dimensions: dim,
  };
});

vi.mock("../config.js", () => configMock);
vi.mock("./local.js", () => localMock);

import { dimensions, embedQuery, embedTexts } from "./provider";

function setProvider(provider: "local" | "openai" | "google") {
  configMock.getEmbeddingConfig.mockReturnValue({
    provider,
    model: "Xenova/all-MiniLM-L6-v2",
    cacheDir: undefined,
    topN: 5,
    maxDistance: 0.55,
  });
}

beforeEach(() => {
  configMock.getEmbeddingConfig.mockReset();
  localMock.embedLocal.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("embedding provider seam — local (default)", () => {
  beforeEach(() => setProvider("local"));

  it("embedTexts returns one 384-dim vector per input via the local model", async () => {
    const vectors = await embedTexts(["alpha", "beta"]);
    expect(vectors).toHaveLength(2);
    expect(vectors[0]).toHaveLength(DIM);
    expect(vectors[1]).toHaveLength(DIM);
    expect(localMock.embedLocal).toHaveBeenCalledWith(["alpha", "beta"]);
  });

  it("embedQuery returns a single 384-dim vector", async () => {
    const vector = await embedQuery("a gaming monitor");
    expect(vector).toHaveLength(DIM);
    expect(localMock.embedLocal).toHaveBeenCalledWith(["a gaming monitor"]);
  });

  it("dimensions reports the local model width (384)", () => {
    expect(dimensions()).toBe(DIM);
  });
});

describe("embedding provider seam — non-local providers are not wired", () => {
  for (const provider of ["openai", "google"] as const) {
    it(`embedTexts throws the documented switch-required error for ${provider}`, async () => {
      setProvider(provider);
      await expect(embedTexts(["x"])).rejects.toThrow(/not wired/i);
      await expect(embedTexts(["x"])).rejects.toThrow(/migrate the product_embeddings/i);
    });

    it(`embedQuery throws for ${provider}`, async () => {
      setProvider(provider);
      await expect(embedQuery("x")).rejects.toThrow(/not wired/i);
    });

    it(`dimensions throws for ${provider}`, () => {
      setProvider(provider);
      expect(() => dimensions()).toThrow(/not wired/i);
    });
  }
});
