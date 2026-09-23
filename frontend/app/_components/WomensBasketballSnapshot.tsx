"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import WomensForecastReadiness from "./WomensForecastReadiness";
import WomensShotProfileCourt from "./WomensShotProfileCourt";
import { womensForecastLabels } from "../_lib/womens-forecast-display";
import {
  WOMENS_FORECAST_API_HREF,
  WOMENS_FORECAST_READINESS_HREF,
  WOMENS_FORECAST_SLATE_HREF,
} from "../_lib/womens-forecast-links";
import { WOMENS_SOURCE_SCOPE_LABEL, WOMENS_SOURCE_SCOPE_NOTE } from "../_lib/womens-source-scope";
import { womensSnapshotGameHref, womensSnapshotPlayerHref } from "../_lib/womens-snapshot-links";

type Leader = { player_id: string; name: string; team: string; position: string; value: number };
type Forecast = { game_id: string; date?: string; home?: string; away?: string; prediction: { home_win_probability: number; predicted_margin: number; margin_low?: number; margin_high?: number; predicted_home_score: number; predicted_away_score: number; estimate_type: string } };
type Edition = {
  season: number;
  observed_player_season: number;
  generated_at: string;
  model_status: string;
  coverage: {
    players: number;
    teams: number;
    upcoming_games: number;
    player_season_rows?: number;
    player_box_rows?: number;
    player_box_players?: number;
    player_box_games?: number;
    player_box_played_rows?: number;
    player_box_dnp_rows?: number;
    player_box_teams?: number;
  };
  leaders: Record<string, { label: string; rows: Leader[] }>;
  players: Array<{ player_id: string; name: string; team: string; position: string; stats: Record<string, number> }>;
  upcoming: Array<{ game_id: string; date?: string; home?: string; away?: string; venue?: string }>;
  limitations: string[];
  forecast?: { model_id: string; validation: { games: number; margin_mae: number; win_accuracy: number; brier_score: number; log_loss?: number; interval_games?: number; interval_coverage?: number }; calibration?: { games?: number; margin_half_width?: number; interval_target?: number }; market_comparison?: { status?: string; forecast_rows?: number; qualified_line_rows?: number; note?: string }; forecasts: Forecast[] };
};

const date = (value?: string) => value ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(value)) : "—";

type SnapshotCoverage = Pick<Edition["coverage"], "player_season_rows" | "player_box_rows" | "player_box_players" | "player_box_games" | "player_box_played_rows" | "player_box_dnp_rows" | "player_box_teams">;

/**
 * Keep coverage labels tied to explicit release counters. Undefined counters
 * stay unavailable so a partial edition cannot be presented as zero coverage.
 */
export function womensSnapshotCoverageRows(coverage: SnapshotCoverage) {
  return [
    { key: "player_season_rows", label: "Player-season rows", value: coverage.player_season_rows, detail: "published season aggregates" },
    { key: "player_box_players", label: "Unique box players", value: coverage.player_box_players, detail: "exact athlete IDs" },
    { key: "player_box_rows", label: "Game box rows", value: coverage.player_box_rows, detail: "retained source records" },
    { key: "player_box_games", label: "Games with boxes", value: coverage.player_box_games, detail: "game IDs represented" },
    { key: "player_box_played_rows", label: "Played rows", value: coverage.player_box_played_rows, detail: "numeric production rows" },
    { key: "player_box_dnp_rows", label: "DNP rows", value: coverage.player_box_dnp_rows, detail: "retained unavailable appearances" },
    { key: "player_box_teams", label: "Box-score teams", value: coverage.player_box_teams, detail: "source team IDs" },
  ] as const;
}

