import { describe, expect, it, vi } from "vitest";
import { basketballForecasts } from "../src/basketball-forecasts";

describe("basketball forecast availability", () => {
  it("returns a retryable status when the D1 catalog is unavailable", async () => {
    const prepare = vi.fn(() => { throw new Error("D1 busy"); });
    const response = await basketballForecasts.request(
      "/?meta=1&season=2027",
      {},
      { DB: { prepare, batch: vi.fn() } },
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "The live basketball forecast catalog is temporarily unavailable.",
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
