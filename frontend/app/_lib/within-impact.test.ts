import { describe, expect, it } from "vitest";
import { parseWithinImpactFilters, sortWithinImpact, withinImpactFilterSearch, type WithinImpactRow } from "./within-impact";

const row = (player: string, rank: number, rapm_net: number, team_off_poss = 1000): WithinImpactRow => ({
  season: 2026, player_id: player, person_id: null, team_id: "1", team: "Alpha", player_code: player, player,
  rapm_off: 1, rapm_def: 1, rapm_net, team_off_poss, num_players: 10, qualified: true, rank,
});

describe("within-team impact filters", () => {
  it("round-trips a shareable slice", () => {
    const search = withinImpactFilterSearch({ season: 2020, query: "Kansas", minPoss: "1000", sort: "rapm_def" }, 2026);
    expect(search).toBe("?season=2020&q=Kansas&minPoss=1000&sort=rapm_def");
    expect(parseWithinImpactFilters(search, [2020, 2026], 2026)).toEqual({ season: 2020, query: "Kansas", minPoss: "1000", sort: "rapm_def" });
  });
  it("sorts by rank and rejects unsupported controls", () => {
    expect(sortWithinImpact([row("b", 2, 4), row("a", 1, 1)], "rank").map((r) => r.player_id)).toEqual(["a", "b"]);
    expect(parseWithinImpactFilters("?season=1900&minPoss=99&sort=nope", [2020, 2026], 2026)).toEqual({ season: 2026, query: "", minPoss: "500", sort: "rank" });
  });
});
