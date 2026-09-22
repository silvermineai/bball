import { describe, expect, it } from "vitest";
import { parseUncommittedProspectPage, topUncommittedProspects, type UncommittedProspect } from "./UncommittedProspectSupply";

const row = (id: string, position: string, rank: number | null = 1): UncommittedProspect => ({
  athlete_id: id,
  name: `Prospect ${id}`,
  position,
  rank,
  grade: 90,
  committed_team_id: null,
  committed_team_name: null,
  high_school: "School",
  hometown: "Town",
  height_inches: 76,
  weight_pounds: 190,
});

const payload = (rows: UncommittedProspect[] = [row("1", "PG")]) => ({
  season: 2027,
  page: 0,
  page_size: 50,
  total: rows.length,
  edition: "a".repeat(64),
  captured_at: "2026-09-22T00:00:00Z",
  rows,
});

describe("uncommitted prospect supply", () => {
  it("rejects a row that carries a recorded destination", () => {
    expect(parseUncommittedProspectPage({ ...payload(), rows: [{ ...row("1", "PG"), committed_team_id: "99" }] })).toBeNull();
  });

  it("rejects a malformed or wrong-edition page", () => {
    expect(parseUncommittedProspectPage({ ...payload(), season: 2026 })).toBeNull();
    expect(parseUncommittedProspectPage({ ...payload(), edition: "bad" })).toBeNull();
  });

  it("uses the same guard, wing and big mapping as the fit board", () => {
    const rows = [row("pg", "PG", 3), row("sf", "SF", 2), row("c", "C", 1), row("unknown", "", null)];
    expect(topUncommittedProspects(rows, "guard").map((item) => item.athlete_id)).toEqual(["pg"]);
    expect(topUncommittedProspects(rows, "wing").map((item) => item.athlete_id)).toEqual(["sf"]);
    expect(topUncommittedProspects(rows, "big").map((item) => item.athlete_id)).toEqual(["c"]);
    expect(topUncommittedProspects(rows, "any", 2).map((item) => item.athlete_id)).toEqual(["c", "sf"]);
  });
});
