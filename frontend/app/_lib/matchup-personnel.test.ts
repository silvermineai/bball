import { describe, expect, it } from "vitest";
import { matchupPersonnelRows, parseMatchupPersonnel, personnelStatusLabel } from "./matchup-personnel";

function payload() {
  const stats = { ppg: 12.4, rpg: null, apg: 3.1, spg: null, bpg: null, mpg: 28, fg_pct: null, three_pct: null, ft_pct: null, field_goals: null, three_pointers: null, free_throws: null };
  const player = {
    team_id: "1", athlete_id: "10", name: "Player One", position: "G", class_year: "Sr.", height: "6-3", status: "incoming",
    prior_games: 30, prior_minutes: 800,
    prior_stints: [
      { team_id: "9", team: "Old U", games: 20, minutes: 500, stats, box_bpm: 2.4, box_obpm: 3, box_dbpm: -0.6 },
      { team_id: "8", team: "Older U", games: 10, minutes: 300, stats: { ...stats, ppg: null }, box_bpm: null, box_obpm: null, box_dbpm: null },
    ],
  };
  const side = (team_id: string, team: string, players = team_id === "1" ? [player] : []) => ({
    team_id, team, listed_players: players.length, returning_players: 0, incoming_players: players.length,
    new_to_dataset_players: 0, ambiguous_players: 0, players_with_prior_minutes: players.length,
    players_with_publisher_stats: players.length, players_with_box_bpm: players.length, players,
  });
  return {
    season: 2027, prior_season: 2026,
    game: { id: "401", starts_at: "2026-11-02T00:00:00Z", completed: false, home_id: "1", away_id: "2", home_name: "Home", away_name: "Away" },
    coverage: { listed_players: 1, players_with_prior_minutes: 1, players_with_publisher_stats: 1, players_with_box_bpm: 1 },
    home: side("1", "Home"), away: side("2", "Away"), identity_policy: "Exact IDs.",
  };
}

describe("matchup personnel client", () => {
  it("validates exact matchup identity and keeps multi-team stat lines separate", () => {
    const parsed = parseMatchupPersonnel(payload(), { gameId: "401", season: 2027, homeId: "1", awayId: "2" });
    expect(matchupPersonnelRows(parsed.home)).toEqual([
      expect.objectContaining({ player: "Player One", status: "incoming", prior_team: "Old U", minutes: 500, mpg: 28, ppg: 12.4, rpg: null, fg_pct: null, box_bpm: 2.4, box_obpm: 3, box_dbpm: -0.6 }),
      expect.objectContaining({ player: "Player One", status: "incoming", prior_team: "Older U", minutes: 300, mpg: 28, ppg: null, rpg: null, box_bpm: null, box_obpm: null, box_dbpm: null }),
    ]);
    expect(personnelStatusLabel("incoming")).toBe("IN");
  });

  it("fails closed when the response belongs to another game or team", () => {
    expect(() => parseMatchupPersonnel(payload(), { gameId: "999", season: 2027, homeId: "1", awayId: "2" })).toThrow(/did not match/);
    expect(() => parseMatchupPersonnel(payload(), { gameId: "401", season: 2027, homeId: "7", awayId: "2" })).toThrow(/did not match/);
  });

  it("rejects a side whose roster count does not match its rows", () => {
    const bad = payload();
    bad.home.listed_players = 2;
    expect(() => parseMatchupPersonnel(bad, { gameId: "401", season: 2027, homeId: "1", awayId: "2" })).toThrow(/did not match/);
  });
});
