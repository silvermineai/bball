import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import LiveBasketballProspectLeaders from "./LiveBasketballProspectLeaders";
import { buildProspectParams, formatProspectRank, formatProspectSize, parseProspectBoardFilters, prospectBoardFilterSearch, prospectBoardResponseState, prospectCountLabel, prospectCsvHeaders, prospectCsvRows, prospectProvenanceLabel, prospectRankBreakdown, validateProspectExportPage } from "./LiveBasketballProspectLeaders";

describe("homepage recruiting section", () => {
  it("renders the prospect board as the fifth dashboard section", () => {
    const html = renderToStaticMarkup(createElement(LiveBasketballProspectLeaders));
    expect(html).toContain("05 / RECRUITING");
    expect(html).toContain("Top 2027 prospects");
    expect(html).toContain('aria-labelledby="dashboard-prospects"');
  });
});

describe("prospect size formatting", () => {
  it("renders the recorded height and weight together", () => {
    expect(formatProspectSize({ athlete_id: "1", name: "Guard", height_inches: 75, weight_pounds: 185 })).toBe("6'3\" · 185 lb");
  });

  it("keeps missing measurements unavailable", () => {
    expect(formatProspectSize({ athlete_id: "2", name: "Forward" })).toBe("—");
  });
});

describe("prospect position rank formatting", () => {
  it("keeps position rank separate from national rank", () => {
    expect(formatProspectRank(7)).toBe("#7");
    expect(formatProspectRank(7.8)).toBe("#7");
  });

  it("keeps missing or invalid position rank unavailable", () => {
    expect(formatProspectRank(null)).toBe("—");
    expect(formatProspectRank(0)).toBe("—");
    expect(formatProspectRank(Number.NaN)).toBe("—");
  });
});

describe("prospect dimensional rank formatting", () => {
  it("keeps position, state and region ranks distinct", () => {
    expect(prospectRankBreakdown({ position_rank: 7, state_rank: 3, region_rank: 12 })).toEqual({
      position: "#7",
      state: "#3",
      region: "#12",
    });
  });

  it("does not turn missing dimensional ranks into zeroes", () => {
    expect(prospectRankBreakdown({ position_rank: null, state_rank: 0, region_rank: Number.NaN })).toEqual({
      position: "—",
      state: "—",
      region: "—",
    });
  });
});


describe("prospect class labels", () => {
  it("uses the selected class in the count label", () => {
    expect(prospectCountLabel(254, 2028)).toBe("254 prospects in the 2028 class");
  });

  it("keeps future-class rank and movement filters in the request", () => {
    expect(buildProspectParams({ season: 2029, page: 2, position: "PG", committed: "no", rankMax: "25", movement: "up", query: "  Crawford  " }).toString()).toBe("season=2029&page=2&committed=no&position=PG&q=Crawford&rank_max=25&movement=up");
  });

  it("omits empty optional filters instead of broadening them into values", () => {
    expect(buildProspectParams({ season: 2028, page: 0 }).toString()).toBe("season=2028&page=0&committed=all");
  });
});

describe("prospect response states", () => {
  it("keeps a valid zero-row filter result distinct from an unavailable release", () => {
    expect(prospectBoardResponseState({ rows: [] })).toBe("empty");
    expect(prospectBoardResponseState({ rows: [], source: "live" })).toBe("empty");
    expect(prospectBoardResponseState({ rows: [], source: "unavailable" })).toBe("unavailable");
  });

  it("requires an array of rows before calling a response usable", () => {
    expect(prospectBoardResponseState({ rows: undefined })).toBe("unavailable");
    expect(prospectBoardResponseState({ rows: [{ athlete_id: "1", name: "Guard" }] })).toBe("ready");
  });
});

describe("shareable homepage prospect filters", () => {
  it("round-trips class, position, destination, search and row count", () => {
    const filters = {
      season: 2029 as const,
      query: "  Crawford  ",
      position: "PG" as const,
      committed: "no" as const,
      rankMax: "" as const,
      movement: "all" as const,
      rowLimit: 50 as const,
    };
    const params = prospectBoardFilterSearch(filters);
    expect(params.toString()).toBe("prospectSeason=2029&prospectQ=Crawford&prospectPosition=PG&prospectCommitted=no&prospectRows=50");
    expect(parseProspectBoardFilters(params)).toEqual({ ...filters, rankMax: "", movement: "all", query: "Crawford" });
  });

  it("fails closed on unsupported values and bounds search text", () => {
    const params = new URLSearchParams(`prospectSeason=1900&prospectPosition=G&prospectCommitted=maybe&prospectRows=100&prospectQ=${"x".repeat(140)}`);
    expect(parseProspectBoardFilters(params)).toEqual({ season: 2027, query: "x".repeat(120), position: "", committed: "all", rankMax: "", movement: "all", rowLimit: 10 });
  });

  it("omits defaults so the page URL stays compatible with sport scope", () => {
    expect(prospectBoardFilterSearch({ season: 2027, query: "", position: "", committed: "all", rankMax: "", movement: "all", rowLimit: 10 }).toString()).toBe("");
  });
});

describe("prospect release provenance", () => {
  it("keeps a verified receipt distinct from an incomplete destination rollup", () => {
    expect(prospectProvenanceLabel({
      source_receipt: { integrity: "verified", source_rows: 383 },
      destination_coverage: { returned: 12, total: 106, complete: false },
    })).toBe("release receipt verified · 383 retained rows · 12 of 106 destination groups shown");
  });

  it("does not upgrade an unavailable receipt or malformed rollup", () => {
    expect(prospectProvenanceLabel({
      source_receipt: { integrity: "unavailable", source_rows: 383 },
      destination_coverage: { returned: 12, total: 10, complete: true },
    })).toBe("release receipt unavailable");
  });
});

describe("prospect CSV export", () => {
  it("retains movement, destination and physical fields", () => {
    const rows = prospectCsvRows([{
      athlete_id: "42",
      name: "Guard",
      rank: 12,
      previous_rank: 18,
      position: "PG",
      grade: 94.5,
      committed_team_id: "150",
      committed_team_name: "Example",
      height_inches: 75,
      weight_pounds: 185,
      captured_at: "2026-09-17T00:00:00Z",
    }], 2027);
    expect(prospectCsvHeaders).toContain("Movement");
    expect(rows[0].slice(0, 8)).toEqual([2027, 12, 18, "▲ 6", "42", "Guard", "PG", 94.5]);
    expect(rows[0].slice(12)).toEqual(["150", "Example", null, null, 75, 185, "2026-09-17T00:00:00Z"]);
  });
});

describe("prospect export pagination", () => {
  const row = { athlete_id: "42", name: "Guard" };

  it("accepts a complete page with stable metadata", () => {
    expect(validateProspectExportPage({ season: 2027, total: 2, page_size: 1, rows: [row] }, 2027, 2, 1, 0, 2)).toEqual([row]);
  });

  it("rejects an empty intermediate page", () => {
    expect(() => validateProspectExportPage({ season: 2027, total: 2, page_size: 1, rows: [] }, 2027, 2, 1, 0, 2)).toThrow(/incomplete page/);
  });

  it("rejects a changed season or total", () => {
    expect(() => validateProspectExportPage({ season: 2026, total: 3, page_size: 1, rows: [row] }, 2027, 2, 1, 0, 2)).toThrow(/changed/);
  });
});
