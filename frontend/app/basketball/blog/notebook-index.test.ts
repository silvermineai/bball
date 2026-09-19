import { describe, expect, it } from "vitest";
import {
  searchNotebookGames,
  type NotebookIndexGame,
} from "./notebook-index";

const game = (
  id: string,
  startsAt: string,
  awayName: string,
  homeName: string,
): NotebookIndexGame => ({
  id,
  startsAt,
  awayId: `${id}-away`,
  awayName,
  homeId: `${id}-home`,
  homeName,
  neutral: false,
  timeTbd: false,
  forecast: {
    awayScore: 70,
    homeScore: 72,
    homeWinProbability: 0.56,
    marginLow: -9,
    marginHigh: 13,
    estimateType: "primary",
  },
});

const games = [
  game("later", "2026-11-09T20:00:00Z", "St. John's", "Duke"),
  game("first", "2026-11-02T20:00:00Z", "Duke", "Arizona"),
  game("other", "2026-11-04T20:00:00Z", "UCLA", "Gonzaga"),
];

describe("basketball notebook index", () => {
  it("shows the next forecast-backed games in schedule order by default", () => {
    expect(searchNotebookGames(games, "", 2).map((row) => row.id)).toEqual([
      "first",
      "other",
    ]);
  });

  it("finds every future notebook for a team instead of only the landing-page preview", () => {
    expect(searchNotebookGames(games, "duke").map((row) => row.id)).toEqual([
      "first",
      "later",
    ]);
  });

  it("matches multi-team queries, punctuation variants and immutable IDs", () => {
    expect(searchNotebookGames(games, "st johns duke").map((row) => row.id)).toEqual(["later"]);
    expect(searchNotebookGames(games, "other-home").map((row) => row.id)).toEqual(["other"]);
  });

  it("returns no rows when the requested team has no published notebook", () => {
    expect(searchNotebookGames(games, "Villanova")).toEqual([]);
  });
});
