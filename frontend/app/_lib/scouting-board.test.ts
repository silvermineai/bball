import fs from "node:fs";
import { describe, it, expect } from "vitest";
import type { BBPlayer } from "./basketball-types";
import { selectionKey } from "./player-comparison";
import {
  boardMetrics,
  buildBoard,
  defaultWeights,
  toWeights,
  presets,
  filterBoard,
  readBoard,
  boardParams,
  boardCsv,
} from "./scouting-board";
const one = (i: number): BBPlayer => ({
  id: String(i + 1),
  team_id: "1",
  name: `Player ${i}`,
  team: "Program",
  position: "G",
  season: 2026,
  games: 20,
  minutes: 600,
  mpg: 30,
  ppg: i,
  rpg: i,
  apg: i,
  spg: i,
  bpg: i,
  topg: i,
  efg: 0.5,
  ts: 0.5,
  three_pct: 0.4,
  ft_rate: 0.2,
  three_rate: 0.35,
  tov_rate: 0.12,
  qualified: true,
  incomplete_box_games: 0,
});
describe("player scouting board", () => {
  it("ships a normalized all-around preset for first-pass lineup work", () => {
    expect(presets.balanced.weights).toHaveLength(boardMetrics.length);
    expect(presets.balanced.weights.reduce((sum, weight) => sum + weight, 0)).toBe(100);
    expect(toWeights(presets.balanced.weights)).toEqual({
      ppg: 20,
      rpg: 15,
      apg: 15,
      spg: 10,
      bpg: 10,
      topg: 10,
      ts: 10,
      efg: 10,
    });
  });
  it("uses weighted midranks, reverses turnovers and shares competition ties", () => {
    const players = Array.from({ length: 30 }, (_, i) => one(i));
    players[0].ppg = players[1].ppg;
    const pure = buildBoard(
      players,
      2026,
      toWeights([100, 0, 0, 0, 0, 0, 0, 0]),
    );
    expect(pure.rows[0].score).toBeCloseTo((100 * 29.5) / 30, 12);
    expect(pure.rows.slice(-2).map((r) => r.rank)).toEqual([29, 29]);
    for (const row of pure.rows.slice(-2))
      expect(row.score).toBeCloseTo(100 / 30, 12);
    const reversed = buildBoard(
      players,
      2026,
      toWeights([0, 0, 0, 0, 0, 100, 0, 0]),
    );
    expect(reversed.rows[0].player.id).toBe("1");
    const weighted = buildBoard(players, 2026, defaultWeights);
    for (const r of weighted.rows)
      expect(r.score).toBeCloseTo(
        r.percentiles.ppg! * 0.5 + r.percentiles.topg! * 0.15 + 50 * 0.35,
        12,
      );
    expect(
      buildBoard(
        [
          ...players,
          { ...one(40), qualified: false },
          { ...one(41), season: 2025 },
        ],
        2026,
        defaultWeights,
      ),
    ).toEqual(weighted);
  });
  it("withholds sparse, missing or all-zero scores and rejects invalid weights", () => {
    const players = Array.from({ length: 31 }, (_, i) => one(i));
    expect(
      buildBoard(players.slice(0, 29), 2026, defaultWeights).rows.every(
        (r) => r.score === null && r.rank === null,
      ),
    ).toBe(true);
    players[0].ppg = null;
    const missing = buildBoard(players, 2026, defaultWeights).rows.find(
      (r) => r.player.id === "1",
    )!;
    expect(missing.score).toBeNull();
    expect(missing.values.ppg).toBeNull();
    expect(missing.contributions.ppg).toBeNull();
    expect(
      buildBoard(players, 2026, toWeights(presets.events.weights)).rows.find(
        (r) => r.player.id === "1",
      )!.score,
    ).not.toBeNull();
    expect(
      buildBoard(players, 2026, toWeights(Array(8).fill(0))).rows.every(
        (r) => r.score === null,
      ),
    ).toBe(true);
    for (const value of [NaN, Infinity, -1, 101])
      expect(() =>
        buildBoard(players, 2026, { ...defaultWeights, ppg: value }),
      ).toThrow();
  });
  it("round-trips shared priorities, filters and exact shortlist identities", () => {
    const state = readBoard(
      new URLSearchParams(
        "season=2025&w=0,0,60,0,0,25,15,0&q=Texas&pos=G&min=30&pick=2025:123:7&pick=2025:123:8",
      ),
      [2025, 2026],
    );
    expect(state.invalid).toBe(false);
    expect(
      readBoard(new URLSearchParams(boardParams(state)), [2025, 2026]),
    ).toEqual(state);
    for (const query of [
      "season=wat",
      "season=2027",
      "w=1,2",
      "w=NaN,0,0,0,0,0,0,0",
      "w=101,0,0,0,0,0,0,0",
      "min=25",
      "pick=2025:1:1",
    ]) {
      expect(readBoard(new URLSearchParams(query), [2026]).invalid).toBe(true);
    }
    const picks = readBoard(
      new URLSearchParams(
        "pick=2026:1:1&pick=2026:2:1&pick=2026:3:1&pick=2026:4:1",
      ),
      [2026],
    );
    expect(picks.selected).toHaveLength(3);
    expect(picks.invalid).toBe(true);
    expect(
      readBoard(new URLSearchParams("w=0,0,0,0,0,0,0,0"), [2026]).invalid,
    ).toBe(false);
  });
  it("reconciles every published season, preserves ranks through filtering and exports evidence", () => {
    const catalog = JSON.parse(
      fs.readFileSync("public/data/basketball/history/index.json", "utf8"),
    );
    for (const year of catalog.seasons) {
      const { players } = JSON.parse(
        fs.readFileSync(
          `public/data/basketball/history/players-${year.season}.json`,
          "utf8",
        ),
      ) as { players: BBPlayer[] };
      const board = buildBoard(players, year.season, defaultWeights);
      expect(board.peers).toBe(year.qualified_entries);
      const all = new Map(board.rows.map((r) => [selectionKey(r.player), r]));
      // Independently scan the reference cohort for sampled players, rather than reuse binary bounds.
      const qualified = players.filter((p) => p.qualified);
      for (const r of board.rows.filter((_, i) => i % 101 === 0)) {
        let expected = 0;
        for (const m of boardMetrics) {
          const raw = (p: BBPlayer) =>
            m.key === "ts" || m.key === "efg"
              ? p[m.key]
              : p[m.key] === null
                ? null
                : ((p[m.key]! * p.games) / p.minutes) * 40;
          const v = raw(r.player);
          expect(r.values[m.key]).toBeCloseTo(v!, 10);
          const pool = qualified
            .map((p) => (r.values[m.key] === null ? null : raw(p)))
            .filter((n): n is number => n !== null);
          if (pool.length < 30) {
            expect(r.percentiles[m.key]).toBeNull();
            continue;
          }
          // Floating point reconstruction uses tolerance only for independently pooled equivalents.
          const tol = 1e-10;
          let pct =
            (100 *
              (pool.filter((n) => n < v! - tol).length +
                pool.filter((n) => Math.abs(n - v!) <= tol).length / 2)) /
            pool.length;
          if (m.key === "topg") pct = 100 - pct;
          expect(r.percentiles[m.key]).toBeCloseTo(pct, 8);
          expected += (pct * defaultWeights[m.key]) / 100;
        }
        if (board.peers >= 30) expect(r.score).toBeCloseTo(expected, 8);
      }
      for (const r of filterBoard(board.rows, "state", "G", 20))
        expect(r).toBe(all.get(selectionKey(r.player)));
      const ranked = board.rows.filter((r) => r.score !== null);
      for (let i = 1; i < ranked.length; i++) {
        expect(ranked[i].score!).toBeLessThanOrEqual(ranked[i - 1].score!);
        expect(ranked[i].rank!).toBeGreaterThanOrEqual(ranked[i - 1].rank!);
      }
      if (ranked.length) {
        const row = ranked[0];
        const csv = boardCsv(
          [row],
          defaultWeights,
          year.edition,
          board.peerCounts,
        );
        expect(csv).toContain(String(row.score));
        expect(csv).toContain(year.edition);
        expect(csv.split("\r\n")).toHaveLength(3);
        const unsafe = {
          ...row,
          player: { ...row.player, name: '=FORMULA("x")' },
        };
        expect(
          boardCsv([unsafe], defaultWeights, year.edition, board.peerCounts),
        ).toContain('"\'=FORMULA(""x"")"');
      }
    }
  });
});
