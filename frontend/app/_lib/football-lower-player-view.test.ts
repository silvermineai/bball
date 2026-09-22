import { describe, expect, it } from "vitest";
import { aggregateLowerFootballPlayers, isRankableLowerFootballPlayer, lowerFootballGameContext, lowerFootballPlayerRankValue, lowerFootballRawExport, lowerFootballSourceFieldCoverage, lowerFootballSourceFields, lowerFootballSourceRows, validateLowerFootballPlayerArchive } from "./football-lower-player-view";

const row = (overrides: Record<string, unknown> = {}) => ({
  season: 2026,
  division: "d2" as const,
  game_id: "g1",
  team_id: "t1",
  team: "Example State",
  athlete_id: "a1",
  athlete: "A Player",
  position: "QB",
  category: "passing",
  keys: ["completions/passingAttempts", "passingYards", "passingTouchdowns"],
  stats: ["10/20", "200", "2"],
  ...overrides,
});

describe("lower football player aggregation", () => {
  const validArchive = () => ({
    schema_version: 1, sport: "football", gender: "men", season: 2026,
    generated_at: "2026-09-21T10:00:00Z", scope: "exact D2/D3 event archive",
    source_policy: "stable IDs only",
    source: {
      publisher: "ESPN", scoreboard_url: "https://example.test/scoreboard",
      summary_url_template: "https://example.test/summary?event={event_id}",
      team_url_template: "https://example.test/team/{team_id}", receipt_count: 1,
      receipt_sha256: "a".repeat(64),
    },
    coverage: {
      events_discovered: 1, events_with_d2_d3_team: 1, games: 1, player_rows: 1,
      players: 1, teams: 1, rows_by_division: { d2: 1, d3: 0 }, players_by_division: { d2: 1, d3: 0 },
    },
    receipts: [{ url: "https://example.test/summary?event=g1", fetched_at: "2026-09-21T10:00:00Z", sha256: "a".repeat(64) }],
    games: [{ game_id: "g1", date: "2026-09-01T00:00:00Z", name: "Example", status: "STATUS_FINAL", home_team_id: "t1", away_team_id: "t2" }],
    rows: [row()],
  });

  it("validates source identity, division coverage, and game references before ranking", () => {
    expect(validateLowerFootballPlayerArchive(validArchive()).coverage.player_rows).toBe(1);
    expect(() => validateLowerFootballPlayerArchive({ ...validArchive(), rows: [row({ game_id: "unretained" })] })).toThrow(/invalid player rows/);
    expect(() => validateLowerFootballPlayerArchive({ ...validArchive(), coverage: { ...validArchive().coverage, players: 2 } })).toThrow(/coverage does not match/);
  });

  it("rejects rows when source keys cannot be paired to exactly one raw value", () => {
    expect(() => validateLowerFootballPlayerArchive({
      ...validArchive(),
      rows: [row({ stats: ["10/20", "200"] })],
    })).toThrow(/invalid player rows/);
    expect(() => validateLowerFootballPlayerArchive({
      ...validArchive(),
      rows: [row({ keys: ["passingYards", "passingYards", "passingTouchdowns"], stats: ["200", "200", "2"] })],
    })).toThrow(/invalid player rows/);
  });

  it("aggregates exact athlete and team identities across games", () => {
    const result = aggregateLowerFootballPlayers([
      row(),
      row({ game_id: "g2", stats: ["5/10", "100", "1"] }),
      row({ athlete_id: "a2", athlete: "Other QB", stats: ["20/20", "50", "0"] }),
    ], "d2", "passing");
    expect(result[0]).toMatchObject({ athlete_id: "a1", games: 2, source_rows: 2, primary: 300, per_game: 150, metrics: { passingYards: 300, passingTouchdowns: 3 } });
    expect(result).toHaveLength(2);
  });

  it("supports an explicit per-game ranking basis from distinct retained games", () => {
    const result = aggregateLowerFootballPlayers([
      row(),
      row({ game_id: "g2", stats: ["5/10", "100", "1"] }),
      row({ athlete_id: "a2", athlete: "Other QB", stats: ["20/20", "180", "0"] }),
    ], "d2", "passing");
    expect(lowerFootballPlayerRankValue(result[0], "total")).toBe(300);
    expect(lowerFootballPlayerRankValue(result[0], "per_game")).toBe(150);
    expect(lowerFootballPlayerRankValue(result[1], "per_game")).toBe(180);
  });

  it("fails closed across divisions and categories", () => {
    expect(aggregateLowerFootballPlayers([row({ division: "d3" })], "d2", "passing")).toEqual([]);
    expect(aggregateLowerFootballPlayers([row()], "d2", "rushing")).toEqual([]);
  });

  it("keeps provider team-total rows out of player rankings", () => {
    const teamRow = row({ athlete_id: "-12291", athlete: " Team", stats: ["1", "999", "999.0", "9", "0"] });
    expect(isRankableLowerFootballPlayer(teamRow)).toBe(false);
    expect(isRankableLowerFootballPlayer(row())).toBe(true);
    expect(aggregateLowerFootballPlayers([teamRow, row()], "d2", "passing").map((player) => player.athlete_id)).toEqual(["a1"]);
  });

  it("returns only the exact player, team, division, and category source rows", () => {
    const selected = row({ game_id: "g1", date: "2026-09-02T00:00:00Z", labels: ["C/ATT", "YDS"] });
    const later = row({ game_id: "g2", date: "2026-09-09T00:00:00Z" });
    expect(lowerFootballSourceRows([
      selected,
      later,
      row({ athlete_id: "a1", team_id: "other-team", game_id: "wrong-team" }),
      row({ athlete_id: "a1", division: "d3", game_id: "wrong-division" }),
      row({ athlete_id: "a1", category: "rushing", game_id: "wrong-category" }),
      row({ athlete_id: "a2", game_id: "wrong-player" }),
    ], "d2", "passing", "a1", "t1")).toEqual([later, selected]);
  });

  it("joins player events to schedule context only through exact game and team IDs", () => {
    const games = [
      { game_id: "g1", date: "2026-09-02T00:00:00Z", name: "Away at Home", status: "STATUS_FINAL", home_team_id: "t1", away_team_id: "t2" },
    ];
    expect(lowerFootballGameContext(games, { game_id: "g1", team_id: "t1" })).toMatchObject({
      game_id: "g1", team_side: "home", opponent_team_id: "t2", status: "STATUS_FINAL",
    });
    expect(lowerFootballGameContext(games, { game_id: "g1", team_id: "unlisted" })).toMatchObject({
      game_id: "g1", team_side: "unknown", opponent_team_id: null,
    });
    expect(lowerFootballGameContext(games, { game_id: "missing", team_id: "t1" })).toBeNull();
  });

  it("preserves provider labels and missing values without filling them", () => {
    expect(lowerFootballSourceFields(row({ keys: ["yards", "touchdowns", "unused"], labels: ["YDS", "TD"], stats: ["200", "", "—"] }))).toEqual([
      { key: "yards", label: "YDS", value: "200" },
      { key: "touchdowns", label: "TD", value: null },
      { key: "unused", label: "unused", value: "—" },
    ]);
  });

  it("audits source fields within one exact lower-division scope", () => {
    const fields = lowerFootballSourceFieldCoverage([
      row({ labels: ["C/ATT", "YDS", "TD"], stats: ["10/20", "200", ""] }),
      row({ category: "rushing", keys: ["rushingYards"], stats: ["75"] }),
      row({ division: "d3", keys: ["passingYards"], stats: ["999"] }),
    ], "d2");
    expect(fields).toEqual([
      { key: "completions/passingAttempts", label: "C/ATT", categories: ["passing"], source_rows: 1, populated_values: 1 },
      { key: "passingTouchdowns", label: "TD", categories: ["passing"], source_rows: 1, populated_values: 0 },
      { key: "passingYards", label: "YDS", categories: ["passing"], source_rows: 1, populated_values: 1 },
      { key: "rushingYards", label: "rushingYards", categories: ["rushing"], source_rows: 1, populated_values: 1 },
    ]);
  });

  it("exports raw event rows with exact IDs and a stable union of provider fields", () => {
    const exported = lowerFootballRawExport([
      row({ game_id: "g2", date: "2026-09-02T00:00:00Z", labels: ["C/ATT", "YDS", "TD"], stats: ["5/10", "100", "1"] }),
      row({ division: "d3", game_id: "g3", keys: ["passingYards"], stats: ["999"] }),
      row({ game_id: "g1", date: "2026-09-01T00:00:00Z", labels: ["C/ATT", "YDS", "TD"], stats: ["10/20", "200", "2"] }),
    ], "d2");
    expect(exported.headers).toEqual(["Season", "Division", "Date", "Game ID", "Category", "Athlete", "Athlete ID", "Position", "Team", "Team ID", "Provider labels", "completions/passingAttempts", "passingTouchdowns", "passingYards"]);
    expect(exported.rows).toEqual([
      [2026, "D2", "2026-09-01T00:00:00Z", "g1", "passing", "A Player", "a1", "QB", "Example State", "t1", JSON.stringify(["C/ATT", "YDS", "TD"]), "10/20", "2", "200"],
      [2026, "D2", "2026-09-02T00:00:00Z", "g2", "passing", "A Player", "a1", "QB", "Example State", "t1", JSON.stringify(["C/ATT", "YDS", "TD"]), "5/10", "1", "100"],
    ]);
  });
});
