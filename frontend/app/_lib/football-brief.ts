import type { EfficiencyIndex, EfficiencyTeam } from "./football-efficiency";

export const unitQuestions = [
  {
    key: "epa",
    question:
      "Which downs and field positions account for the efficiency? Review the game log before assigning a coverage.",
  },
  {
    key: "pass_epa",
    question:
      "Separate protection, pressure and coverage on film. Team passing EPA does not identify which player or scheme created the result.",
  },
  {
    key: "rush_epa",
    question:
      "Check box counts, blocking and quarterback run involvement. These totals do not establish a front or gap tendency.",
  },
  {
    key: "ypp",
    question:
      "Separate sustained gains from a few long plays, and inspect opponent quality before comparing averages.",
  },
  {
    key: "explosive",
    question:
      "Review the source-classified explosive plays on film. This measure does not establish a fixed yardage threshold.",
  },
  {
    key: "stuff",
    question:
      "Check where runs break down and which fronts were involved. A team rate is not an individual blocking grade.",
  },
] as const;
export type BriefPlayer = {
  id: string;
  team_id: string;
  name: string;
  team: string;
  season: number;
  division: string;
  production: Record<
    string,
    {
      plays: number | null;
      epa: number | null;
      epa_per_play: number | null;
      games: number | null;
      rank: number | null;
    }
  >;
};
export type PersonnelRow = {
  player: Pick<BriefPlayer, "id" | "team_id" | "name" | "team" | "season">;
  category: string;
  production: BriefPlayer["production"][string];
};
export function historicalLeaders(
  players: BriefPlayer[],
  team: string,
  season: number,
): PersonnelRow[] {
  return ["passing", "rushing", "receiving"].flatMap((category) =>
    players
      .filter(
        (p) =>
          p.team_id === team &&
          p.season === season &&
          p.division === "fbs" &&
          /^[1-9]\d*$/.test(p.id),
      )
      .filter((p) => {
        const s = p.production[category];
        return (
          s &&
          s.rank != null &&
          s.rank > 0 &&
          Number.isFinite(s.epa) &&
          Number.isFinite(s.plays) &&
          s.plays! >= { passing: 100, rushing: 50, receiving: 30 }[category]!
        );
      })
      .sort(
        (a, b) =>
          b.production[category].epa! - a.production[category].epa! ||
          a.id.localeCompare(b.id),
      )
      .slice(0, 2)
      .map((p) => ({
        player: {
          id: p.id,
          team_id: p.team_id,
          name: p.name,
          team: p.team,
          season: p.season,
        },
        category,
        production: p.production[category],
      })),
  );
}
export type FootballBriefEvidence = {
  efficiencyEdition: string;
  playerEdition: string;
  playerSeason: number;
  playerFile: string;
  playerSha256: string;
  metrics: EfficiencyIndex["metrics"];
  seasons: {
    season: number;
    retrieved: string;
    teams: (EfficiencyTeam | null)[];
  }[];
  programs: { id: string; name: string; personnel: PersonnelRow[] }[];
  sources: EfficiencyIndex["sources"];
};
