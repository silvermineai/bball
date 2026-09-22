import type { AnnouncementEvent, RecruitingPerson } from "./recruiting";

export type RecruitingPlayerCoverageRow = {
  category: RecruitingPerson["category"];
  players: number;
  events: number;
  historicalLinks: number;
  historicalLinkShare: number | null;
};

const categoryOrder: RecruitingPerson["category"][] = ["transfer", "freshman", "international"];

/**
 * Reconcile the retained recruiting people with their dated events and exact
 * prior-production objects. This is a release summary: it never treats a
 * missing stats object as a zero and never infers an event from a player row.
 */
export function recruitingPlayerCoverage(
  people: RecruitingPerson[],
  events: AnnouncementEvent[],
): RecruitingPlayerCoverageRow[] {
  const eventCounts = new Map<string, number>();
  events.forEach((event) => eventCounts.set(event.person_key, (eventCounts.get(event.person_key) || 0) + 1));

  return categoryOrder.map((category) => {
    const rows = people.filter((person) => person.category === category);
    const historicalLinks = rows.filter((person) => person.stats != null).length;
    return {
      category,
      players: rows.length,
      events: rows.reduce((total, person) => total + (eventCounts.get(person.key) || 0), 0),
      historicalLinks,
      historicalLinkShare: rows.length ? historicalLinks / rows.length : null,
    };
  }).filter((row) => row.players > 0);
}
