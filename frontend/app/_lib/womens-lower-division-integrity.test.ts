import { describe, expect, it } from "vitest";
import { parseWomensLowerDivisionEdition } from "./womens-lower-division-integrity";

const receipt = (url: string) => ({ url, status: 200, sha256: "a".repeat(64), bytes: 10 });

function edition(overrides: Record<string, unknown> = {}) {
  const d2Url = "https://www.ncaa.com/stats/basketball-women/d2/current/individual/102";
  const d3Url = "https://www.ncaa.com/stats/basketball-women/d3/current/individual/102";
  const makeDivision = (division: 2 | 3, url: string) => ({
    source_scope: { sport: "basketball", gender: "women", division },
    source_url: `https://www.ncaa.com/stats/basketball-women/d${division}`,
    season: 2026,
    identity_status: "source_names_and_team_slugs_only",
    identity_note: "No stable athlete IDs.",
    available_statistics: { individual: [{ label: "Points Per Game", source_path: `/stats/basketball-women/d${division}/current/individual/102` }], team: [] },
    individual: [{ label: "Points Per Game", statistic: "points_per_game", headers: ["Rank", "Name", "Team", "PPG"], source_url: url, rows: [{ rank: 1, name: "A Player", team: "A College", ppg: 20, source_fields: { Rank: "1", Name: "A Player", Team: "A College", PPG: "20" } }] }],
    team: [],
  });
  return {
    schema_version: 1,
    generated_at: "2026-09-20T00:00:00Z",
    source: { publisher: "NCAA.com", robots_url: "https://www.ncaa.com/robots.txt", method: "test", limitation: "Names only" },
    divisions: { d2: makeDivision(2, d2Url), d3: makeDivision(3, d3Url) },
    receipts: [
      receipt("https://www.ncaa.com/stats/basketball-women/d2"), receipt(d2Url),
      receipt("https://www.ncaa.com/stats/basketball-women/d3"), receipt(d3Url),
    ],
    ...overrides,
  };
}

describe("women's lower-division release integrity", () => {
  it("accepts exact D2/D3 scopes with receipts and retained row evidence", () => {
    const parsed = parseWomensLowerDivisionEdition(edition());
    expect(parsed.divisions["2"].source_scope).toEqual({ sport: "basketball", gender: "women", division: 2 });
    expect(parsed.divisions["3"].individual[0].rows[0].source_fields).toBeTruthy();
  });

  it("rejects a cross-division source path instead of rendering it in the selected division", () => {
    const value = edition();
    (value.divisions.d2.individual[0] as { source_url: string }).source_url = "https://www.ncaa.com/stats/basketball-women/d3/current/individual/102";
    expect(() => parseWomensLowerDivisionEdition(value)).toThrow(/D2.*source path/);
  });

  it("rejects a division envelope whose source URL points at another division", () => {
    const value = edition();
    value.divisions.d2.source_url = "https://www.ncaa.com/stats/basketball-women/d3/current";
    value.receipts.push(receipt(value.divisions.d2.source_url));
    expect(() => parseWomensLowerDivisionEdition(value)).toThrow(/D2 source URL/);
  });

  it("rejects rows without exact source fields", () => {
    const value = edition();
    delete (value.divisions.d3.individual[0].rows[0] as Record<string, unknown>).source_fields;
    expect(() => parseWomensLowerDivisionEdition(value)).toThrow(/without retained source fields/);
  });

  it("rejects an invalid receipt hash", () => {
    const value = edition();
    value.receipts[1] = { ...value.receipts[1], sha256: "missing" };
    expect(() => parseWomensLowerDivisionEdition(value)).toThrow(/receipt is malformed/);
  });

  it("rejects a source table hosted outside NCAA.com", () => {
    const value = edition();
    const externalUrl = "https://example.com/stats/basketball-women/d2/current/individual/102";
    value.receipts[1].url = externalUrl;
    (value.divisions.d2.individual[0] as { source_url: string }).source_url = externalUrl;
    expect(() => parseWomensLowerDivisionEdition(value)).toThrow(/NCAA\.com source URL/);
  });

  it("rejects an individual table ledgered under the team path", () => {
    const value = edition();
    const teamUrl = "https://www.ncaa.com/stats/basketball-women/d2/current/team/102";
    value.receipts.push(receipt(teamUrl));
    value.divisions.d2.available_statistics.individual[0].source_path = "/stats/basketball-women/d2/current/team/102";
    (value.divisions.d2.individual[0] as { source_url: string }).source_url = teamUrl;
    expect(() => parseWomensLowerDivisionEdition(value)).toThrow(/available-statistics ledger is malformed/);
  });

  it("rejects a dangling ledger entry under the wrong stat kind", () => {
    const value = edition();
    (value.divisions.d2.available_statistics.team as Array<{ label: string; source_path: string }>).push({
      label: "Scoring offense",
      source_path: "/stats/basketball-women/d2/current/individual/103",
    });
    expect(() => parseWomensLowerDivisionEdition(value)).toThrow(/available-statistics ledger is malformed/);
  });
});
