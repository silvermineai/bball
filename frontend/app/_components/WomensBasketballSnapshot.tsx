"use client";

import { useEffect, useState } from "react";
import WomensForecastReadiness from "./WomensForecastReadiness";
import WomensShotProfileCourt from "./WomensShotProfileCourt";

type Leader = { player_id: string; name: string; team: string; position: string; value: number };
type Forecast = { game_id: string; date?: string; home?: string; away?: string; prediction: { home_win_probability: number; predicted_margin: number; estimate_type: string } };
type Edition = {
  season: number;
  observed_player_season: number;
  generated_at: string;
  model_status: string;
  coverage: { players: number; teams: number; upcoming_games: number };
  leaders: Record<string, { label: string; rows: Leader[] }>;
  players: Array<{ player_id: string; name: string; team: string; position: string; stats: Record<string, number> }>;
  upcoming: Array<{ game_id: string; date?: string; home?: string; away?: string; venue?: string }>;
  limitations: string[];
  forecast?: { model_id: string; validation: { games: number; margin_mae: number; win_accuracy: number; brier_score: number }; forecasts: Forecast[] };
};

const date = (value?: string) => value ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(value)) : "—";

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
      <div><span className="eyebrow">WOMEN&apos;S DATA + MODEL</span><h2>Women&apos;s basketball · D1</h2><p>Player production from the 2026 season, 2027 roster and schedule context, and a separate Silvermine model for each upcoming game.</p></div>
      <div className="scope-snapshot-counts"><strong>{edition.coverage.players.toLocaleString()}</strong><span>players</span><strong>{edition.coverage.teams.toLocaleString()}</strong><span>teams</span><strong>{edition.coverage.upcoming_games}</strong><span>upcoming</span></div>
    </div>
    <div className="scope-snapshot-grid">
      {Object.entries(edition.leaders).map(([key, group]) => <section className="field-card" key={key}><div className="eyebrow">{group.label}</div><table className="data-table"><thead><tr><th>Player</th><th>Team</th><th className="numeric">Value</th></tr></thead><tbody>{group.rows.slice(0, 8).map((row) => <tr key={`${key}-${row.player_id}`}><td>{row.name}</td><td>{row.team}</td><td className="numeric">{row.value.toFixed(1)}</td></tr>)}</tbody></table></section>)}
    </div>
    <section className="field-card"><div className="eyebrow">PLAYER TABLE · 2026 OBSERVED PRODUCTION</div><table className="data-table"><thead><tr><th>Player</th><th>Team</th><th className="numeric">PPG</th><th className="numeric">RPG</th><th className="numeric">APG</th></tr></thead><tbody>{edition.players.slice(0, 20).map((row) => <tr key={`player-${row.player_id}`}><td>{row.name}</td><td>{row.team}</td><td className="numeric">{row.stats.avgPoints?.toFixed(1) || "—"}</td><td className="numeric">{row.stats.avgRebounds?.toFixed(1) || "—"}</td><td className="numeric">{row.stats.avgAssists?.toFixed(1) || "—"}</td></tr>)}</tbody></table></section>
    <WomensShotProfileCourt />
    {edition.forecast ? <section className="field-card"><div className="eyebrow">UPCOMING MODEL FORECASTS · {edition.forecast.model_id}</div><p className="muted">Held-out 2026 validation: {edition.forecast.validation.games.toLocaleString()} games · {Math.round(edition.forecast.validation.win_accuracy * 100)}% win accuracy · {edition.forecast.validation.margin_mae.toFixed(1)} point margin MAE.</p><table className="data-table"><thead><tr><th>Date</th><th>Away</th><th>Home</th><th className="numeric">Home win</th><th>Type</th></tr></thead><tbody>{edition.forecast.forecasts.slice(0, 12).map((game) => <tr key={`forecast-${game.game_id}`}><td>{date(game.date)}</td><td>{game.away || "—"}</td><td>{game.home || "—"}</td><td className="numeric">{Math.round(game.prediction.home_win_probability * 100)}%</td><td>{game.prediction.estimate_type === "primary" ? "Primary" : "Cold start"}</td></tr>)}</tbody></table></section> : null}
    <section className="field-card"><div className="eyebrow">UPCOMING GAMES</div><table className="data-table"><thead><tr><th>Date</th><th>Away</th><th>Home</th><th>Venue</th></tr></thead><tbody>{edition.upcoming.slice(0, 10).map((game) => <tr key={game.game_id}><td>{date(game.date)}</td><td>{game.away || "—"}</td><td>{game.home || "—"}</td><td>{game.venue || "—"}</td></tr>)}</tbody></table></section>
    <WomensForecastReadiness />
    <p className="muted">Observed edition generated {date(edition.generated_at)}. {edition.limitations[1]}</p>
  </div>;
}
