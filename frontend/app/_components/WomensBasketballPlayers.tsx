"use client";

import { useEffect, useMemo, useState } from "react";

type Player = {
  player_id: string;
  name: string;
  team: string;
  position: string;
  stats: Record<string, number | null | undefined>;
};

type Edition = {
  season: number;
  observed_player_season: number;
  generated_at: string;
  coverage: { players: number };
  players: Player[];
};

const metrics = [
  ["avgPoints", "PPG"],
  ["avgRebounds", "RPG"],
  ["avgAssists", "APG"],
  ["avgMinutes", "MPG"],
  ["fieldGoalPct", "FG%"],
  ["threePointFieldGoalPct", "3P%"],
  ["freeThrowPct", "FT%"],
  ["avgSteals", "SPG"],
  ["avgBlocks", "BPG"],
  ["gamesPlayed", "Games"],
] as const;

const number = (value: number | null | undefined, digits = 1) =>
  typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "—";

const date = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "capture date unavailable" : parsed.toLocaleDateString("en-US", { timeZone: "UTC" });
};

export default function WomensBasketballPlayers() {
  const [edition, setEdition] = useState<Edition | null>(null);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState("all");
  const [minimumGames, setMinimumGames] = useState("0");
  const [metric, setMetric] = useState<(typeof metrics)[number][0]>("avgPoints");

  useEffect(() => {
    fetch("/data/basketball/womens-edition.json")
      .then((response) => response.ok ? response.json() : null)
      .then((value: Edition | null) => setEdition(value))
      .catch(() => setEdition(null));
  }, []);

  const positions = useMemo(() => Array.from(new Set((edition?.players || []).map((player) => player.position).filter(Boolean))).sort(), [edition]);
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const minGames = Number(minimumGames) || 0;
    return (edition?.players || [])
      .filter((player) => !needle || `${player.name} ${player.team} ${player.player_id}`.toLowerCase().includes(needle))
      .filter((player) => position === "all" || player.position === position)
      .filter((player) => Number(player.stats.gamesPlayed) >= minGames)
      .sort((left, right) => (Number(right.stats[metric]) || -Infinity) - (Number(left.stats[metric]) || -Infinity) || left.name.localeCompare(right.name))
      .slice(0, 100);
  }, [edition, metric, minimumGames, position, query]);

  return <section className="field-card wbb-player-card" aria-labelledby="wbb-players-title">
    <div className="eyebrow">WOMEN&apos;S PLAYER TABLE · D1</div>
    <h2 id="wbb-players-title">Browse observed player production</h2>
    <p className="muted">A searchable table of the retained player-season file. Values stay in their reported units; a missing value remains unavailable.</p>
    {!edition ? <p className="muted">Loading women&apos;s player table…</p> : <>
      <div className="wbb-player-controls">
        <label htmlFor="wbb-player-search">Search player or team</label>
        <input id="wbb-player-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, program, or player ID" />
        <label htmlFor="wbb-player-position">Position</label>
        <select id="wbb-player-position" value={position} onChange={(event) => setPosition(event.target.value)}>
          <option value="all">All positions</option>
          {positions.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <label htmlFor="wbb-player-min-games">Minimum games</label>
        <select id="wbb-player-min-games" value={minimumGames} onChange={(event) => setMinimumGames(event.target.value)}>
          <option value="0">Any recorded games</option>
          <option value="5">5+</option>
          <option value="10">10+</option>
        </select>
        <label htmlFor="wbb-player-metric">Sort by</label>
        <select id="wbb-player-metric" value={metric} onChange={(event) => setMetric(event.target.value as (typeof metrics)[number][0])}>
          {metrics.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </div>
      <p className="note">{edition.coverage.players.toLocaleString()} retained players · showing {rows.length} matching rows · observed season {edition.observed_player_season} · captured {date(edition.generated_at)}.</p>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Player</th><th>Team</th><th>Pos.</th><th className="numeric">GP</th><th className="numeric">PPG</th><th className="numeric">RPG</th><th className="numeric">APG</th><th className="numeric">MPG</th><th className="numeric">FG%</th><th className="numeric">3P%</th></tr></thead><tbody>{rows.map((player) => <tr key={player.player_id}><th scope="row">{player.name}<small>Player ID {player.player_id}</small></th><td>{player.team}</td><td>{player.position || "—"}</td><td className="numeric">{number(player.stats.gamesPlayed, 0)}</td><td className="numeric">{number(player.stats.avgPoints)}</td><td className="numeric">{number(player.stats.avgRebounds)}</td><td className="numeric">{number(player.stats.avgAssists)}</td><td className="numeric">{number(player.stats.avgMinutes)}</td><td className="numeric">{number(player.stats.fieldGoalPct)}</td><td className="numeric">{number(player.stats.threePointFieldGoalPct)}</td></tr>)}</tbody></table></div>
      {!rows.length ? <p className="empty">No retained players match these filters.</p> : null}
      <p className="muted">This table is an observed production file and does not infer eligibility, role, or future performance.</p>
    </>}
  </section>;
}
