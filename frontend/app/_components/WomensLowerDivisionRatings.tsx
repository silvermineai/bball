"use client";

import { useEffect, useMemo, useState } from "react";

type Readiness = { key: string; status: string; detail: string };
type Rating = {
  rank: number;
  team_id: string;
  team: string;
  conference?: string | null;
  games: number;
  wins: number;
  losses: number;
  win_pct: number;
  avg_margin: number;
  rating: number;
};
type DivisionRatings = {
  model_id: string;
  model_status: string;
  forecast_status: string;
  method: string;
  coverage: { source_contests: number; valid_final_games: number; teams: number; source_receipts: number; excluded?: Record<string, number> };
  fit: { ridge: number; home_advantage: number; training_games: number; training_season: number };
  backtest: { status: string; evaluated_games?: number; margin_mae?: number; winner_accuracy?: number; holdout_start?: string; holdout_end?: string; reason?: string };
  ratings: Rating[];
  target_schedule: { status: string; games: number; note: string };
  source: { schedule_asset_sha256?: string | null; receipt_count: number; receipt_digest: string };
  readiness: Readiness[];
  limitations: string[];
};
type RatingsAsset = { target_season: number; generated_at: string; model_status: string; forecast_status: string; divisions: Record<string, DivisionRatings> };

const formatDate = (value?: string) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-US", { timeZone: "UTC" });
};

export default function WomensLowerDivisionRatings({ division }: { division: "2" | "3" }) {
  const [asset, setAsset] = useState<RatingsAsset | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    fetch("/data/basketball/womens-lower-division-ratings.json")
      .then((response) => response.ok ? response.json() as Promise<RatingsAsset> : Promise.reject(new Error("unavailable")))
      .then((value) => { if (active) setAsset(value); })
      .catch(() => { if (active) setError("The lower-division ratings evidence could not be read."); });
    return () => { active = false; };
  }, []);

  const current = asset?.divisions[`d${division}`];
  const topRatings = useMemo(() => current?.ratings.slice(0, 25) || [], [current]);
  if (error) return <div className="paper-panel" style={{ marginTop: 18 }}><p className="status-error">{error}</p></div>;
  if (!current) return <div className="paper-panel" style={{ marginTop: 18 }}><p className="muted">Loading the exact-division ratings evidence…</p></div>;
  const backtest = current.backtest;
  const blocked = current.target_schedule.status !== "ready" || current.forecast_status !== "published";
  return <div className="paper-panel" style={{ marginTop: 18 }} aria-label={`Women’s D${division} ratings readiness`}>
    <div className="eyebrow">RESEARCH RATINGS · WOMEN&apos;S D{division}</div>
    <h3>{blocked ? "Historical strength board; future forecast gate remains closed" : "Women’s D" + division + " forecast"}</h3>
    <p className="note">{current.method} These ratings use only the exact NCAA division and source-local team slugs. They do not create a 2026–27 prediction.</p>
    <div className="scope-snapshot-counts">
      <strong>{current.coverage.valid_final_games.toLocaleString()}</strong><span>validated finals</span>
      <strong>{current.coverage.teams.toLocaleString()}</strong><span>source teams</span>
      <strong>{current.coverage.source_receipts.toLocaleString()}</strong><span>response receipts</span>
    </div>
    <div className="table-scroll" style={{ marginTop: 16 }}><table className="data-table"><thead><tr><th>Gate</th><th>Status</th><th>Evidence</th></tr></thead><tbody>
      {current.readiness.map((check) => <tr key={check.key}><th scope="row">{check.key.replaceAll("_", " ")}</th><td><span className={`readiness-state readiness-state-${check.status === "ready" || check.status === "retrospective_only" ? "ready" : "missing"}`}>{check.status === "retrospective_only" ? "Retrospective only" : check.status === "ready" ? "Ready" : "Blocked"}</span></td><td>{check.detail}</td></tr>)}
    </tbody></table></div>
    <p className="muted">Backtest: {backtest.status === "retrospective_only" ? `${backtest.evaluated_games?.toLocaleString() || 0} holdout games · ${((backtest.winner_accuracy || 0) * 100).toFixed(1)}% winner accuracy · ${backtest.margin_mae?.toFixed(2) || "—"} point margin MAE · ${formatDate(backtest.holdout_start)}–${formatDate(backtest.holdout_end)}` : backtest.reason || "Unavailable"}. Target-season schedule: {current.target_schedule.status}; forecasts: {current.forecast_status}.</p>
    <div className="section-heading" style={{ marginTop: 18 }}><div><div className="eyebrow">SOURCE-LOCAL TEAM RATINGS · 2025 SEASON</div><h4>Top 25 by regularized margin rating</h4></div></div>
    <p className="note">Rankings are a descriptive historical board. The fitted home-court term was {current.fit.home_advantage.toFixed(2)} points; this table is not a claim about future roster strength.</p>
    <div className="table-scroll"><table className="data-table"><thead><tr><th>Rank</th><th>Team</th><th className="numeric">GP</th><th className="numeric">W–L</th><th className="numeric">Win %</th><th className="numeric">Avg margin</th><th className="numeric">Rating</th></tr></thead><tbody>{topRatings.map((row) => <tr key={row.team_id}><td className="rank-number">{row.rank}</td><th scope="row">{row.team}<small>{row.team_id}{row.conference ? ` · ${row.conference}` : ""}</small></th><td className="numeric">{row.games}</td><td className="numeric"><strong>{row.wins}–{row.losses}</strong></td><td className="numeric">{(row.win_pct * 100).toFixed(1)}%</td><td className="numeric">{row.avg_margin.toFixed(1)}</td><td className="numeric">{row.rating.toFixed(1)}</td></tr>)}</tbody></table></div>
    <details style={{ marginTop: 14 }}><summary>Show source and model limits</summary><p className="note">Schedule asset SHA-256: <code>{current.source.schedule_asset_sha256 || "—"}</code><br />Receipt digest: <code>{current.source.receipt_digest}</code><br />{current.target_schedule.note}</p><ul className="plain-list">{current.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul></details>
  </div>;
}
