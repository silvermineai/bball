import { describe, it, expect, vi, afterEach } from "vitest";
import {
  rateText,
  sortTeams,
  readProfile,
  type EfficiencyTeam,
  type EfficiencyMetric,
} from "./football-efficiency";
const metric = { key: "epa", format: "number" } as EfficiencyMetric;
const team = (id: string, value: number | null) =>
  ({
    id,
    name: id,
    season: 2025,
    profile_hash: "expected",
    samples: {
      fbs: { offense: { epa: { value } }, defense: { epa: { value } } },
    },
  }) as unknown as EfficiencyTeam;
afterEach(() => vi.unstubAllGlobals());
describe("team efficiency evidence", () => {
  it("sorts negative, zero and missing rates with null last in both directions", () => {
    const teams = [
      team("missing", null),
      team("zero", 0),
      team("negative", -0.2),
    ];
    expect(
      sortTeams(teams, "fbs", "offense", "epa", "asc").map((t) => t.id),
    ).toEqual(["negative", "zero", "missing"]);
    expect(
      sortTeams(teams, "fbs", "defense", "epa", "desc").map((t) => t.id),
    ).toEqual(["zero", "negative", "missing"]);
    expect(teams[0].id).toBe("missing");
  });
  it("shows a missing opportunity separately from a measured zero", () => {
    expect(rateText(undefined, metric)).toBe("—");
    expect(
      rateText({ value: 0, numerator: 0, denominator: 50, games: 1 }, metric),
    ).toBe("0.000");
  });
  it("rejects mismatched evidence hashes and failed downloads", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({
          ok: true,
          text: async () => '{"id":"a","season":2025}',
        }),
    );
    await expect(
      readProfile(team("a", 1), new AbortController().signal),
    ).rejects.toThrow("does not match");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    await expect(
      readProfile(team("a", 1), new AbortController().signal),
    ).rejects.toThrow("could not be loaded");
  });
});
