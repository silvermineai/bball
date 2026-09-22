import { describe, expect, it } from "vitest";
import { recruitingPlayerCoverage } from "./recruiting-player-coverage";
import type { AnnouncementEvent, RecruitingPerson } from "./recruiting";

const people = [
  { key: "transfer-1", name: "Transfer One", team_id: "1", category: "transfer", previous_program: "A", stats: { id: "11" } },
  { key: "transfer-2", name: "Transfer Two", team_id: "1", category: "transfer", previous_program: "B", stats: null },
  { key: "freshman-1", name: "Freshman One", team_id: "1", category: "freshman", previous_program: null, stats: { id: "12" } },
] as unknown as RecruitingPerson[];
const events = [
  { id: "event-1", person_key: "transfer-1", kind: "addition", source_id: "source-1", summary: "Added" },
  { id: "event-2", person_key: "transfer-1", kind: "season_unavailable", source_id: "source-1", summary: "Unavailable" },
  { id: "event-3", person_key: "freshman-1", kind: "addition", source_id: "source-1", summary: "Added" },
] as AnnouncementEvent[];

describe("recruiting player coverage", () => {
  it("breaks retained players down by category and exact prior-production links", () => {
    expect(recruitingPlayerCoverage(people, events)).toEqual([
      { category: "transfer", players: 2, events: 2, historicalLinks: 1, historicalLinkShare: 0.5 },
      { category: "freshman", players: 1, events: 1, historicalLinks: 1, historicalLinkShare: 1 },
    ]);
  });

  it("keeps categories with no dated events and omits empty categories", () => {
    const rows = recruitingPlayerCoverage([
      { key: "international-1", name: "International One", team_id: "1", category: "international", previous_program: null, stats: null },
    ] as unknown as RecruitingPerson[], []);
    expect(rows).toEqual([{ category: "international", players: 1, events: 0, historicalLinks: 0, historicalLinkShare: 0 }]);
  });
});
