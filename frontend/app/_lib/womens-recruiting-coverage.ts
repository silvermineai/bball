export type WomensRecruitingCoverageInput = {
  rosterRows: number;
  rosterTeams: number;
  playerSeasonRows: number;
  recruitingEvents?: number;
};

export type WomensRecruitingSurface = {
  key: "events" | "roster" | "production";
  label: string;
  status: "recorded" | "unavailable";
  rows: number;
  note: string;
};

const count = (value: number | undefined) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;

/**
 * Keep roster observations separate from recruiting events. A retained
 * roster row is useful context, but it is not evidence of a commitment,
 * transfer or eligibility decision.
 */
export function womensRecruitingCoverage(input: WomensRecruitingCoverageInput): WomensRecruitingSurface[] {
  const events = count(input.recruitingEvents);
  const rosterRows = count(input.rosterRows);
  const rosterTeams = count(input.rosterTeams);
  const playerSeasonRows = count(input.playerSeasonRows);
  return [
    {
      key: "events",
      label: "Recruiting events",
      status: events > 0 ? "recorded" : "unavailable",
      rows: events,
      note: events > 0 ? "Validated women’s recruiting event rows." : "No validated women’s recruiting event release is published.",
    },
    {
      key: "roster",
      label: "2027 roster context",
      status: rosterRows > 0 ? "recorded" : "unavailable",
      rows: rosterRows,
      note: `${rosterTeams} source-listed teams; roster context does not establish commitment or eligibility.`,
    },
    {
      key: "production",
      label: "2026 player production",
      status: playerSeasonRows > 0 ? "recorded" : "unavailable",
      rows: playerSeasonRows,
      note: "Observed player-season rows kept separate from future roster or recruiting claims.",
    },
  ];
}
