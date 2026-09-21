"use client";

import { useEffect, useMemo, useState } from "react";
import {
  filterWomensMatchups,
  mergeWomensMatchups,
  pageWomensMatchups,
  sortWomensMatchups,
  type WomensForecastRow,
  type WomensMatchupCoverage,
  type WomensMatchupSort,
  type WomensScheduleRow,
} from "../_lib/womens-matchups";
import {
  WOMENS_FORECAST_API_HREF,
  WOMENS_FORECAST_READINESS_HREF,
} from "../_lib/womens-forecast-links";
import { WOMENS_SOURCE_SCOPE_LABEL, WOMENS_SOURCE_SCOPE_NOTE } from "../_lib/womens-source-scope";

type Edition = { season: number; generated_at: string; upcoming?: WomensScheduleRow[] };
type ForecastEdition = {
  model_id: string;
  generated_at: string;
  validation?: { games: number; margin_mae: number; win_accuracy: number; brier_score: number; interval_coverage?: number };
  calibration?: { interval_target?: number };
  market_comparison?: { qualified_line_rows?: number; forecast_rows?: number; note?: string };
  forecasts: WomensForecastRow[];
};

const date = (value?: string | null) => value
  ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value))
  : "Date unavailable";
const number = (value: number | null | undefined, digits = 1) => typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "—";
const pct = (value: number | null | undefined) => typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "—";