export default function WomensBasketballSnapshot() {
  const [edition, setEdition] = useState<Edition | null>(null);
  useEffect(() => {
    Promise.all([
      fetch("/data/basketball/womens-edition.json").then((response) => response.ok ? response.json() : null),
      fetch("/data/basketball/womens-forecast.json").then((response) => response.ok ? response.json() : null),
    ]).then(([observed, forecast]) => setEdition(observed ? { ...observed, forecast } : null)).catch(() => setEdition(null));
  }, []);
  if (!edition) return <p className="muted">Loading the women&apos;s source-native edition…</p>;
  return <div className="scope-snapshot">
    <div className="scope-snapshot-head">
      <div><span className="eyebrow">WOMEN&apos;S DATA + MODEL · {WOMENS_SOURCE_SCOPE_LABEL}</span><h2>Women&apos;s basketball · source-native edition</h2><p>Player production from the 2026 season, 2027 roster and schedule context, and a separate Silvermine model for each upcoming game. {WOMENS_SOURCE_SCOPE_NOTE}</p></div>
      <div className="scope-snapshot-counts"><strong>{edition.coverage.players.toLocaleString()}</strong><span>players</span><strong>{edition.coverage.teams.toLocaleString()}</strong><span>teams</span><strong>{edition.coverage.upcoming_games}</strong><span>upcoming</span></div>
    </div>
      <div className="hero-actions" aria-label="Women&apos;s basketball model resources">
      <a className="button" href={WOMENS_FORECAST_SLATE_HREF}>Open women&apos;s forecast slate ↗</a>
      <a className="hero-link" href={WOMENS_FORECAST_READINESS_HREF}>Model readiness →</a>
        <a className="hero-link" href={WOMENS_FORECAST_API_HREF}>Forecast JSON ↗</a>
      </div>
    <section className="field-card" aria-labelledby="womens-player-coverage-title">
      <div className="section-heading">
        <div><div className="eyebrow">EXACT-ID PLAYER ARCHIVE · {edition.observed_player_season}</div><h2 id="womens-player-coverage-title">See the player-stat coverage.</h2></div>
        <div className="button-row"><Link className="hero-link" href="/basketball/players/?gender=women&division=1">Open all player rows →</Link><Link className="hero-link" href="/basketball/rankings/?gender=women&division=1">Open player rankings →</Link></div>
      </div>
      <p className="note">The compact table below is a sample of the season aggregate release. The exact-ID game archive retains every observed appearance, including DNP rows; missing or unobserved values stay unavailable.</p>
      <div className="strip" aria-label="Women&apos;s basketball player archive coverage">
        {womensSnapshotCoverageRows(edition.coverage).map((item) => <div key={item.key}><strong>{item.value == null ? "—" : item.value.toLocaleString()}</strong><span>{item.label}</span><small>{item.detail}</small></div>)}
      </div>
    </section>
    <div className="scope-snapshot-grid">
      {Object.entries(edition.leaders).map(([key, group]) => <section className="field-card" key={key}><div className="eyebrow">{group.label}</div><table className="data-table"><thead><tr><th>Player</th><th>Team</th><th className="numeric">Value</th></tr></thead><tbody>{group.rows.slice(0, 8).map((row) => <tr key={`${key}-${row.player_id}`}><th scope="row"><Link href={womensSnapshotPlayerHref(row.player_id)}>{row.name}</Link><small>Open exact player file →</small></th><td>{row.team}</td><td className="numeric">{row.value.toFixed(1)}</td></tr>)}</tbody></table></section>)}
    </div>
    <section className="field-card"><div className="section-heading"><div><div className="eyebrow">PLAYER TABLE · 2026 OBSERVED PRODUCTION</div><h2>Start with the recorded stat line.</h2></div><Link href="/basketball/players/?gender=women&division=1">View all women&apos;s players →</Link></div><table className="data-table"><thead><tr><th>Player</th><th>Team</th><th className="numeric">PPG</th><th className="numeric">RPG</th><th className="numeric">APG</th></tr></thead><tbody>{edition.players.slice(0, 20).map((row) => <tr key={`player-${row.player_id}`}><th scope="row"><Link href={womensSnapshotPlayerHref(row.player_id)}>{row.name}</Link><small>Exact athlete ID · open production file →</small></th><td>{row.team}</td><td className="numeric">{row.stats.avgPoints?.toFixed(1) || "—"}</td><td className="numeric">{row.stats.avgRebounds?.toFixed(1) || "—"}</td><td className="numeric">{row.stats.avgAssists?.toFixed(1) || "—"}</td></tr>)}</tbody></table></section>
    <WomensShotProfileCourt />
    {edition.forecast ? <section className="field-card"><div className="section-heading"><div><div className="eyebrow">UPCOMING MODEL FORECASTS · {edition.forecast.model_id}</div><h2>Predictions with a path to the full readout.</h2></div><Link href={WOMENS_FORECAST_SLATE_HREF}>View full forecast slate →</Link></div><p className="muted">Held-out 2026 validation: {edition.forecast.validation.games.toLocaleString()} games · {Math.round(edition.forecast.validation.win_accuracy * 100)}% win accuracy · {edition.forecast.validation.margin_mae.toFixed(1)} point margin MAE · Brier {edition.forecast.validation.brier_score.toFixed(3)}{edition.forecast.validation.log_loss == null ? "" : ` · log loss ${edition.forecast.validation.log_loss.toFixed(3)}`}{edition.forecast.validation.interval_coverage == null ? "" : ` · ${Math.round((edition.forecast.calibration?.interval_target || 0.8) * 100)}% range coverage ${(edition.forecast.validation.interval_coverage * 100).toFixed(1)}%`}{edition.forecast.calibration?.games == null ? "" : ` · calibrated on ${edition.forecast.calibration.games.toLocaleString()} games`}.</p><table className="data-table"><thead><tr><th>Date</th><th>Away</th><th>Home</th><th className="numeric">Home win</th><th className="numeric">Margin</th><th className="numeric">Range</th><th className="numeric">Score · A–H</th><th>Type</th><th>Game</th></tr></thead><tbody>{edition.forecast.forecasts.slice(0, 12).map((game) => { const labels = womensForecastLabels(game.prediction); return <tr key={`forecast-${game.game_id}`}><td>{date(game.date)}</td><td>{game.away || "—"}</td><td>{game.home || "—"}</td><td className="numeric">{labels.homeWin}</td><td className="numeric">{labels.margin}</td><td className="numeric">{labels.range || "—"}<small>nominal model range</small></td><td className="numeric">{labels.score}</td><td>{labels.estimate}</td><td><Link href={womensSnapshotGameHref(game.game_id)}><code>{game.game_id}</code></Link><small>Open exact analysis →</small></td></tr>; })}</tbody></table>{edition.forecast.market_comparison ? <p className="note" role="status"><strong>Line comparison:</strong> {edition.forecast.market_comparison.qualified_line_rows || 0} qualified quotes for {edition.forecast.market_comparison.forecast_rows || edition.forecast.forecasts.length} forecast rows. {edition.forecast.market_comparison.note || "Comparisons require an exact game ID and a pre-tip capture clock."} <Link href="/research/scorecard/?sport=basketball&gender=women&division=1">Open the market evidence ledger →</Link></p> : null}</section> : null}
    <section className="field-card"><div className="section-heading"><div><div className="eyebrow">UPCOMING GAMES</div><h2>Schedule context</h2></div><Link href={WOMENS_FORECAST_SLATE_HREF}>Open the full matchup desk →</Link></div><table className="data-table"><thead><tr><th>Date</th><th>Away</th><th>Home</th><th>Venue</th><th>Analysis</th></tr></thead><tbody>{edition.upcoming.slice(0, 10).map((game) => { const hasForecast = Boolean(edition.forecast?.forecasts.some((forecast) => forecast.game_id === game.game_id)); return <tr key={game.game_id}><td>{date(game.date)}</td><td>{game.away || "—"}</td><td>{game.home || "—"}</td><td>{game.venue || "—"}</td><td><Link href={hasForecast ? womensSnapshotGameHref(game.game_id) : WOMENS_FORECAST_SLATE_HREF}>{hasForecast ? "Open model analysis →" : "Open matchup desk →"}</Link></td></tr>; })}</tbody></table></section>
    <WomensForecastReadiness />
    <p className="muted">Observed edition generated {date(edition.generated_at)}. {edition.limitations[1]}</p>
  </div>;
}
