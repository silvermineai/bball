import { describe, expect, it, vi } from "vitest";
import { womensLowerStats } from "../src/womens-lower-stats";

const receipt = {
  url: "https://www.ncaa.com/stats/basketball-women/d2/current/individual/1009",
  status: 200,
  sha256: "a".repeat(64),
  bytes: 128,
};
const d3Receipt = { ...receipt, url: receipt.url.replace("/d2/", "/d3/") };

function edition() {
  const makeDivision = (division: 2 | 3) => {
    const sourceUrl = (division === 2 ? receipt : d3Receipt).url;
    return {
    source_scope: { sport: "basketball", gender: "women", division },
    source_url: sourceUrl,
    season: 2026,
    through_games: "2026-03-15",
    identity_status: "source_names_and_team_slugs_only",
    identity_note: "No stable athlete ID is published.",
    available_statistics: {
      individual: [{ label: "Points per game", source_path: new URL(division === 2 ? receipt.url : d3Receipt.url).pathname }],
      team: [{ label: "Scoring offense", source_path: new URL(division === 2 ? receipt.url : d3Receipt.url).pathname }],
    },
    individual: [{
      label: "Points per game",
      statistic: "ppg",
      headers: ["Rank", "Name", "PPG"],
      rows: [{ rank: 1, name: "Example Guard", ppg: 24.1, source_fields: { Name: "Example Guard" } }],
      source_url: division === 2 ? receipt.url : d3Receipt.url,
    }],
    team: [{
      label: "Scoring offense",
      statistic: "avgPoints",
      headers: ["Rank", "Team", "PPG"],
      rows: [{ rank: 1, team: "Example College", ppg: 82.4, source_fields: { Team: "Example College" } }],
      source_url: division === 2 ? receipt.url : d3Receipt.url,
    }],
    };
  };
  return {
    schema_version: 1,
    generated_at: "2026-09-22T18:00:00Z",
    source: { publisher: "NCAA.com", method: "persisted source tables", limitation: "No stable athlete ID is published." },
    receipts: [receipt, d3Receipt],
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
      statistics: [{ statistic: "avgPoints", rows: 1, source_url: d3Receipt.url }],
      source_receipts: [receipt, d3Receipt],
    });
  });

  it("fails closed when a source row loses its retained fields", async () => {
    const malformed = edition();
    (malformed.divisions.d2.individual[0].rows as unknown as Record<string, unknown>[])[0] = { rank: 1, name: "Unsafe" };
    const response = await womensLowerStats.request("/?division=2", {}, env(malformed));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "release_integrity_failed" });
  });

  it("fails closed when a table is missing from the division source ledger", async () => {
    const malformed = edition();
    malformed.divisions.d3.available_statistics.individual = [];
    malformed.divisions.d3.available_statistics.team = [];
    const response = await womensLowerStats.request("/?division=3", {}, env(malformed));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "release_integrity_failed" });
  });

  it("fails closed when a lower-division table receipt points outside NCAA.com", async () => {
    const malformed = edition();
    const externalUrl = "https://example.com/stats/basketball-women/d2/current/individual/1009";
    malformed.receipts[0].url = externalUrl;
    malformed.divisions.d2.source_url = externalUrl;
    malformed.divisions.d2.individual[0].source_url = externalUrl;
    const response = await womensLowerStats.request("/?division=2", {}, env(malformed));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "release_integrity_failed" });
  });
});
