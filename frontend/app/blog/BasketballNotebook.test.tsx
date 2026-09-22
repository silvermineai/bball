import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import BasketballNotebook, { notebookForecastIdentity } from "./BasketballNotebook";
import type { BBGame } from "../_lib/basketball-types";

describe("basketball notebook forecast identity", () => {
  it("preserves the exact model edition and capture clock", () => {
    expect(notebookForecastIdentity("  basketball-efficiency-v2-abc123  ", "2026-09-19T12:00:00Z")).toEqual({
      modelId: "basketball-efficiency-v2-abc123",
      generatedAt: "2026-09-19T12:00:00Z",
    });
  });

  it("fails visibly when publication metadata is missing", () => {
    expect(notebookForecastIdentity("", null)).toEqual({
      modelId: "unavailable",
      generatedAt: "unavailable",
    });
  });
});

describe("basketball notebook market trail", () => {
  it("includes the exact-game live market check in the blog notebook", () => {
    const game: BBGame = {
      id: "401000001",
      season: 2027,
      starts_at: "2026-11-01T19:00:00Z",
      home_id: "1",
      away_id: "2",
      home_name: "Home College",
      away_name: "Away College",
      neutral: 0,
      time_tbd: 0,
      venue: "Arena",
      broadcast: "",
      prediction: {
        home_score: 75,
        away_score: 70,
        home_margin: 5,
        total: 145,
        pace: 70,
        home_win_probability: 0.65,
        margin_low: -4,
        margin_high: 14,
      },
    };
    const html = renderToStaticMarkup(<BasketballNotebook game={game} generatedAt="2026-09-21T00:00:00Z" recentForm={null} rosterSeason={2027} rosterSource={null} />);
    expect(html).toContain("Check the line beside this forecast.");
    expect(html).toContain("Checking the current forecast edition and its qualifying market observations");
  });
});
