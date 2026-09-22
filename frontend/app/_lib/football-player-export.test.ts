import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";
import { footballPlayerExportHeaders, footballPlayerExportRows, type FootballPlayerExportRow } from "./football-player-export";

const rows: FootballPlayerExportRow[] = [
  {
    dataset: "box",
    season: 2026,
    game_id: "401",
    record_key: "box-401",
    athlete_id: "athlete-1",
    team_id: "team-1",
    category: "rushing",
    kickoff: "2026-09-01T00:00:00Z",
    home_name: "Home, U",
    away_name: "Away U",
    stats: { athlete_name: "Example Player", yards: 91, note: "quoted, source" },
  },
  {
    dataset: "passing",
    season: 2025,
    game_id: null,
    record_key: "passing-1",
    athlete_id: "athlete-1",
    team_id: null,
    category: "passing",
    kickoff: null,
    home_name: null,
    away_name: null,
    stats: { athlete_name: "Example Player", attempts: 22, nested: { source: "retained" } },
  },
];

describe("football player source export", () => {
  it("keeps the page context and union of source fields", () => {
    const headers = footballPlayerExportHeaders(rows);
    expect(headers.slice(0, 10)).toEqual(["Dataset", "Season", "Game ID", "Record key", "Athlete ID", "Team ID", "Kickoff", "Away", "Home", "Category"]);
    expect(headers.slice(10)).toEqual(["source.athlete_name", "source.attempts", "source.nested", "source.note", "source.yards"]);
    expect(footballPlayerExportRows(rows, headers)).toEqual([
      ["box", 2026, "401", "box-401", "athlete-1", "team-1", "2026-09-01T00:00:00Z", "Away U", "Home, U", "rushing", "Example Player", null, null, "quoted, source", 91],
      ["passing", 2025, null, "passing-1", "athlete-1", null, null, null, null, "passing", "Example Player", 22, JSON.stringify({ source: "retained" }), null, null],
    ]);
  });

  it("passes source punctuation through CSV escaping without reinterpretation", () => {
    const csv = toCsv(footballPlayerExportHeaders(rows), footballPlayerExportRows(rows));
    expect(csv).toContain('"Home, U"');
    expect(csv).toContain('"quoted, source"');
    expect(csv).toContain('"{""source"":""retained""}"');
  });
});
