import { describe, expect, it } from "vitest";
import { normalizeLiveRow } from "./DivisionPlayerRankings";

describe("live lower-division ranking rows", () => {
  it("keeps exact source identity, selected value, payload fields, and publisher rank", () => {
    const row = normalizeLiveRow({
      player_id: 10801980,
      division: 2,
      name: "Aidan McDowell",
      team_name: "Western Colo.",
      publisher_rank: 1,
      ppg: 26.7,
      payload: {
        games: 28,
        conference: "RMAC",
        source_stats: { ppg: { headers: ["Rank"], cells: ["1"], rank: 1, value: 26.7 } },
      },
    }, "ppg");

    expect(row).toMatchObject({
      player_id: "10801980",
      division: "2",
      name: "Aidan McDowell",
      team_name: "Western Colo.",
      games: 28,
      conference: "RMAC",
      ppg: 26.7,
      ppg_rank: 1,
    });
    expect(row.source_stats?.ppg?.rank).toBe(1);
  });
});
