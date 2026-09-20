"use client";

import { useEffect, useState } from "react";

type Leader = { player_id: string; name: string; team: string; position: string; value: number };
type Edition = {
  season: number;
  observed_player_season: number;
  generated_at: string;
  model_status: string;
  coverage: { players: number; teams: number; upcoming_games: number };
  leaders: Record<string, { label: string; rows: Leader[] }>;
  upcoming: Array<{ game_id: string; date?: string; home?: string; away?: string; venue?: string }>;
  limitations: string[];
};

const date = (value?: string) => value ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(value)) : "—";

export default function WomensBasketballSnapshot() {
  const [edition, setEdition] = useState<Edition | null>(null);
  useEffect(() => {
    fetch("/data/basketball/womens-edition.json").then((response) => response.ok ? response.json() : null).then(setEdition).catch(() => setEdition(null));
  }, []);
  if (!edition) return <p className="muted">Loading the women&apos;s source-native edition…</p>;
  return <div className="scope-snapshot">
    <div className="scope-snapshot-head">
      <div><span className="eyebrow">OBSERVED WOMEN&apos;S DATA</span><h2>Women&apos;s basketball · D1</h2><p>Player production from the 2026 season and the 2027 schedule and roster context. The women&apos;s forecast model is intentionally not published until it passes its own checks.</p></div>
      <div className="scope-snapshot-counts"><strong>{edition.coverage.players.toLocaleString()}</strong><span>players</span><strong>{edition.coverage.teams.toLocaleString()}</strong><span>teams</span><strong>{edition.coverage.upcoming_games}</strong><span>upcoming</span></div>
    </div>
    <div className="scope-snapshot-grid">
      {Object.entries(edition.leaders).map(([key, group]) => <section className="field-card" key={key}><div className="eyebrow">{group.label}</div><table className="data-table"><thead><tr><th>Player</th><th>Team</th><th className="numeric">Value</th></tr></thead><tbody>{group.rows.slice(0, 8).map((row) => <tr key={`${key}-${row.player_id}`}><td>{row.name}</td><td>{row.team}</td><td className="numeric">{row.value.toFixed(1)}</td></tr>)}</tbody></table></section>)}
    </div>
    <section className="field-card"><div className="eyebrow">UPCOMING GAMES</div><table className="data-table"><thead><tr><th>Date</th><th>Away</th><th>Home</th><th>Venue</th></tr></thead><tbody>{edition.upcoming.slice(0, 10).map((game) => <tr key={game.game_id}><td>{date(game.date)}</td><td>{game.away || "—"}</td><td>{game.home || "—"}</td><td>{game.venue || "—"}</td></tr>)}</tbody></table></section>
    <p className="muted">Observed edition generated {date(edition.generated_at)}. {edition.limitations[1]}</p>
  </div>;
}
