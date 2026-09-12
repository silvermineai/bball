import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJson } from "./fetch-json";

describe("fetchJson", () => {
  afterEach(() => vi.restoreAllMocks());

  it("retries transient provider responses once", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } }));
    await expect(fetchJson<{ ok: boolean }>("/api/test", { delayMs: 0 })).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a permanent client error", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("missing", { status: 404 }));
    await expect(fetchJson("/api/test", { delayMs: 0 })).rejects.toThrow("404");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
