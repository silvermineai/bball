export type WomensGamePrediction = {
  home_win_probability: number;
  away_win_probability?: number;
  predicted_margin: number;
  predicted_home_score: number;
  predicted_away_score: number;
  margin_low?: number | null;
  margin_high?: number | null;
  estimate_type?: string | null;
};

export type WomensForecastRow = {
  game_id: string;
  date?: string | null;
  home?: string | null;
  away?: string | null;
  home_id?: string | null;
  away_id?: string | null;
  prediction?: WomensGamePrediction | null;
};

export type WomensScheduleRow = {
  game_id: string;
  date?: string | null;
  home?: string | null;
  away?: string | null;
  venue?: string | null;
};

export type WomensMatchupRow = WomensForecastRow & {
  schedule?: WomensScheduleRow;
};

export type WomensMatchupCoverage = "all" | "primary" | "cold-start" | "unavailable";
export type WomensMatchupSort = "date" | "confidence" | "uncertainty" | "margin";

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

export function mergeWomensMatchups(
  forecasts: WomensForecastRow[],
  schedule: WomensScheduleRow[],
): WomensMatchupRow[] {
  const scheduleById = new Map(schedule.map((row) => [String(row.game_id), row]));
  return forecasts.map((row) => ({ ...row, schedule: scheduleById.get(String(row.game_id)) }));
}

export function filterWomensMatchups(
  rows: WomensMatchupRow[],
  options: { query?: string; month?: string; coverage?: WomensMatchupCoverage },
): WomensMatchupRow[] {
  const query = options.query?.trim().toLowerCase() || "";
  const month = options.month || "all";
  const coverage = options.coverage || "all";
  return rows.filter((row) => {
    const prediction = row.prediction;
    const estimateType = prediction?.estimate_type === "cold_start" ? "cold-start" : prediction ? "primary" : "unavailable";
    return (!query || `${row.away || ""} ${row.home || ""} ${row.game_id}`.toLowerCase().includes(query))
      && (month === "all" || String(row.date || "").startsWith(month))
      && (coverage === "all" || estimateType === coverage);
  });
}

export function sortWomensMatchups(rows: WomensMatchupRow[], sort: WomensMatchupSort): WomensMatchupRow[] {
  return [...rows].sort((left, right) => {
    const lp = left.prediction;
    const rp = right.prediction;
    if (sort === "confidence") {
      const lv = finite(lp?.home_win_probability) ? Math.max(lp!.home_win_probability, 1 - lp!.home_win_probability) : -Infinity;
      const rv = finite(rp?.home_win_probability) ? Math.max(rp!.home_win_probability, 1 - rp!.home_win_probability) : -Infinity;
      if (lv !== rv) return rv - lv;
    } else if (sort === "uncertainty") {
      const lv = finite(lp?.margin_low) && finite(lp?.margin_high) ? lp!.margin_high! - lp!.margin_low! : -Infinity;
      const rv = finite(rp?.margin_low) && finite(rp?.margin_high) ? rp!.margin_high! - rp!.margin_low! : -Infinity;
      if (lv !== rv) return rv - lv;
    } else if (sort === "margin") {
      const lv = finite(lp?.predicted_margin) ? Math.abs(lp!.predicted_margin) : -Infinity;
      const rv = finite(rp?.predicted_margin) ? Math.abs(rp!.predicted_margin) : -Infinity;
      if (lv !== rv) return rv - lv;
    }
    return String(left.date || "").localeCompare(String(right.date || "")) || String(left.game_id).localeCompare(String(right.game_id));
  });
}

export function pageWomensMatchups<T>(rows: T[], page: number, pageSize = 25): T[] {
  const safePage = Number.isInteger(page) && page >= 0 ? page : 0;
  return rows.slice(safePage * pageSize, safePage * pageSize + pageSize);
}
