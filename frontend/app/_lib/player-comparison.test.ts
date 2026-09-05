import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  comparisonCsv,
  comparisonParams,
  countValue,
  joinComparison,
  peerValue,
  percentile,
  rateValue,
  readSelections,
  validateSeason,
  type SeasonPlayers,
} from "./player-comparison";
import type { BBPlayer } from "./basketball-types";
import type { CareerCatalog, CareerData, CareerSummary } from "./careers";
const summary = (): CareerSummary => ({
  games: 20,
  source_records: 22,
  totals: {
    min: 600,
    pts: 240,
    fgm: 90,
    fga: 180,
    tpm: 20,
    tpa: 60,
    ftm: 40,
    fta: 50,
    orb: 20,
    drb: 60,
    reb: 80,
    ast: 60,
    stl: 20,
    blk: 10,
    tov: 30,
    pf: 40,
  },
  samples: {
    min: 20,
    pts: 20,
    fgm: 20,
    fga: 20,
    tpm: 20,
    tpa: 20,
    ftm: 20,
    fta: 20,
    orb: 20,
    drb: 20,
    reb: 20,
    ast: 20,
    stl: 20,
    blk: 20,
    tov: 20,
    pf: 20,
  },
  incomplete_box_games: 0,
  dnp_records: 2,
  excluded_records: 2,
  qualified: true,
  mpg: 30,
  ppg: 12,
  rpg: 4,
  apg: 3,
  spg: 1,
  bpg: 0.5,
  topg: 1.5,
  efg: 100 / 180,
  ts: 240 / (2 * (180 + 0.475 * 50)),
  three_pct: 1 / 3,
  ft_pct: 0.8,
  three_rate: 1 / 3,
});
const player = (overrides: Partial<BBPlayer> = {}): BBPlayer => ({
  id: "123",
  team_id: "12",
  name: "Example Player",
  team: "Test Program",
  position: "G",
  season: 2026,
  games: 20,
  minutes: 600,
  mpg: 30,
  ppg: 12,
  rpg: 4,
  apg: 3,
  spg: 1,
  bpg: 0.5,
  topg: 1.5,
  efg: 100 / 180,
  ts: 240 / (2 * (180 + 0.475 * 50)),
  three_pct: 1 / 3,
  qualified: true,
  incomplete_box_games: 0,
  ...overrides,
});
const catalog: CareerCatalog = JSON.parse(
  fs.readFileSync("public/data/basketball/history/index.json", "utf8"),
);
const coverage = catalog.seasons.find((s) => s.season === 2026)!;
const selection = { season: 2026, id: "123", team_id: "12" };
const index = (): SeasonPlayers => ({
  season: 2026,
  edition: coverage.edition,
  coverage,
  players: [player()],
});
const data = (): CareerData => ({
  id: "123",
  season: 2026,
  edition: coverage.edition,
  coverage,
  sources: [],
  rows: [],
  profiles: [
    {
      id: "123",
      name: "Example Player",
      season: 2026,
      position: "G",
      edition: coverage.edition,
      overall: summary(),
      teams: [{ team_id: "12", team: "Test Program", ...summary() }],
    },
  ],
});
describe("player comparison statistics", () => {
  it("scales complete totals by minutes or playing appearances and preserves missing values", () => {
    const s = summary();
    expect(countValue(s, "pts", "per40")).toBe(16);
    expect(countValue(s, "pts", "perGame")).toBe(12);
    s.totals.pts = null;
    expect(countValue(s, "pts", "per40")).toBeNull();
    expect(countValue(s, "ast", "per40")).toBe(4);
    s.totals.min = 0;
    expect(countValue(s, "ast", "per40")).toBeNull();
    expect(countValue(s, "ast", "perGame")).toBe(3);
    s.games = 0;
    expect(countValue(s, "ast", "perGame")).toBeNull();
  });
  it("uses pooled made/attempt totals, withholds undefined two-point and turnover ratios", () => {
    const s = summary();
    expect(rateValue(s, "two_pct")).toBeCloseTo(70 / 120, 12);
    expect(rateValue(s, "fg_pct")).toBe(0.5);
    expect(rateValue(s, "ft_rate")).toBeCloseTo(50 / 180, 12);
    expect(rateValue(s, "ast_to")).toBe(2);
    s.totals.fga = s.totals.tpa;
    expect(rateValue(s, "two_pct")).toBeNull();
    s.totals.tov = 0;
    expect(rateValue(s, "ast_to")).toBeNull();
    s.totals.tpa = null;
    expect(rateValue(s, "two_pct")).toBeNull();
  });
  it("uses same-season qualified peers, ties at their midpoint, and higher turnover volume to the right", () => {
    const peers = Array.from({ length: 40 }, (_, i) =>
      player({
        id: String(i + 1),
        ppg: i < 10 ? 6 : i < 30 ? 12 : 18,
        topg: i < 10 ? 1 : i < 30 ? 1.5 : 2,
      }),
    );
    peers.push(
      player({ season: 2025, ppg: 100 }),
      player({ qualified: false, ppg: 100 }),
    );
    expect(percentile(player(), peers, "ppg")).toEqual({ value: 50, n: 40 });
    expect(percentile(player({ topg: 2 }), peers, "topg").value).toBe(87.5);
    expect(
      percentile(player({ qualified: false }), peers, "ppg").value,
    ).toBeNull();
    expect(percentile(player(), peers.slice(0, 29), "ppg").value).toBeNull();
    expect(peerValue(player({ ppg: null }), "ppg")).toBeNull();
    expect(peerValue(player(), "ts")).toBe(player().ts);
  });
});
describe("selection identity and export", () => {
  it("round-trips exact program/year identities, deduplicates and limits shared URLs", () => {
    const picks = [
      selection,
      { ...selection, season: 2025 },
      { ...selection, team_id: "99" },
    ];
    expect(
      readSelections(
        new URLSearchParams(comparisonParams(picks, "perGame")),
        [2025, 2026],
      ),
    ).toEqual({ selections: picks, rejected: 0 });
    const value = new URLSearchParams(
      "p=2026:123:12&p=2026:123:12&p=2026:123:99&p=2025:123:12&p=2026:999:99&p=2027:123:12&p=2026:no:12",
    );
    const parsed = readSelections(value, [2025, 2026]);
    expect(parsed.selections).toHaveLength(3);
    expect(parsed.rejected).toBe(3);
  });
  it("rejects mixed editions, wrong program totals, and changed figures", () => {
    const s = index(),
      d = data();
    expect(validateSeason(s, 2026, catalog)).toBe(s);
    expect(joinComparison(selection, s, d).summary.games).toBe(20);
    expect(() => joinComparison({ ...selection, team_id: "99" }, s, d)).toThrow(
      /player\/program/,
    );
    d.profiles[0].edition = "changed";
    expect(() => joinComparison(selection, s, d)).toThrow(/editions/);
    d.profiles[0].edition = s.edition;
    d.profiles[0].teams[0].ppg = 99;
    expect(() => joinComparison(selection, s, d)).toThrow(/disagree/);
    expect(() =>
      validateSeason({ ...s, edition: "changed" }, 2026, catalog),
    ).toThrow(/edition/);
  });
  it("exports full precision, raw samples and provenance, with quoted safe names", () => {
    const r = joinComparison(selection, index(), data());
    r.player.name = '=HYPERLINK("bad")';
    r.summary.totals.orb = null;
    const csv = comparisonCsv([r], "per40");
    expect(csv).toContain('"pts","per_40_minutes","16"');
    expect(csv).toContain('"orb","per_40_minutes",""');
    expect(csv).toContain('"fga","total","180"');
    expect(csv).toContain('"fga","recorded_games","20"');
    expect(csv).toContain('"\'=HYPERLINK(""bad"")"');
    expect(csv).toContain(r.edition);
  });
  it("accepts every published season and preserves its exact source identity keys", () => {
    let total = 0;
    for (const c of catalog.seasons) {
      const file: SeasonPlayers = JSON.parse(
        fs.readFileSync(
          `public/data/basketball/history/players-${c.season}.json`,
          "utf8",
        ),
      );
      validateSeason(file, c.season, catalog);
      const keys = new Set<string>();
      for (const p of file.players) {
        const key = `${p.season}:${p.id}:${p.team_id}`;
        expect(keys.has(key)).toBe(false);
        keys.add(key);
        expect(p.season).toBe(c.season);
        expect(p.minutes).toBeGreaterThan(0);
        expect(p.games).toBeGreaterThan(0);
        expect(
          readSelections(new URLSearchParams({ p: key }), [c.season]).rejected,
        ).toBe(0);
      }
      expect(keys.size).toBe(c.player_team_entries);
      total += keys.size;
    }
    expect(total).toBeGreaterThan(160000);
  });
});
