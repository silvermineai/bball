import { describe, expect, it, vi } from "vitest";
import { womensLowerStats } from "../src/womens-lower-stats";

const receipt = {
  url: "https://www.ncaa.com/stats/basketball-women/d2/current/individual/1009",
  status: 200,
  sha256: "a".repeat(64),
  bytes: 128,
};

function edition() {
  const makeDivision = (division: 2 | 3) => ({
    source_scope: { sport: "basketball", gender: "women", division },
    source_url: receipt.url,
    season: 2026,
    through_games: "2026-03-15",
    identity_status: "source_names_and_team_slugs_only",
    identity_note: "No stable athlete ID is published.",
    individual: [{
      label: "Points per game",
      statistic: "ppg",
      headers: ["Rank", "Name", "PPG"],
      rows: [{ rank: 1, name: "Example Guard", ppg: 24.1, source_fields: { Name: "Example Guard" } }],
      source_url: receipt.url,
    }],
    team: [{
      label: "Scoring offense",
      statistic: "avgPoints",
      headers: ["Rank", "Team", "PPG"],
      rows: [{ rank: 1, team: "Example College", ppg: 82.4, source_fields: { Team: "Example College" } }],
      source_url: receipt.url,
    }],
  });
  return {
    schema_version: 1,
    generated_at: "2026-09-22T18:00:00Z",
    source: { publisher: "NCAA.com", method: "persisted source tables", limitation: "No stable athlete ID is published." },
    receipts: [receipt],
    divisions: { d2: makeDivision(2), d3: makeDivision(3) },
  };
}

function env(payload: unknown) {
  return { ASSETS: { fetch: vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })) } };
}

describe("women's lower-division stats API", () => {
  it("filters source-native rows by division, statistic, and search without inventing IDs", async () => {
    const response = await womensLowerStats.request("/?division=2&kind=individual&statistic=ppg&q=guard", {}, env(edition()));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      division: "2",
      kind: "individual",
      statistic: "ppg",
      total: 1,
      rows: [{ name: "Example Guard", source_fields: { Name: "Example Guard" } }],
      provenance: { publisher: "NCAA.com", identity_status: "source_names_and_team_slugs_only" },
    });
  });

  it("exposes the retained table catalog and exact receipt evidence", async () => {
    const response = await womensLowerStats.request("/?division=3&kind=team&meta=1", {}, env(edition()));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      division: "3",
      available_divisions: ["2", "3"],
      statistics: [{ statistic: "avgPoints", rows: 1, source_url: receipt.url }],
      source_receipts: [receipt],
    });
  });

  it("fails closed when a source row loses its retained fields", async () => {
    const malformed = edition();
    (malformed.divisions.d2.individual[0].rows as unknown as Record<string, unknown>[])[0] = { rank: 1, name: "Unsafe" };
    const response = await womensLowerStats.request("/?division=2", {}, env(malformed));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "release_integrity_failed" });
  });
});
