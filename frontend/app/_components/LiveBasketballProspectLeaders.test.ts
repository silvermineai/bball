import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import LiveBasketballProspectLeaders from "./LiveBasketballProspectLeaders";
import { formatProspectSize, prospectCountLabel, prospectCsvHeaders, prospectCsvRows, validateProspectExportPage } from "./LiveBasketballProspectLeaders";

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


describe("prospect class labels", () => {
  it("uses the selected class in the count label", () => {
    expect(prospectCountLabel(254, 2028)).toBe("254 prospects in the 2028 class");
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
