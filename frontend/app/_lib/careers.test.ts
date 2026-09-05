import { describe, it, expect } from "vitest";
import {
  careerPoints,
  identityReview,
  rankProduction,
  type CareerProfile,
} from "./careers";
const profile = (
  season: number,
  name = "Player One",
  value: number | null = 10,
) =>
  ({
    season,
    name,
    overall: { ppg: value, games: 20 },
    teams: [{ team: "Program", games: 20 }],
  }) as CareerProfile;
describe("historical player comparisons", () => {
  it("keeps missing rates unavailable and orders actual source seasons", () => {
    expect(
      careerPoints(
        [profile(2026, "Player One", null), profile(2024)],
        "ppg",
      ).map((p) => [p.season, p.value]),
    ).toEqual([
      [2024, 10],
      [2026, null],
    ]);
  });
  it("requires review for differing names or unusually long source spans", () => {
    expect(
      identityReview([
        profile(2005, "Marcus Watson"),
        profile(2025, "Marcus Watson Jr."),
      ]),
    ).toBe(true);
    expect(identityReview([profile(2005), profile(2025)])).toBe(true);
    expect(
      identityReview([profile(2024, "Džafic"), profile(2026, "Dzafic")]),
    ).toBe(false);
  });
  it("assigns competition ranks before search, leaves missing values unranked", () => {
    const players = [
      { id: "a", team_id: "1", name: "A", ppg: 10 },
      { id: "b", team_id: "2", name: "B", ppg: 20 },
      { id: "c", team_id: "3", name: "C", ppg: 20 },
      { id: "d", team_id: "4", name: "D", ppg: null },
    ];
    const ranked = rankProduction(players, (p) => p.ppg);
    expect(ranked.map((p) => p.statRank)).toEqual([1, 1, 3, null]);
    expect(ranked.filter((p) => p.name === "A")[0].statRank).toBe(3);
    expect(players[0].name).toBe("A");
  });
});
