import type { BBGame, BBOverview } from "./basketball-types";
import type { Metric, ScoutProfile, ScoutPlayer } from "./scouting-types";
import { recruitingRows, type RecruitingRelease } from "./recruiting";
import type { Ledger } from "./research-types";

export const briefFactors = [
  {
    key: "efg",
    title: "Shot-making",
    label: "Effective FG%",
    question:
      "Which actions create efficient shots, and which coverages take those looks away? Separate rim attempts, catch-and-shoot threes and contested pull-ups on film.",
  },
  {
    key: "tov",
    title: "Protecting the possession",
    label: "Turnovers / possessions",
    question:
      "Do the turnovers come from ball pressure, passing-lane help or unforced mistakes? Identify the ball handlers and distinguish live-ball losses from dead-ball turnovers.",
  },
  {
    key: "orb",
    title: "Finishing the possession",
    label: "Offensive rebound rate",
    question:
      "Who earns the second-chance possessions, and who must take the first box-out assignment? Check whether extra crashers leave transition chances at the other end.",
  },
  {
    key: "ftr",
    title: "Keeping the game off the line",
    label: "Free-throw attempts / FGA",
    question:
      "Which actions draw shooting fouls, and which defenders can contain them without fouling? Check the personnel and foul context before assigning a coverage.",
  },
] as const;
export type BriefFactor = (typeof briefFactors)[number];
export type PressurePoint = {
  factor: BriefFactor;
  offense: string;
  defense: string;
  offensive: Metric;
  defensive: Metric;
  contrast: number;
  category: string;
};

export function pressurePoints(
  offense: ScoutProfile,
  defense: ScoutProfile,
): PressurePoint[] {
  return briefFactors
    .flatMap((factor) => {
      const offensive = offense.splits.season.metrics[`off_${factor.key}`];
      const defensive = defense.splits.season.metrics[`def_${factor.key}`];
      if (
        !offensive ||
        !defensive ||
        offensive.value == null ||
        defensive.value == null ||
        offensive.games < 10 ||
        defensive.games < 10 ||
        offensive.percentile == null ||
        defensive.percentile == null ||
        offensive.rank == null ||
        defensive.rank == null
      )
        return [];
      const a = offensive.percentile,
        b = defensive.percentile;
      const category =
        a >= 75 && b <= 25
          ? "Offensive strength / defensive concern"
          : a <= 25 && b >= 75
            ? "Offensive concern / defensive strength"
            : a >= 75 && b >= 75
              ? "Strength against strength"
              : a <= 25 && b <= 25
                ? "Two historical concerns"
                : "A contrast to investigate";
      return [
        {
          factor,
          offense: offense.name,
          defense: defense.name,
          offensive,
          defensive,
          contrast: Math.abs(a - b),
          category,
        },
      ];
    })
    .sort(
      (a, b) =>
        b.contrast - a.contrast || a.factor.key.localeCompare(b.factor.key),
    )
    .slice(0, 2);
}

export function historicalPersonnel(profile: ScoutProfile): ScoutPlayer[] {
  return profile.players
    .filter(
      (p) =>
        p.minutes >= 200 &&
        p.games > 0 &&
        p.team_id === profile.id &&
        p.season === profile.season,
    )
    .sort((a, b) => b.minutes - a.minutes || a.id.localeCompare(b.id))
    .slice(0, 3);
}

export function briefScenarioUrl(
  game: Pick<BBGame, "home_id" | "away_id" | "neutral">,
) {
  return `/basketball/compare/?${new URLSearchParams({ a: game.home_id, b: game.away_id, venue: game.neutral ? "neutral" : "a" })}`;
}

export function briefEvidence(
  game: BBGame,
  overview: BBOverview,
  home: ScoutProfile,
  away: ScoutProfile,
  recruiting: RecruitingRelease,
  ledger: Ledger,
) {
  for (const [profile, id] of [
    [home, game.home_id],
    [away, game.away_id],
  ] as const) {
    if (
      profile.id !== id ||
      profile.model_id !== overview.model.id ||
      profile.source_edition !== overview.generated_at ||
      profile.season !== overview.season - 1
    )
      throw Error("Matchup scouting differs from the published model edition");
  }
  const announcementRows =
    recruiting.season === overview.season ? recruitingRows(recruiting) : [];
  const record = ledger.games.find(
    (r) =>
      r.sport === "basketball" &&
      r.game_id === game.id &&
      r.model_id === overview.model.id,
  );
  // A different schedule or forecast snapshot is not evidence for this brief.
  const selected =
    record &&
    record.home_name === game.home_name &&
    record.away_name === game.away_name &&
    Date.parse(record.starts_at) === Date.parse(game.starts_at) &&
    Boolean(record.time_tbd) === Boolean(game.time_tbd) &&
    record.home_margin === game.prediction?.home_margin &&
    record.total === game.prediction?.total &&
    record.home_win_probability === game.prediction?.home_win_probability
      ? record
      : null;
  return {
    pressures: [...pressurePoints(away, home), ...pressurePoints(home, away)],
    programs: [away, home].map((profile) => ({
      profile,
      personnel: historicalPersonnel(profile),
      announcements: announcementRows.filter((p) => p.team_id === profile.id),
      reviewed:
        recruiting.season === overview.season &&
        recruiting.programs.some((p) => p.id === profile.id),
    })),
    ledger: selected,
  };
}
