import { describe, expect, it } from "vitest";
import { summarizeDivisionArchive } from "./division-archive-summary";
import releaseArchive from "../../public/data/basketball/ncaa-individual.json";

const release = {
  season: 2026,
  generated_at: "2026-09-10T13:27:22Z",
  players: [
    { player_id: 1, division: 2, ppg: 20, rpg: 7, apg: null },
    { player_id: 2, division: 2, ppg: null, rpg: 5, apg: 3 },
    { player_id: 3, division: 3, ppg: 18, rpg: 4, apg: 2 },
  ],
  teams: [
    { team_ncaa_id: 11, division: 2 },
    { team_ncaa_id: 12, division: 3 },
  ],
};

describe("division archive summary", () => {
  it("counts only the requested division and preserves missing metrics", () => {
    expect(summarizeDivisionArchive(release, "2")).toEqual({
      season: 2026,
      generated_at: "2026-09-10T13:27:22Z",
      division: "2",
      players: 2,
      teams: 1,
      metrics: { ppg: 1, rpg: 2, apg: 1, mpg: 0, fg_pct: 0, three_pct: 0 },
    });
  });

  it("rejects malformed or duplicate archive identities", () => {
    expect(() => summarizeDivisionArchive({ ...release, players: [{ division: 2 }] }, "2")).toThrow("malformed player");
    expect(() => summarizeDivisionArchive({ ...release, teams: [...release.teams, release.teams[0]] }, "2")).toThrow("duplicate team");
  });

  it("accepts the checked-in release and keeps the published cohorts separate", () => {
    expect(summarizeDivisionArchive(releaseArchive, "2")).toMatchObject({ players: 1020, teams: 289, division: "2" });
    expect(summarizeDivisionArchive(releaseArchive, "3")).toMatchObject({ players: 1031, teams: 405, division: "3" });
  });
});
