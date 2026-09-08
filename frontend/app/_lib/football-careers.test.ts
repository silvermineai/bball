import { describe, expect, it } from "vitest";
import { filterFootballCareers, sortFootballCareers, type CareerPlayer } from "./football-careers";
const players: CareerPlayer[] = [
  { id: "1", name: "Alpha", first_season: 2023, last_season: 2025, seasons: [2023, 2024, 2025], season_count: 3, box_games: 30, categories: ["passing"], teams: [{ season: 2025, team_id: "a", team: "Alpha U", conference: "A", division: "fbs", box_games: 10 }], production: { passing: { plays: 300, yards: 3000, epa: 25, epa_per_play: 0.08, touchdowns: 25, seasons: [2023, 2024, 2025], best_rank: 2 } } },
  { id: "2", name: "Beta", first_season: 2025, last_season: 2025, seasons: [2025], season_count: 1, box_games: 8, categories: ["rushing"], teams: [{ season: 2025, team_id: "b", team: "Beta U", conference: "B", division: "fcs", box_games: 8 }], production: { rushing: { plays: 150, yards: 900, epa: 14, epa_per_play: 0.09, touchdowns: 10, seasons: [2025], best_rank: 4 } } },
];
describe("football career index helpers", () => {
  it("filters by category, division and context", () => {
    expect(filterFootballCareers(players, { query: "alpha u", category: "passing", division: "fbs", minSeasons: 2 }).map((p) => p.id)).toEqual(["1"]);
    expect(filterFootballCareers(players, { query: "", category: "passing", division: "all", minSeasons: 1 }).map((p) => p.id)).toEqual(["1"]);
  });
  it("sorts production without adding unrelated categories", () => {
    expect(sortFootballCareers(players, "passing", "epa").map((p) => p.id)).toEqual(["1", "2"]);
    expect(sortFootballCareers(players, "all", "seasons").map((p) => p.id)).toEqual(["1", "2"]);
  });
});
