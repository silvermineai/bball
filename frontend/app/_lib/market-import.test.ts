import { describe, expect, it } from "vitest";
import { marketImportMatchState, marketImportMatchesGame, marketImportPrediction, marketImportScheduleSummary, parseMarketCsv, parseMarketImportRows, validateMarketImportCsv } from "./market-import";

const header = "game_id,market,starts_at,captured_at,updated_at,home_name,away_name,bookmaker,line,home_price,away_price,over_price,under_price,home_american,away_american,over_american,under_american,event_id";

describe("market import preflight", () => {
  it("uses the primary forecast before an explicitly labelled cold-start fallback", () => {
    const fallback = { home_score: 70, away_score: 68, home_margin: 2, total: 138, pace: 68, home_win_probability: 0.55, margin_low: -12, margin_high: 16, estimate_type: "cold_start" as const };
    const primary = { ...fallback, home_margin: 5, estimate_type: undefined };
    expect(marketImportPrediction({ prediction: primary, fallback_prediction: fallback })).toBe(primary);
    expect(marketImportPrediction({ prediction: null, fallback_prediction: fallback })).toBe(fallback);
    expect(marketImportPrediction(null)).toBeNull();
  });

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

  it("classifies exact joins separately from missing or mismatched schedule evidence", () => {
    const row = previewRow();
    const game = { id: "401", starts_at: "2027-01-01T20:00:00Z", home_name: "North State", away_name: "South State" };
    expect(marketImportMatchState(row, game)).toBe("exact");
    expect(marketImportMatchState(row, null)).toBe("missing_schedule");
    expect(marketImportMatchState({ ...row, homeName: "Different Home" }, game)).toBe("identity_or_clock_mismatch");
  });

  it("requires every row to join the published schedule before labeling an import ready", () => {
    const game = { id: "401", starts_at: "2027-01-01T20:00:00Z", home_name: "North State", away_name: "South State" };
    expect(marketImportScheduleSummary([previewRow()], [game])).toEqual({
      exact: 1,
      missingSchedule: 0,
      identityOrClockMismatch: 0,
      ready: true,
    });
    expect(marketImportScheduleSummary([
      previewRow(),
      previewRow({ gameId: "missing" }),
      previewRow({ homeName: "North St." }),
    ], [game])).toEqual({
      exact: 1,
      missingSchedule: 1,
      identityOrClockMismatch: 1,
      ready: false,
    });
    expect(marketImportScheduleSummary([], [game]).ready).toBe(false);
  });

  it("rejects provider updates too stale for scorecard comparison", () => {
    const csv = `${header}\n401,spreads,2027-01-01T20:00:00Z,2026-12-31T20:00:00Z,2026-12-30T19:59:59Z,Home,Away,Book,-3,1.91,1.91,,,,,,,event-1`;
    const result = validateMarketImportCsv(csv, new Date("2026-12-31T21:00:00Z"));
    expect(result.errors).toContain("Row 2: updated_at must be no more than 24 hours before captured_at.");
  });

  it("rejects a provider update at tip even when capture was pregame", () => {
    const csv = `${header}\n401,spreads,2027-01-01T20:00:00Z,2026-12-31T20:00:00Z,2027-01-01T20:00:00Z,Home,Away,Book,-3,1.91,1.91,,,,,,,event-1`;
    const result = validateMarketImportCsv(csv, new Date("2027-01-01T21:00:00Z"));
    expect(result.errors).toContain("Row 2: updated_at must be before starts_at.");
  });

  it("rejects duplicate quote identities before the server import", () => {
    const row = "401,spreads,2027-01-01T20:00:00Z,2026-12-31T20:00:00Z,2026-12-31T19:59:00Z,Home,Away,Book,-3,1.91,1.91,,,,,,,event-1";
    const result = validateMarketImportCsv(`${header}\n${row}\n${row.replace("event-1", "event-2")}`, new Date("2026-12-31T21:00:00Z"));
    expect(result.errors).toContain("Row 3: duplicate game/bookmaker/market/capture identity.");
  });

  it("matches server price and total-line validation before upload", () => {
    const negativeTotal = `${header}\n401,totals,2027-01-01T20:00:00Z,2026-12-31T20:00:00Z,2026-12-31T19:59:00Z,Home,Away,Book,-1,1.91,1.91,1.91,1.91,,,,,event-1`;
    const totalResult = validateMarketImportCsv(negativeTotal, new Date("2026-12-31T21:00:00Z"));
    expect(totalResult.errors).toContain("Row 2: totals require a non-negative line.");

    const nonstandardAmerican = `${header}\n401,h2h,2027-01-01T20:00:00Z,2026-12-31T20:00:00Z,2026-12-31T19:59:00Z,Home,Away,Book,,,,,,, -99,120,,,,event-1`;
    const priceResult = validateMarketImportCsv(nonstandardAmerican, new Date("2026-12-31T21:00:00Z"));
    expect(priceResult.errors).toContain("Row 2: h2h requires valid home and away prices.");
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

  it("previews totals that use the server's total_line alias", () => {
    const aliasHeader = header.replace("line,", "home_spread,total_line,");
    const cells = new Array<string>(aliasHeader.split(",").length).fill("");
    Object.assign(cells, {
      0: "401",
      1: "totals",
      2: "2027-01-01T20:00:00Z",
      3: "2026-12-31T20:00:00Z",
      4: "2026-12-31T19:59:00Z",
      5: "North State",
      6: "South State",
      7: "Book",
      9: "155.5",
      12: "1.91",
      13: "1.91",
      19: "event-total-1",
    });
    const csv = `${aliasHeader}\n${cells.join(",")}`;
    expect(parseMarketImportRows(csv)[0]).toMatchObject({ market: "totals", line: 155.5, overPrice: 1.91, underPrice: 1.91 });
  });
});
