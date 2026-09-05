import { describe, expect, it, vi } from "vitest";
import { recruiting } from "../src/recruiting";
describe("reviewed recruiting editions", () => {
  it("rejects malformed seasons before querying", async () => {
    for (const season of ["2027.5", "-1", "2036", "2027 OR 1=1"])
      expect(
        (await recruiting.request(`/?season=${encodeURIComponent(season)}`))
          .status,
      ).toBe(400);
  });
  it("reads one active edition and keeps the database observation date separate", async () => {
    const first = vi
      .fn()
      .mockResolvedValue({
        payload_json: JSON.stringify({
          edition: "one",
          sources: [{ published_on: "2026-04-28" }],
        }),
        first_recorded_at: "2026-09-05T00:00:00Z",
      });
    const bind = vi.fn().mockReturnValue({ first });
    const prepare = vi.fn().mockReturnValue({ bind });
    const response = await recruiting.request("/", {}, { DB: { prepare } });
    expect(response.status).toBe(200);
    expect(bind).toHaveBeenCalledWith(2027);
    expect(prepare.mock.calls[0][0]).toContain("a.edition=r.edition");
    expect(await response.json()).toEqual({
      edition: "one",
      sources: [{ published_on: "2026-04-28" }],
      first_recorded_at: "2026-09-05T00:00:00Z",
    });
  });
  it("returns missing coverage explicitly", async () => {
    expect(
      (
        await recruiting.request(
          "/?season=2028",
          {},
          {
            DB: {
              prepare: () => ({ bind: () => ({ first: async () => null }) }),
            },
          },
        )
      ).status,
    ).toBe(404);
  });
});
