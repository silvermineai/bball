import type { BBGame } from "./basketball-types";

export type ScheduleClockRow = {
  game_id: string;
  source_start?: string | null;
  source_time_valid?: boolean;
  observed_at?: string | null;
};

export type ScheduleClockResponse = {
  rows?: ScheduleClockRow[];
  total?: number;
  confirmed?: number | boolean;
  confirmed_count?: number;
};

export async function loadLiveBasketballScheduleClocks(
  signal?: AbortSignal,
  season = 2027,
): Promise<ScheduleClockResponse> {
  const response = await fetch(
    `/api/basketball/research/schedule-times?season=${season}&limit=200`,
    { signal },
  );
  if (!response.ok) throw new Error("Live schedule-clock evidence unavailable.");
  const payload = await response.json() as ScheduleClockResponse;
  return {
    ...payload,
    rows: (payload.rows || []).filter((row) => /^\d{1,20}$/.test(String(row.game_id || ""))),
  };
}

export function mergeBasketballScheduleClocks(
  games: BBGame[],
  rows: ScheduleClockRow[],
) {
  const byGame = new Map(rows.map((row) => [row.game_id, row]));
  return games.map((game) => {
    const clock = byGame.get(game.id);
    return clock
      ? {
          ...game,
          source_start: clock.source_start || null,
          source_time_valid: clock.source_time_valid === true,
          source_observed_at: clock.observed_at || null,
        }
      : game;
  });
}
