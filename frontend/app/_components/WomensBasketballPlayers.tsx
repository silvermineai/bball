"use client";

import { useEffect, useMemo, useState } from "react";
import {
  formatWomensPlayerStat,
  unlistedWomensPlayerFields,
  womensPlayerDetailCount,
  womensPlayerDetailGroups,
  womensPlayerFieldLabel,
  paginateWomensPlayerRows,
  type WomensPlayerStats,
} from "../_lib/womens-player-detail";
import { WOMENS_SOURCE_SCOPE_LABEL, WOMENS_SOURCE_SCOPE_NOTE } from "../_lib/womens-source-scope";

type Player = {
  player_id: string;
  name: string;
  team: string;
  position: string;
  stats: WomensPlayerStats;
};

type BoxPlayer = {
  player_id: string;
  name: string;
  team: string;
  position: string;
  box_rows: number;
  dnp_rows: number;
  games_played: number;
  starts: number;
  totals: Record<string, number>;
  per_game: Record<string, number>;
  shooting: {
    field_goal_pct: number | null;
    three_point_pct: number | null;
    free_throw_pct: number | null;
  };
};

type DisplayPlayer = Player & { source: "season" | "box"; box?: BoxPlayer };

type Edition = {
  season: number;
  observed_player_season: number;
  generated_at: string;
  coverage: { players: number };
  players: Player[];
};

