import { describe, expect, it } from "vitest";
import { marketImportMatchesGame, parseMarketCsv, parseMarketImportRows, validateMarketImportCsv } from "./market-import";

const header = "game_id,market,starts_at,captured_at,updated_at,home_name,away_name,bookmaker,line,home_price,away_price,over_price,under_price,home_american,away_american,over_american,under_american,event_id";

describe("market import preflight", () => {
  const previewRow = (overrides: Partial<ReturnType<typeof parseMarketImportRows>[number]> = {}) => ({
    gameId: "401",
    market: "spreads",
    startsAt: "2027-01-01T20:00:00Z",
    capturedAt: "2026-12-31T20:00:00Z",
    updatedAt: "2026-12-31T19:59:00Z",
    homeName: "North State",
    awayName: "South State",
    bookmaker: "Book",
    line: -3,
    homePrice: 1.91,
    awayPrice: 1.91,
    overPrice: null,
    underPrice: null,
    ...overrides,
  });

  it("matches equivalent timestamp encodings only when participants and IDs are exact", () => {
    const row = previewRow();
    const game = { id: "401", starts_at: "2027-01-01T12:00:00-08:00", home_name: "North State", away_name: "South State" };
    expect(marketImportMatchesGame(row, game)).toBe(true);
    expect(marketImportMatchesGame({ ...row, homeName: "North St." }, game)).toBe(false);
    expect(marketImportMatchesGame({ ...row, gameId: "402" }, game)).toBe(false);
  });

  it("fails closed when either preview start clock is invalid", () => {
    const row = previewRow({ startsAt: "2027-01-01 20:00:00" });
    const game = { id: "401", starts_at: "2027-01-01T20:00:00Z", home_name: "North State", away_name: "South State" };
    expect(marketImportMatchesGame(row, game)).toBe(false);
  });

  it("parses quoted names and accepts a valid spread row", () => {
    const csv = `${header}\n401,"spreads",2027-01-01T20:00:00Z,2026-12-31T20:00:00Z,2026-12-31T19:59:00Z,"North, Home",Away,Book,-3,1.91,1.91,,,,,,,event-1`;
    expect(parseMarketCsv(csv)[1][6]).toBe("Away");
    expect(validateMarketImportCsv(csv, new Date("2026-12-31T21:00:00Z"))).toMatchObject({ rows: 1, markets: { spreads: 1 }, errors: [] });
  });

  it("requires timing, exact-market fields and both prices", () => {
    const csv = `${header}\n401,h2h,2027-01-01T20:00:00Z,2027-01-01T21:00:00Z,2027-01-01T21:01:00Z,Home,Away,Book,,,,,,,,,,`;
    const result = validateMarketImportCsv(csv, new Date("2027-01-02T00:00:00Z"));
    expect(result.errors.join(" ")).toContain("before starts_at");
    expect(result.errors.join(" ")).toContain("updated_at cannot be after");
    expect(result.errors.join(" ")).toContain("h2h requires valid");
  });

  it("rejects provider updates too stale for scorecard comparison", () => {
    const csv = `${header}\n401,spreads,2027-01-01T20:00:00Z,2026-12-31T20:00:00Z,2026-12-30T19:59:59Z,Home,Away,Book,-3,1.91,1.91,,,,,,,event-1`;
    const result = validateMarketImportCsv(csv, new Date("2026-12-31T21:00:00Z"));
    expect(result.errors).toContain("Row 2: updated_at must be no more than 24 hours before captured_at.");
  });

  it("normalizes decimal and American prices for a browser comparison preview", () => {
    const csv = `${header}\n${["401", "h2h", "2027-01-01T20:00:00Z", "2026-12-31T20:00:00Z", "2026-12-31T19:59:00Z", "Home", "Away", "Book", "", "", "", "", "", "-120", "105", "", "", "event-1"].join(",")}`;
    expect(parseMarketImportRows(csv)).toMatchObject([{
      gameId: "401",
      market: "h2h",
      homePrice: 1 + 100 / 120,
      awayPrice: 2.05,
      line: null,
    }]);
  });

  it("accepts provider line aliases used by the server importer", () => {
    const aliasHeader = header.replace("line,", "home_spread,total_line,");
    const cells = new Array<string>(aliasHeader.split(",").length).fill("");
    Object.assign(cells, {
      0: "401",
      1: "spreads",
      2: "2027-01-01T20:00:00Z",
      3: "2026-12-31T20:00:00Z",
      4: "2026-12-31T19:59:00Z",
      5: "Home",
      6: "Away",
      7: "Book",
      8: "-3.5",
      10: "1.91",
      11: "1.91",
      19: "event-2",
    });
    const csv = `${aliasHeader}\n${cells.join(",")}`;
    expect(validateMarketImportCsv(csv, new Date("2026-12-31T21:00:00Z"))).toMatchObject({ rows: 1, markets: { spreads: 1 }, errors: [] });
    expect(parseMarketImportRows(csv)[0].line).toBe(-3.5);
  });
});
