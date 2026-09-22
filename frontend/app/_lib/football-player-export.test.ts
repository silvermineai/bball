import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";
import { footballPlayerExportHeaders, footballPlayerExportRows, type FootballPlayerExportRow } from "./football-player-export";

const rows: FootballPlayerExportRow[] = [
  {
    dataset: "box",
    game_id: "401",
    category: "rushing",
    kickoff: "2026-09-01T00:00:00Z",
    home_name: "Home, U",
    away_name: "Away U",
    stats: { athlete_name: "Example Player", yards: 91, note: "quoted, source" },
  },
  {
    dataset: "passing",
    game_id: null,
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
    expect(headers.slice(0, 6)).toEqual(["Dataset", "Game ID", "Kickoff", "Away", "Home", "Category"]);
    expect(headers.slice(6)).toEqual(["source.athlete_name", "source.attempts", "source.nested", "source.note", "source.yards"]);
    expect(footballPlayerExportRows(rows, headers)).toEqual([
      ["box", "401", "2026-09-01T00:00:00Z", "Away U", "Home, U", "rushing", "Example Player", null, null, "quoted, source", 91],
      ["passing", null, null, null, null, "passing", "Example Player", 22, JSON.stringify({ source: "retained" }), null, null],
    ]);
  });

  it("passes source punctuation through CSV escaping without reinterpretation", () => {
    const csv = toCsv(footballPlayerExportHeaders(rows), footballPlayerExportRows(rows));
    expect(csv).toContain('"Home, U"');
    expect(csv).toContain('"quoted, source"');
    expect(csv).toContain('"{""source"":""retained""}"');
  });
});