type BoxEdition = {
  season: number;
  generated_at: string;
  coverage: {
    players: number;
    rows: number;
    games: number;
    played_rows: number;
    dnp_rows: number;
    teams: number;
    source_fields?: Array<{ field: string; observed_rows: number; finite_numeric_rows: number }>;
  };
  players: BoxPlayer[];
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
  const [boxEdition, setBoxEdition] = useState<BoxEdition | null>(null);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState("all");
  const [minimumGames, setMinimumGames] = useState("0");
  const [metric, setMetric] = useState<(typeof metrics)[number][0]>("avgPoints");
  const [page, setPage] = useState(0);
  const pageSize = 100;

  useEffect(() => {
    const initialQuery = new URLSearchParams(window.location.search).get("q");
    if (initialQuery) setQuery(initialQuery);
    Promise.all([
      fetch("/data/basketball/womens-edition.json"),
      fetch("/data/basketball/womens-box-player-stats.json"),
    ])
      .then(async ([editionResponse, boxResponse]) => [
        editionResponse.ok ? await editionResponse.json() as Edition : null,
        boxResponse.ok ? await boxResponse.json() as BoxEdition : null,
      ] as const)
      .then(([editionValue, boxValue]) => {
        setEdition(editionValue);
        setBoxEdition(boxValue);
      })
      .catch(() => setEdition(null));
  }, []);

  const displayPlayers = useMemo<DisplayPlayer[]>(() => {
    const seasonPlayers: DisplayPlayer[] = (edition?.players || []).map((player) => ({ ...player, source: "season" }));
    const knownIds = new Set(seasonPlayers.map((player) => player.player_id));
    const boxOnlyPlayers: DisplayPlayer[] = (boxEdition?.players || [])
      .filter((player) => !knownIds.has(player.player_id))
      .map((player) => ({
        player_id: player.player_id,
        name: player.name,
        team: player.team,
        position: player.position,
        source: "box",
        box: player,
        stats: {
          gamesPlayed: player.games_played,
          gamesStarted: player.starts,
          avgMinutes: player.per_game.minutes,
          avgPoints: player.per_game.points,
          avgRebounds: player.per_game.rebounds,
          avgOffensiveRebounds: player.per_game.offensive_rebounds,
          avgDefensiveRebounds: player.per_game.defensive_rebounds,
          avgAssists: player.per_game.assists,
          avgSteals: player.per_game.steals,
          avgBlocks: player.per_game.blocks,
          avgTurnovers: player.per_game.turnovers,
          avgFouls: player.per_game.fouls,
          points: player.totals.points,
          totalRebounds: player.totals.rebounds,
          offensiveRebounds: player.totals.offensive_rebounds,
          defensiveRebounds: player.totals.defensive_rebounds,
          assists: player.totals.assists,
          steals: player.totals.steals,
          blocks: player.totals.blocks,
          turnovers: player.totals.turnovers,
          fouls: player.totals.fouls,
          fieldGoalPct: player.shooting.field_goal_pct,
          threePointFieldGoalPct: player.shooting.three_point_pct,
          freeThrowPct: player.shooting.free_throw_pct,
        },
      }));
    return [...seasonPlayers, ...boxOnlyPlayers];
  }, [boxEdition, edition]);

  const positions = useMemo(() => Array.from(new Set(displayPlayers.map((player) => player.position).filter(Boolean))).sort(), [displayPlayers]);
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const minGames = Number(minimumGames) || 0;
    return displayPlayers
      .filter((player) => !needle || `${player.name} ${player.team} ${player.player_id}`.toLowerCase().includes(needle))
      .filter((player) => position === "all" || player.position === position)
      .filter((player) => Number(player.stats.gamesPlayed) >= minGames)
      .sort((left, right) => (Number(right.stats[metric]) || -Infinity) - (Number(left.stats[metric]) || -Infinity) || left.name.localeCompare(right.name));
  }, [displayPlayers, metric, minimumGames, position, query]);
  const visibleRows = useMemo(() => paginateWomensPlayerRows(rows, page, pageSize), [page, rows]);
  useEffect(() => setPage(0), [metric, minimumGames, position, query]);

  return <section className="field-card wbb-player-card" aria-labelledby="wbb-players-title">
    <div className="eyebrow">WOMEN&apos;S PLAYER TABLE · {WOMENS_SOURCE_SCOPE_LABEL}</div>
    <h2 id="wbb-players-title">Browse observed player production</h2>
    <p className="muted">A searchable table combining source-reported season rows with arithmetic aggregates from retained game-level box scores. Missing values remain unavailable. {WOMENS_SOURCE_SCOPE_NOTE}</p>
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
      <p className="note">{displayPlayers.length.toLocaleString()} unique retained player IDs · {edition.coverage.players.toLocaleString()} player-season IDs + {(boxEdition?.coverage.players || 0).toLocaleString()} box-score IDs ({(boxEdition?.coverage.played_rows || 0).toLocaleString()} played rows) · showing {rows.length ? `${page * pageSize + 1}–${page * pageSize + visibleRows.length}` : "0"} of {rows.length.toLocaleString()} matching rows · observed season {edition.observed_player_season} · captured {date(edition.generated_at)}.</p>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Player</th><th>Team</th><th>Pos.</th><th>Record</th><th className="numeric">GP</th><th className="numeric">PPG</th><th className="numeric">RPG</th><th className="numeric">APG</th><th className="numeric">MPG</th><th className="numeric">FG%</th><th className="numeric">3P%</th><th>Recorded line</th></tr></thead><tbody>{visibleRows.map((player) => <tr key={player.player_id}><th scope="row">{player.name}<small>Player ID {player.player_id}</small></th><td>{player.team}</td><td>{player.position || "—"}</td><td>{player.source === "box" ? "Game boxes" : "Season"}</td><td className="numeric">{number(player.stats.gamesPlayed, 0)}</td><td className="numeric">{number(player.stats.avgPoints)}</td><td className="numeric">{number(player.stats.avgRebounds)}</td><td className="numeric">{number(player.stats.avgAssists)}</td><td className="numeric">{number(player.stats.avgMinutes)}</td><td className="numeric">{number(player.stats.fieldGoalPct)}</td><td className="numeric">{number(player.stats.threePointFieldGoalPct)}</td><td><details className="ranking-recorded-details"><summary>{player.source === "box" ? `${player.box?.box_rows.toLocaleString()} box rows` : `${womensPlayerDetailCount(player.stats)} recorded fields`}</summary>{player.source === "box" && player.box ? <><p className="note">Arithmetic aggregate of {player.box.games_played.toLocaleString()} played source rows; {player.box.dnp_rows.toLocaleString()} DNP rows are excluded from totals.</p><div className="note">{Object.entries(player.box.totals).map(([key, value]) => <span key={key} style={{ display: "inline-block", marginRight: 12 }}>{womensPlayerFieldLabel(key)}: <strong>{value.toLocaleString("en-US", { maximumFractionDigits: 2 })}</strong></span>)}</div></> : <><p className="note">Source values retained for this player-season row. A dash means the release did not contain a finite numeric value.</p>{womensPlayerDetailGroups.map((group) => <div key={group.label}><strong>{group.label}</strong><div className="note">{group.fields.map(([key, label, kind]) => <span key={key} style={{ display: "inline-block", marginRight: 12 }}>{label}: <strong>{formatWomensPlayerStat(player.stats, key, kind)}</strong></span>)}</div></div>)}{unlistedWomensPlayerFields(player.stats).length ? <div><strong>Other retained fields</strong><div className="note">{unlistedWomensPlayerFields(player.stats).map((key) => <span key={key} style={{ display: "inline-block", marginRight: 12 }}>{womensPlayerFieldLabel(key)}: <strong>{formatWomensPlayerStat(player.stats, key, "rate")}</strong></span>)}</div></div> : null}</>}</details></td></tr>)}</tbody></table></div>
      {!rows.length ? <p className="empty">No retained players match these filters.</p> : null}
      {rows.length > pageSize ? <div className="pagination" aria-label="Women&apos;s player pages"><span>Page {page + 1} of {Math.ceil(rows.length / pageSize)}</span><div><button className="button secondary" type="button" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>← Previous</button><button className="button secondary" type="button" disabled={(page + 1) * pageSize >= rows.length} onClick={() => setPage((current) => current + 1)}>Next →</button></div></div> : null}
      {boxEdition?.coverage.source_fields?.length ? <details className="ranking-recorded-details"><summary>Source field coverage · {boxEdition.coverage.source_fields.length} retained fields</summary><p className="note">Counts below come from raw player-box rows and retain missingness. Finite numeric values are counted separately; identity and context fields are not coerced into statistics.</p><div className="table-scroll"><table className="data-table"><thead><tr><th>Source field</th><th className="numeric">Observed rows</th><th className="numeric">Finite numeric rows</th></tr></thead><tbody>{boxEdition.coverage.source_fields.map((field) => <tr key={field.field}><th scope="row">{field.field}</th><td className="numeric">{field.observed_rows.toLocaleString()}</td><td className="numeric">{field.finite_numeric_rows.toLocaleString()}</td></tr>)}</tbody></table></div></details> : null}
      <p className="muted">This table is an observed production file and does not infer eligibility, role, or future performance. Game-box aggregates are derived only from finite source values; DNP rows are explicitly excluded from played-game totals.</p>
    </>}
  </section>;
}
