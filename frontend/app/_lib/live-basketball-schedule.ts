import type { BBGame } from "./basketball-types";
import { fetchWithTransientRetry } from "./live-basketball-forecasts";

export type ScheduleClockRow = {
  game_id: string;
  source_start?: string | null;
  source_time_valid?: boolean;
  observed_at?: string | null;
};

export type ScheduleClockResponse = {
  rows?: ScheduleClockRow[];
  total?: number;
  page_size?: number;
  confirmed?: number | boolean;
  confirmed_count?: number;
};

/**
 * A canonical scheduled timestamp is not source-clock evidence. Keep this
 * predicate strict so readiness boards do not count a game until an observed
 * source start is explicitly marked valid and contains a real timestamp.
 */
export function hasConfirmedScheduleClock(
  row: { source_start?: string | null; source_time_valid?: boolean | null } | null | undefined,
) {
  return row?.source_time_valid === true
    && typeof row.source_start === "string"
    && Number.isFinite(Date.parse(row.source_start));
}

export async function loadLiveBasketballScheduleClocks(
  signal?: AbortSignal,
  season = 2027,
): Promise<ScheduleClockResponse> {
  const response = await fetchWithTransientRetry(
    `/api/basketball/research/schedule-times?season=${season}&limit=200`,
    signal,
  );
  if (!response.ok) throw new Error("Live schedule-clock evidence unavailable.");
  const payload = await response.json() as ScheduleClockResponse;
  const total = Number.isFinite(payload.total) ? Math.max(0, Math.floor(payload.total as number)) : null;
  const pageSize = Number.isFinite(payload.page_size) && (payload.page_size as number) > 0
    ? Math.floor(payload.page_size as number)
    : Math.max((payload.rows || []).length, 200);
  const pageCount = total == null ? 1 : Math.ceil(total / pageSize);
  if (pageCount > 1000) throw new Error("Live schedule-clock archive is too large to load safely.");
  const additional = await Promise.all(
    Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) =>
      fetchWithTransientRetry(
        `/api/basketball/research/schedule-times?season=${season}&limit=200&page=${index + 1}`,
        signal,
      ).then(async (pageResponse) => {
        if (!pageResponse.ok) throw new Error("Live schedule-clock evidence unavailable.");
        const page = await pageResponse.json() as ScheduleClockResponse;
        if (total != null && page.total != null && page.total !== total) {
          throw new Error("Live schedule-clock archive changed while it was loading.");
        }
        return page;
      }),
    ),
  );
  const rows = [payload, ...additional].flatMap((page) => page.rows || []);
  if (total != null && rows.length < total) {
    throw new Error("Live schedule-clock archive returned an incomplete page set.");
  }
  return {
    ...payload,
    rows: rows.filter((row) => /^\d{1,20}$/.test(String(row.game_id || ""))),
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
