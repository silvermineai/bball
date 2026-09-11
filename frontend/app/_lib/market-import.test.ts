import { describe, expect, it } from "vitest";
import { parseMarketCsv, validateMarketImportCsv } from "./market-import";

const header = "game_id,market,starts_at,captured_at,updated_at,home_name,away_name,bookmaker,line,home_price,away_price,over_price,under_price,home_american,away_american,over_american,under_american,event_id";

describe("market import preflight", () => {
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
});
