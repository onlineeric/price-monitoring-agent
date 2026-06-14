import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * enqueueRefreshFlowForActiveProducts builds the BullMQ FlowProducer payload
 * (parent send-digest-flow + one check-price child per active product). The
 * shape of `children` is the contract that the worker's flow processor and
 * onDigestFlowComplete callback both rely on, so we pin it here.
 *
 * The FlowProducer constructor is mocked at module load time so the shared
 * singleton inside update-prices.ts uses the spy.
 */

const flowMocks = vi.hoisted(() => ({
  add: vi.fn(),
  close: vi.fn(),
  ctor: vi.fn(),
}));

vi.mock("bullmq", () => ({
  FlowProducer: class FakeFlowProducer {
    add = flowMocks.add;
    close = flowMocks.close;
    constructor(opts: unknown) {
      flowMocks.ctor(opts);
    }
  },
}));

const dbMock = vi.hoisted(() => ({ select: vi.fn() }));

vi.mock("@price-monitor/db", () => ({
  db: { select: dbMock.select },
  eq: (col: unknown, val: unknown) => ({ __op: "eq", col, val }),
  products: { active: "products.active" },
}));

vi.mock("../config.js", () => ({ connection: { host: "redis" } }));

import { closeUpdatePricesFlowProducer, enqueueRefreshFlowForActiveProducts } from "./update-prices";

function mockActiveProducts(rows: Array<{ url: string }>) {
  const where = vi.fn().mockResolvedValue(rows);
  const from = vi.fn().mockReturnValue({ where });
  dbMock.select.mockReturnValueOnce({ from });
}

beforeEach(() => {
  flowMocks.add.mockReset();
  flowMocks.close.mockReset();
  flowMocks.ctor.mockReset();
  dbMock.select.mockReset();
});

afterEach(async () => {
  // Reset the singleton between tests so each one exercises the constructor path.
  await closeUpdatePricesFlowProducer();
  vi.restoreAllMocks();
});

describe("enqueueRefreshFlowForActiveProducts", () => {
  it("returns enqueued=false and skips the flow producer when no products are active", async () => {
    mockActiveProducts([]);

    const result = await enqueueRefreshFlowForActiveProducts("manual");

    expect(result).toEqual({ enqueued: false, activeProductCount: 0 });
    expect(flowMocks.add).not.toHaveBeenCalled();
  });

  it("builds the parent + child payload and reports activeProductCount", async () => {
    mockActiveProducts([{ url: "https://shop/x" }, { url: "https://shop/y" }]);
    flowMocks.add.mockResolvedValueOnce({ job: { id: "parent-1" } });

    const result = await enqueueRefreshFlowForActiveProducts("scheduled");

    expect(result).toEqual({ enqueued: true, activeProductCount: 2 });
    expect(flowMocks.add).toHaveBeenCalledTimes(1);

    const payload = flowMocks.add.mock.calls[0][0] as {
      name: string;
      queueName: string;
      data: { triggerType: string };
      children: Array<{
        name: string;
        queueName: string;
        data: { url: string };
        opts: { ignoreDependencyOnFailure: boolean };
      }>;
    };
    expect(payload.name).toBe("send-digest-flow");
    expect(payload.queueName).toBe("price-monitor-queue");
    expect(payload.data).toEqual({ triggerType: "scheduled" });
    expect(payload.children).toEqual([
      {
        name: "check-price",
        queueName: "price-monitor-queue",
        data: { url: "https://shop/x" },
        opts: { ignoreDependencyOnFailure: true },
      },
      {
        name: "check-price",
        queueName: "price-monitor-queue",
        data: { url: "https://shop/y" },
        opts: { ignoreDependencyOnFailure: true },
      },
    ]);
  });

  it("defaults to check-price children when no mode is given (price-only digest)", async () => {
    mockActiveProducts([{ url: "https://shop/x" }]);
    flowMocks.add.mockResolvedValueOnce({});

    await enqueueRefreshFlowForActiveProducts("manual");

    const payload = flowMocks.add.mock.calls[0][0] as { children: Array<{ name: string }> };
    expect(payload.children.every((c) => c.name === "check-price")).toBe(true);
  });

  it("uses update-product-info children when mode is 'info'", async () => {
    mockActiveProducts([{ url: "https://shop/x" }, { url: "https://shop/y" }]);
    flowMocks.add.mockResolvedValueOnce({});

    await enqueueRefreshFlowForActiveProducts("manual", "info");

    const payload = flowMocks.add.mock.calls[0][0] as { children: Array<{ name: string; data: { url: string } }> };
    expect(payload.children.map((c) => c.name)).toEqual(["update-product-info", "update-product-info"]);
    expect(payload.children.map((c) => c.data.url)).toEqual(["https://shop/x", "https://shop/y"]);
  });

  it("constructs the FlowProducer lazily and reuses the singleton across calls", async () => {
    mockActiveProducts([{ url: "https://shop/x" }]);
    flowMocks.add.mockResolvedValue({});
    mockActiveProducts([{ url: "https://shop/y" }]);
    flowMocks.add.mockResolvedValue({});

    await enqueueRefreshFlowForActiveProducts("manual");
    await enqueueRefreshFlowForActiveProducts("manual");

    expect(flowMocks.ctor).toHaveBeenCalledTimes(1);
    expect(flowMocks.ctor).toHaveBeenCalledWith(expect.objectContaining({ connection: { host: "redis" } }));
  });
});

describe("closeUpdatePricesFlowProducer", () => {
  it("closes the singleton when one exists", async () => {
    mockActiveProducts([{ url: "https://shop/x" }]);
    flowMocks.add.mockResolvedValueOnce({});
    await enqueueRefreshFlowForActiveProducts("manual");

    await closeUpdatePricesFlowProducer();

    expect(flowMocks.close).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when no flow producer was created", async () => {
    await closeUpdatePricesFlowProducer();
    expect(flowMocks.close).not.toHaveBeenCalled();
  });
});
