import { readFileSync } from "node:fs";
import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { getOverview } from "./data";
import { getFootballBriefEvidence } from "./football-brief-data";
import { historicalLeaders, type BriefPlayer } from "./football-brief";
const read = (file: string) =>
  JSON.parse(readFileSync(`public/data/football/${file}`, "utf8"));
describe("football matchup notebooks", () => {
  it("links every forecast to the correct historical programs, seasons and recorded rates", () => {
    const index = read("efficiency.json");
    const players: BriefPlayer[] = read("players-2025.json").players;
    const games = getOverview().upcoming.filter((g) => g.prediction);
    expect(games.length).toBeGreaterThan(700);
    for (const game of games) {
      const evidence = getFootballBriefEvidence(game);
      expect(evidence.programs.map((p) => p.id)).toEqual([
        game.away_id,
        game.home_id,
      ]);
      for (const season of evidence.seasons) {
        const release = index.seasons.find(
          (s: { season: number }) => s.season === season.season,
        );
        season.teams.forEach((team, i) => {
          const expected = release.teams.find(
            (t: { id: string }) => t.id === evidence.programs[i].id,
          );
          expect(team).toEqual(expected ?? null);
        });
      }
      for (const program of evidence.programs) {
        for (const row of program.personnel) {
          const source = players.find(
            (p) =>
              p.id === row.player.id &&
              p.team_id === program.id &&
              p.season === game.season - 1,
          )!;
          expect(source).toBeDefined();
          expect(row.production).toEqual(source.production[row.category]);
          expect(source.division).toBe("fbs");
        }
      }
    }
  });
  it("keeps categories separate, excludes placeholders and unqualified records, and orders negative EPA correctly", () => {
    const player = (
      id: string,
      epa: number,
      plays = 100,
      rank: number | null = 1,
      team_id = "1",
      season = 2025,
    ): BriefPlayer => ({
      id,
      team_id,
      season,
      name: id,
      team: team_id,
      division: "fbs",
      production: {
        passing: { epa, plays, rank, epa_per_play: epa / plays, games: 10 },
      },
    });
    const players = [
      player("1", -5),
      player("2", -10),
      player("3", -20),
      player("-1", 200),
      player("4", 200, 99),
      player("5", 200, 100, null),
      player("6", 200, 100, 1, "2"),
      player("7", 200, 100, 1, "1", 2026),
      player("8", NaN),
    ];
    players[0].production.receiving = {
      epa: 2,
      plays: 30,
      rank: 4,
      epa_per_play: 2 / 30,
      games: 10,
    };
    expect(
      historicalLeaders(players, "1", 2025).map((r) => [
        r.player.id,
        r.category,
      ]),
    ).toEqual([
      ["1", "passing"],
      ["2", "passing"],
      ["1", "receiving"],
    ]);
    expect(historicalLeaders(players, "999", 2025)).toEqual([]);
  });
  it("refuses a player file that no longer matches its catalog hash", async () => {
    vi.resetModules();
    const original = fs.readFileSync;
    const spy = vi
      .spyOn(fs, "readFileSync")
      .mockImplementation((...args: Parameters<typeof fs.readFileSync>) => {
        const result = original(...args);
        return String(args[0]).endsWith("players-2025.json")
          ? String(result) + " "
          : result;
      });
    try {
      const fresh = await import("./football-brief-data");
      expect(() =>
        fresh.getFootballBriefEvidence(
          getOverview().upcoming.find((g) => g.prediction)!,
        ),
      ).toThrow("player edition mismatch");
    } finally {
      spy.mockRestore();
    }
  });
});
