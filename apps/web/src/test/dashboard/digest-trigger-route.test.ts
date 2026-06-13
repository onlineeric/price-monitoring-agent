import { beforeEach, describe, expect, it, vi } from "vitest";

const addMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/queue", () => ({
  priceQueue: {
    add: addMock,
  },
}));

import { POST } from "@/app/api/digest/trigger/route";

// Minimal NextRequest stand-in — the route only calls request.json().
function makeRequest(body?: unknown) {
  return {
    json: async () => {
      if (body === undefined) throw new Error("no body");
      return body;
    },
  } as never;
}

describe("POST /api/digest/trigger", () => {
  beforeEach(() => {
    addMock.mockReset();
  });

  it("keeps manual combined digest queue-based", async () => {
    addMock.mockResolvedValue({ id: "job_123" });

    const response = await POST(makeRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(addMock).toHaveBeenCalledTimes(1);
    expect(addMock).toHaveBeenCalledWith(
      "send-digest",
      expect.objectContaining({
        triggeredBy: "manual",
      }),
    );
  });

  it("defaults to price mode when no body is provided", async () => {
    addMock.mockResolvedValue({ id: "job_123" });

    await POST(makeRequest());

    expect(addMock).toHaveBeenCalledWith("send-digest", expect.objectContaining({ mode: "price" }));
  });

  it("accepts mode: info from the request body", async () => {
    addMock.mockResolvedValue({ id: "job_123" });

    await POST(makeRequest({ mode: "info" }));

    expect(addMock).toHaveBeenCalledWith("send-digest", expect.objectContaining({ mode: "info" }));
  });

  it("coerces an unknown mode to price (default-safe)", async () => {
    addMock.mockResolvedValue({ id: "job_123" });

    await POST(makeRequest({ mode: "banana" }));

    expect(addMock).toHaveBeenCalledWith("send-digest", expect.objectContaining({ mode: "price" }));
  });

  it("returns a server error payload when enqueue fails", async () => {
    addMock.mockRejectedValue(new Error("Redis offline"));

    const response = await POST(makeRequest());
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error).toBe("Failed to trigger digest");
  });
});
