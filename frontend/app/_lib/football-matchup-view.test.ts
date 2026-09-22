import { describe, expect, it } from "vitest";
import {
  matchesFootballMatchupSignal,
  matchesFootballMatchupDivision,
  filterFootballMatchupGames,
  parseFootballMatchupDivision,
  parseFootballMatchupSignal,
  parseFootballMatchupSort,
  sortFootballMatchups,
} from "./football-matchup-view";

const prediction = (probability: number) => ({
  home_margin: 1,
  total: 50,
  home_score: 26,
  away_score: 24,
  home_win_probability: probability,
  margin_low: -10,
  margin_high: 12,
});

describe("football matchup signal filters", () => {
  it("keeps division filters tied to source division labels", () => {
    expect(parseFootballMatchupDivision("2")).toBe("d2");
    expect(parseFootballMatchupDivision("iii")).toBe("d3");
    expect(parseFootballMatchupDivision("fbs")).toBe("d1");
    expect(parseFootballMatchupDivision("unknown")).toBe("d1");
    expect(matchesFootballMatchupDivision({ home_division: "d2", away_division: "d2" }, "d2")).toBe(true);
    expect(matchesFootballMatchupDivision({ home_division: "Division II", away_division: "Division II" }, "d2")).toBe(true);
    expect(matchesFootballMatchupDivision({ home_division: "d2", away_division: "d3" }, "d3")).toBe(false);
    expect(matchesFootballMatchupDivision({ home_division: "fbs", away_division: "fcs" }, "d1")).toBe(true);
    expect(matchesFootballMatchupDivision({ home_division: "fbs", away_division: "d2" }, "d1")).toBe(false);
    expect(matchesFootballMatchupDivision({ home_division: "d2", away_division: "d3" }, "d2")).toBe(false);
    expect(matchesFootballMatchupDivision({ home_division: "d2", away_division: "d3" }, "d1")).toBe(false);
    expect(filterFootballMatchupGames([
      { id: "d1", home_division: "fbs", away_division: "fcs" },
      { id: "d2", home_division: "d2", away_division: "d2" },
      { id: "d3", home_division: "d3", away_division: "d3" },
    ], "d2").map((row) => row.id)).toEqual(["d2"]);
  });
  it("accepts supported values and fails closed", () => {
    expect(parseFootballMatchupSignal("strong")).toBe("strong");
    expect(parseFootballMatchupSignal("wild")).toBe("all");
    expect(parseFootballMatchupSignal(null)).toBe("all");
  });

  it("uses the shared confidence boundaries", () => {
    expect(matchesFootballMatchupSignal(prediction(0.59), "toss-up")).toBe(true);
    expect(matchesFootballMatchupSignal(prediction(0.6), "lean")).toBe(true);
    expect(matchesFootballMatchupSignal(prediction(0.75), "strong")).toBe(true);
    expect(matchesFootballMatchupSignal(prediction(0.75), "lean")).toBe(false);
    expect(matchesFootballMatchupSignal(null, "strong")).toBe(false);
  });

  it("sorts by the requested model triage lens", () => {
    const rows = [
      { kickoff: "2026-09-03", prediction: prediction(0.59) },
      { kickoff: "2026-09-01", prediction: prediction(0.8) },
      { kickoff: "2026-09-02", prediction: null },
    ];
    expect(parseFootballMatchupSort("confidence")).toBe("confidence");
    expect(parseFootballMatchupSort("unknown")).toBe("date");
    expect(sortFootballMatchups(rows, "confidence").map((row) => row.kickoff)).toEqual(["2026-09-01", "2026-09-03", "2026-09-02"]);
    expect(sortFootballMatchups(rows, "date").map((row) => row.kickoff)).toEqual(["2026-09-01", "2026-09-02", "2026-09-03"]);
  });
});
