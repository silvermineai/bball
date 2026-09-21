import type { ScoutPlayer } from "../_lib/scouting-types";

export type NotebookPersonnelSignal = {
  label: string;
  value: string;
  question: string;
};

export type NotebookPersonnelWatchRow = {
  player: ScoutPlayer;
  signals: NotebookPersonnelSignal[];
};

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const positive = (value: unknown): value is number => finite(value) && value > 0;

const percentage = (value: number) => `${(value * 100).toFixed(1)}%`;

/**
 * Keep the pregame personnel read tied to retained player fields. These are
 * descriptive role signals for film preparation, never a new player grade or
 * a projected rotation. A signal is emitted only when its source value is
 * finite and its own denominator/count is usable.
 */
export function notebookPersonnelWatch(
  players: ScoutPlayer[],
  limit = 3,
): NotebookPersonnelWatchRow[] {
  if (!Number.isInteger(limit) || limit <= 0) return [];

  return players
    .filter((player) => player.id.trim() && player.team_id.trim() && player.games > 0)
    .sort((a, b) => b.minutes - a.minutes || a.id.localeCompare(b.id))
    .slice(0, limit)
    .map((player) => {
      const signals: NotebookPersonnelSignal[] = [];
      if (positive(player.usage_est) && positive(player.usage_games)) {
        signals.push({
          label: "Usage",
          value: percentage(player.usage_est),
          question: "How does the defense force this high-usage role into lower-value decisions?",
        });
      }
      if (finite(player.minutes_share) && player.minutes_share >= 0 && player.minutes_share <= 1) {
        signals.push({
          label: "Team minutes",
          value: percentage(player.minutes_share),
          question: "Who absorbs these recorded minutes if the matchup changes the rotation?",
        });
      }
      if (finite(player.assist_turnover_ratio) && positive(player.assist_turnover_games)) {
        signals.push({
          label: "A/TO",
          value: player.assist_turnover_ratio.toFixed(2),
          question: "Can ball pressure change this creator's recorded assist-to-turnover balance?",
        });
      }
      if (finite(player.three_attempts) && player.three_attempts >= 0 && positive(player.three_attempt_games)) {
        signals.push({
          label: "3PA",
          value: player.three_attempts.toFixed(1),
          question: "Which closeout rule protects the paint without conceding this player's recorded perimeter volume?",
        });
      }
      return { player, signals };
    });
}
