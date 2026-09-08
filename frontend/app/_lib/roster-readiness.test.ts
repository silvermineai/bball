import { describe, expect, it } from "vitest";
import type { BBOverview, BBRosters } from "./basketball-types";
import {
  buildRosterLabRows,
  rosterPositionGroup,
  sortRosterLabRows,
} from "./roster-readiness";

const rosters = (players: BBRosters["players"]): BBRosters => ({
  season: 2027,
  previous_season: 2026,
  teams_observed: 2,
  players_observed: players.length,
  prior_players_not_observed: 0,
  status_counts: {},
  players,
});

const player = (
  team_id: string,
  team: string,
  status: string,
  minutes: number,
  position: string | null = null,
) => ({
  id: `${team_id}-${status}-${minutes}`,
  name: "Player",
  team_id,
  team,
  previous_teams: [],
  status,
  position,
  class_year: null,
  height: null,
  weight: null,
  source_url: null,
  prior_production: minutes
    ? { games: 20, minutes, mpg: minutes / 20, ppg: 10, rpg: null, apg: null, teams: ["Old"] }
    : null,
});

const overview = {
  season: 2027,
  label: "2026–27",
  generated_at: "2026-09-07T00:00:00Z",
  coverage: {} as BBOverview["coverage"],
  ratings: [
    { id: "1", name: "Alpha", rank: 2, adj_off: 0, adj_def: 0, adj_net: 18, adj_tempo: 0, games: 20, wins: 15, expected_wins: null, luck: null, luck_games: 0, sos: null, sos_games: 0, efg: null, tov_rate: null, orb_rate: null, ft_rate: null, three_rate: null },
  ],
  upcoming: [
    { id: "g", season: 2027, starts_at: "2026-11-01T00:00:00Z", home_id: "1", away_id: "2", home_name: "Alpha", away_name: "Beta", neutral: 0, time_tbd: 0, venue: "", broadcast: "", prediction: null },
  ],
  model: {} as BBOverview["model"],
  sources: [],
} satisfies BBOverview;

describe("roster lab", () => {
  it("keeps prior workload denominators and schedule coverage separate", () => {
    const rows = buildRosterLabRows(
      rosters([
        player("1", "Alpha", "same_program", 800),
        player("1", "Alpha", "different_program", 200),
        player("2", "Beta", "new_to_dataset", 0),
      ]),
      overview,
    );
    const alpha = rows.find((row) => row.teamId === "1")!;
    expect(alpha.returningShare).toBe(0.8);
    expect(alpha.representedShare).toBe(1);
    expect(alpha.incomingShare).toBe(0.2);
    expect(alpha.upcomingGames).toBe(1);
    expect(alpha.forecastedGames).toBe(0);
    expect(rows.find((row) => row.teamId === "2")!.returningShare).toBeNull();
  });

  it("sorts null signals after observed workload", () => {
    const rows = buildRosterLabRows(
      rosters([player("1", "Alpha", "same_program", 800), player("2", "Beta", "new_to_dataset", 0)]),
      overview,
    );
    expect(sortRosterLabRows(rows, "returning").map((row) => row.team)).toEqual(["Alpha", "Beta"]);
  });

  it("keeps a source-labeled position shape separate from workload signals", () => {
    expect(rosterPositionGroup("PG")).toBe("guard");
    expect(rosterPositionGroup("PF")).toBe("forward");
    expect(rosterPositionGroup("C")).toBe("center");
    expect(rosterPositionGroup("ATH")).toBe("unreported");
    const rows = buildRosterLabRows(
      rosters([
        player("1", "Alpha", "same_program", 800, "G"),
        player("1", "Alpha", "same_program", 200, "F"),
        player("1", "Alpha", "new_to_dataset", 0, "C"),
        player("1", "Alpha", "new_to_dataset", 0),
      ]),
      overview,
    );
    expect(rows[0].positionCounts).toEqual({
      guard: 1,
      forward: 1,
      center: 1,
      unreported: 1,
    });
  });
});
