import type { ScoutPlayer, ScoutProfile } from "./scouting-types";
import type { PressurePoint } from "./matchup-brief";

export type FactorPersonnelProgram = {
  profile: Pick<ScoutProfile, "id" | "name" | "season">;
  personnel: ScoutPlayer[];
};

export type FactorPersonnelQuestion = {
  key: string;
  factor: PressurePoint["factor"];
  offense: string;
  defense: string;
  player: ScoutPlayer;
  metricLabel: string;
  metricValue: number;
  metricText: string;
  sampleText: string;
  playerHref: string;
  question: string;
};

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * Attach one historical personnel lead to each exact pressure point. These
 * are review prompts, not matchup assignments or new model inputs. Missing
 * player fields, identity mismatches and insufficient workload are withheld.
 */
export function buildFactorPersonnelQuestions(
  pressures: PressurePoint[],
  programs: FactorPersonnelProgram[],
): FactorPersonnelQuestion[] {
  return pressures.flatMap((point) => {
    const program = programs.find(
      (entry) => entry.profile.name === point.offense,
    );
    if (!program) return [];
    const candidates = program.personnel.filter(
      (player) =>
        player.team_id === program.profile.id &&
        player.season === program.profile.season &&
        player.games > 0 &&
        player.minutes >= 200,
    );
    const metric =
      point.factor.key === "efg"
        ? { label: "recorded eFG%", value: (player: ScoutPlayer) => player.efg, descending: true }
        : point.factor.key === "tov"
          ? { label: "estimated usage", value: (player: ScoutPlayer) => player.usage_est, descending: true }
          : point.factor.key === "orb"
            ? { label: "offensive rebounds per game", value: (player: ScoutPlayer) => player.orpg, descending: true }
            : { label: "free-throw attempt rate", value: (player: ScoutPlayer) => player.ft_rate, descending: true };
    const player = candidates
      .filter((candidate) => finite(metric.value(candidate)))
      .sort((a, b) => {
        const difference = metric.value(b)! - metric.value(a)!;
        return (metric.descending ? difference : -difference) || a.id.localeCompare(b.id);
      })[0];
    if (!player) return [];
    const value = metric.value(player)!;
    const metricText =
      metric.label === "recorded eFG%" || metric.label === "free-throw attempt rate"
        ? `${(value * 100).toFixed(1)}%`
        : value.toFixed(1);
    const key = `${point.offense}:${point.defense}:${point.factor.key}`;
    return [{
      key,
      factor: point.factor,
      offense: point.offense,
      defense: point.defense,
      player,
      metricLabel: metric.label,
      metricValue: value,
      metricText,
      sampleText: `${player.games.toLocaleString()} games · ${player.minutes.toLocaleString()} minutes`,
      playerHref: `/basketball/player/?id=${encodeURIComponent(player.id)}&season=${encodeURIComponent(String(player.season))}`,
      question: `Does ${player.name}'s recorded ${metric.label} hold against ${point.defense}'s ${point.factor.label.toLowerCase()} profile? Use film to identify the first action or coverage that changes the look.`,
    }];
  });
}