export default function WomensBasketballGames() {
  const [edition, setEdition] = useState<Edition | null>(null);
  const [forecast, setForecast] = useState<ForecastEdition | null>(null);
  const [query, setQuery] = useState("");
  const [month, setMonth] = useState("all");
  const [coverage, setCoverage] = useState<WomensMatchupCoverage>("all");
  const [sort, setSort] = useState<WomensMatchupSort>("date");
  const [page, setPage] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch("/data/basketball/womens-edition.json", { signal: controller.signal }).then((response) => response.ok ? response.json() : null),
      fetch("/data/basketball/womens-forecast.json", { signal: controller.signal }).then((response) => response.ok ? response.json() : null),
    ]).then(([editionValue, forecastValue]) => {
      if (!controller.signal.aborted) {
        setEdition(editionValue as Edition | null);
        setForecast(forecastValue as ForecastEdition | null);
      }
    }).catch((reason: unknown) => {
      if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) {
        setEdition(null);
        setForecast(null);
      }
    });
    return () => controller.abort();
  }, []);

  const months = useMemo(() => [...new Set((forecast?.forecasts || []).map((row) => String(row.date || "").slice(0, 7)).filter(Boolean))].sort(), [forecast]);
  const rows = useMemo(() => sortWomensMatchups(filterWomensMatchups(mergeWomensMatchups(forecast?.forecasts || [], edition?.upcoming || []), { query, month, coverage }), sort), [coverage, edition, forecast, month, query, sort]);
  const visible = useMemo(() => pageWomensMatchups(rows, page), [page, rows]);
  useEffect(() => setPage(0), [coverage, month, query, sort]);

  return <section className="field-card womens-matchup-board" aria-labelledby="womens-matchup-title">
    <div className="eyebrow">WOMEN&apos;S BASKETBALL · {WOMENS_SOURCE_SCOPE_LABEL} · 2026–27</div>
    <h2 id="womens-matchup-title">The full forecast slate</h2>
    <p className="muted">Every retained women&apos;s source-native forecast row is searchable here. Exact game IDs keep schedule context attached; primary and cold-start estimates stay visibly separate. {WOMENS_SOURCE_SCOPE_NOTE}</p>
    <div className="hero-actions" aria-label="Women&apos;s forecast resources">
      <a className="button" href={WOMENS_FORECAST_API_HREF}>Download women&apos;s forecast JSON ↗</a>
      <a className="hero-link" href={WOMENS_FORECAST_READINESS_HREF}>Open model readiness →</a>
    </div>
    {!forecast ? <p className="muted">Loading the women&apos;s forecast slate…</p> : <>
      <div className="strip"><div><strong>{forecast.forecasts.length.toLocaleString()}</strong><span>forecast rows</span></div><div><strong>{rows.length.toLocaleString()}</strong><span>matching filters</span></div><div><strong>{forecast.forecasts.filter((row) => row.prediction?.estimate_type !== "cold_start").length.toLocaleString()}</strong><span>primary rows</span></div><div><strong>{forecast.forecasts.filter((row) => row.prediction?.estimate_type === "cold_start").length.toLocaleString()}</strong><span>cold-start rows</span></div></div>
      <div className="toolbar">
        <label className="control"><span>TEAM</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search team or game ID" /></label>
        <label className="control"><span>MONTH</span><select value={month} onChange={(event) => setMonth(event.target.value)}><option value="all">All months</option>{months.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className="control"><span>MODEL COVERAGE</span><select value={coverage} onChange={(event) => setCoverage(event.target.value as WomensMatchupCoverage)}><option value="all">All estimates</option><option value="primary">Primary model</option><option value="cold-start">Cold-start</option><option value="unavailable">No estimate</option></select></label>
        <label className="control"><span>SORT BY</span><select value={sort} onChange={(event) => setSort(event.target.value as WomensMatchupSort)}><option value="date">Date</option><option value="confidence">Strongest signal</option><option value="uncertainty">Widest range</option><option value="margin">Largest margin</option></select></label>
      </div>
      {forecast.validation ? <p className="note">Model {forecast.model_id} · held-out validation {forecast.validation.games.toLocaleString()} games · {pct(forecast.validation.win_accuracy)} winner accuracy · {number(forecast.validation.margin_mae)} point margin MAE · {forecast.validation.interval_coverage == null ? "range coverage unavailable" : `${pct(forecast.validation.interval_coverage)} range coverage`}.</p> : null}
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Date</th><th>Away</th><th>Home</th><th className="numeric">Home win</th><th className="numeric">Score A–H</th><th className="numeric">Margin</th><th className="numeric">Range</th><th>Type</th><th>Game ID</th></tr></thead><tbody>{visible.map((row) => { const p = row.prediction; return <tr key={row.game_id}><td>{date(row.date)}</td><td>{row.away || "—"}</td><td>{row.home || "—"}<small>{row.schedule?.venue || "Venue unavailable"}</small></td><td className="numeric">{pct(p?.home_win_probability)}</td><td className="numeric">{p ? `${number(p.predicted_away_score, 0)}–${number(p.predicted_home_score, 0)}` : "—"}</td><td className="numeric">{number(p?.predicted_margin)}</td><td className="numeric">{p?.margin_low == null || p?.margin_high == null ? "—" : `${number(p.margin_low)} to ${number(p.margin_high)}`}</td><td>{p?.estimate_type === "cold_start" ? "Cold-start" : p ? "Primary" : "Unavailable"}</td><td><code>{row.game_id}</code></td></tr>; })}</tbody></table></div>
      {!visible.length ? <p className="empty">No women&apos;s games match these filters.</p> : null}
      <div className="pagination"><span>Page {page + 1} of {Math.max(1, Math.ceil(rows.length / 25))}</span><div><button className="button secondary" type="button" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>← Previous</button><button className="button secondary" type="button" disabled={(page + 1) * 25 >= rows.length} onClick={() => setPage((value) => value + 1)}>Next →</button></div></div>
      {forecast.market_comparison ? <p className="note">Market comparison: {forecast.market_comparison.qualified_line_rows || 0} qualifying quotes across {forecast.market_comparison.forecast_rows || forecast.forecasts.length} forecast rows. {forecast.market_comparison.note || "No line or edge is inferred without an exact pre-tip observation."}</p> : null}
      <p className="muted">Forecasts are the retained women&apos;s-only model edition generated {date(forecast.generated_at)}. A displayed estimate is not a recommendation; missing market, schedule, roster, or availability fields remain unavailable.</p>
    </>}
  </section>;
}
