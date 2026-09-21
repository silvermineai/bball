"use client";

import { useEffect, useMemo, useState } from "react";
import { downloadCsv, toCsv } from "../_lib/csv";
import {
  aggregateLowerFootballPlayers,
  lowerFootballCategories,
  lowerFootballCategoryDefinition,
  lowerFootballSourceFields,
  lowerFootballSourceRows,
  type LowerFootballCategory,
  type LowerFootballRawRow,
} from "../_lib/football-lower-player-view";

type Archive = {
  season: number;
  generated_at: string;
  coverage: { events_discovered: number; events_with_d2_d3_team: number; games: number; player_rows: number; players: number; teams: number; rows_by_division: Record<string, number>; players_by_division: Record<string, number> };
  rows: LowerFootballRawRow[];
};

const number = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 1 });

export default function FootballLowerDivisionPlayers({ division }: { division: "2" | "3" }) {
  const target = `d${division}` as "d2" | "d3";
  const [archive, setArchive] = useState<Archive | null>(null);
  const [category, setCategory] = useState<LowerFootballCategory>("passing");
  const [query, setQuery] = useState("");
  const [minimumGames, setMinimumGames] = useState("1");
  const [selectedKey, setSelectedKey] = useState("");
  useEffect(() => {
    fetch("/data/football/lower-division-player-stats-2026.json")
      .then((response) => response.ok ? response.json() as Promise<Archive> : null)
      .then((value) => setArchive(value))
      .catch(() => setArchive(null));
  }, []);
  const rows = useMemo(() => {
    const ranked = aggregateLowerFootballPlayers(archive?.rows || [], target, category, query);
    return ranked.filter((row) => row.games >= (Number(minimumGames) || 0));
  }, [archive, category, minimumGames, query, target]);
  const selected = useMemo(
    () => rows.find((row) => `${row.athlete_id}:${row.team_id}:${row.category}` === selectedKey) || null,
    [rows, selectedKey],
  );
  const selectedSourceRows = useMemo(
    () => selected && archive
      ? lowerFootballSourceRows(archive.rows, target, category, selected.athlete_id, selected.team_id)
      : [],
    [archive, category, selected, target],
  );
  const definition = lowerFootballCategoryDefinition(category);
  const download = () => downloadCsv(
    `football-${target}-player-${category}-2026.csv`,
    toCsv(
      ["Rank", "Division", "Category", "Player", "Athlete ID", "Team", "Team ID", "Games", "Source rows", definition.metric, ...Object.keys(rows[0]?.metrics || {})],
      rows.map((row, index) => [index + 1, row.division.toUpperCase(), definition.label, row.athlete, row.athlete_id, row.team, row.team_id, row.games, row.source_rows, row.primary, ...Object.keys(rows[0]?.metrics || {}).map((key) => row.metrics[key] ?? null)]),
    ),
  );
  if (!archive) return <section className="paper-panel" aria-live="polite"><div className="eyebrow">D{division} PLAYER ARCHIVE</div><p>Loading the retained lower-division player event archive…</p></section>;
  return <section className="paper-panel" aria-labelledby="lower-football-player-title">
    <div className="section-heading"><div><div className="eyebrow">MEN&apos;S FOOTBALL · D{division} PLAYER ARCHIVE</div><h2 id="lower-football-player-title">Rank observed game production.</h2></div><button className="button secondary" type="button" onClick={download} disabled={!rows.length}>Download CSV ↓</button></div>
    <p className="note">Exact publisher athlete IDs and team IDs are aggregated from {archive.coverage.games.toLocaleString()} retained D2/D3 event summaries. This is an observed 2026 game archive through {new Date(archive.generated_at).toLocaleDateString("en-US", { timeZone: "UTC" })}; it is not a claim that an unobserved game or missing category is zero.</p>
    <div className="toolbar"><label className="control"><span>STAT CATEGORY</span><select value={category} onChange={(event) => setCategory(event.target.value as LowerFootballCategory)}>{lowerFootballCategories.map((item) => <option key={item.key} value={item.key}>{item.label} · {item.unit}</option>)}</select></label><label className="control"><span>MINIMUM GAMES</span><select value={minimumGames} onChange={(event) => setMinimumGames(event.target.value)}><option value="1">1+</option><option value="3">3+</option><option value="5">5+</option></select></label><label className="control"><span>SEARCH PLAYER / TEAM</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, team, or ID" /></label></div>
    <p className="note">{rows.length.toLocaleString()} qualified players · {archive.coverage.rows_by_division[target]?.toLocaleString() || 0} source rows in D{division} · ranked by summed {definition.metric} with missing values excluded.</p>
    <div className="table-scroll"><table className="data-table"><thead><tr><th>Rank</th><th>Player</th><th>Team</th><th className="numeric">GP</th><th className="numeric">{definition.metric}</th><th className="numeric">Source rows</th><th>Recorded measures</th></tr></thead><tbody>{rows.slice(0, 100).map((row, index) => { const key = `${row.athlete_id}:${row.team_id}:${row.category}`; return <tr key={key}><td className="rank-number">{index + 1}</td><th scope="row"><button className="text-link" type="button" onClick={() => setSelectedKey((current) => current === key ? "" : key)} aria-expanded={selectedKey === key} aria-controls="lower-football-source-detail">{row.athlete}</button><small>{row.athlete_id}{row.position ? ` · ${row.position}` : ""}</small></th><td>{row.team}<small>{row.team_id}</small></td><td className="numeric">{row.games}</td><td className="numeric"><strong>{number(row.primary)}</strong></td><td className="numeric">{row.source_rows}</td><td>{Object.entries(row.metrics).filter(([key]) => key !== definition.metric).slice(0, 6).map(([key, value]) => `${key}: ${number(value)}`).join(" · ") || "—"}</td></tr>; })}</tbody></table></div>
    {rows.length > 100 && <p className="note">Showing the first 100 rows; download CSV contains all {rows.length.toLocaleString()} matching players.</p>}
    {selected ? <section id="lower-football-source-detail" className="paper-panel" aria-labelledby="lower-football-source-detail-title" style={{ marginTop: 18 }}>
      <div className="section-heading"><div><div className="eyebrow">EXACT SOURCE ROWS · {target.toUpperCase()}</div><h3 id="lower-football-source-detail-title">{selected.athlete} · {definition.label}</h3></div><button className="button secondary" type="button" onClick={() => setSelectedKey("")}>Close detail</button></div>
      <p className="note">Every field below comes from the retained provider response for athlete <code>{selected.athlete_id}</code>, team <code>{selected.team_id}</code>, and category <code>{category}</code>. Values are displayed as supplied; blank and unavailable fields remain blank.</p>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Date</th><th>Game ID</th><th>Source field</th><th>Provider label</th><th>Raw value</th></tr></thead><tbody>{selectedSourceRows.flatMap((sourceRow) => lowerFootballSourceFields(sourceRow).map((field, index) => <tr key={`${sourceRow.game_id}-${field.key}-${index}`}><td>{sourceRow.date ? new Date(sourceRow.date).toLocaleDateString("en-US", { timeZone: "UTC" }) : "—"}</td><td><code>{sourceRow.game_id}</code></td><td><code>{field.key}</code></td><td>{field.label}</td><td>{field.value == null ? "—" : field.value}</td></tr>))}</tbody></table></div>
      {!selectedSourceRows.length ? <p className="empty">No retained source rows match this exact identity scope.</p> : null}
    </section> : null}
  </section>;
}
