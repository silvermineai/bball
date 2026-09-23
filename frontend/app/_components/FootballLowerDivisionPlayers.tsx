"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { downloadCsv, toCsv } from "../_lib/csv";
import {
  aggregateLowerFootballPlayers,
  lowerFootballCategories,
  lowerFootballCategoryDefinition,
  lowerFootballGameContext,
  lowerFootballRawExport,
  lowerFootballSourceFieldCoverage,
  lowerFootballSourceFields,
  lowerFootballSourceRows,
  rankLowerFootballPlayers,
  type LowerFootballCategory,
  type LowerFootballPlayerArchive,
  type LowerFootballRawRow,
  type LowerFootballRankingBasis,
  lowerFootballMetricKeys,
  lowerFootballMetricOptions,
  lowerFootballPlayerSelectionSearch,
  parseLowerFootballPlayerSelection,
  validateLowerFootballPlayerArchive,
} from "../_lib/football-lower-player-view";

const number = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 1 });

export default function FootballLowerDivisionPlayers({ division }: { division: "2" | "3" }) {
  const target = `d${division}` as "d2" | "d3";
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const [archive, setArchive] = useState<LowerFootballPlayerArchive | null>(null);
  const [error, setError] = useState("");
  const [category, setCategory] = useState<LowerFootballCategory>("passing");
  const [rankingBasis, setRankingBasis] = useState<LowerFootballRankingBasis>("total");
  const [query, setQuery] = useState("");
  const [minimumGames, setMinimumGames] = useState("1");
  const [selectedKey, setSelectedKey] = useState("");
  const [rankMetric, setRankMetric] = useState("passingYards");
  useEffect(() => {
    fetch("/data/football/lower-division-player-stats-2026.json")
      .then((response) => { if (!response.ok) throw new Error("The lower-division player archive could not be loaded."); return response.json() as Promise<unknown>; })
      .then((value) => { setArchive(validateLowerFootballPlayerArchive(value)); setError(""); })
      .catch((reason: unknown) => { setArchive(null); setError(reason instanceof Error ? reason.message : "The lower-division player archive failed integrity validation."); });
  }, []);
  useEffect(() => {
    if (!archive) return;
    const selection = parseLowerFootballPlayerSelection(search);
    if (!selection) {
      setSelectedKey("");
      return;
    }
    setCategory(selection.category);
    const candidate = aggregateLowerFootballPlayers(archive.rows, target, selection.category)
      .find((row) => row.athlete_id === selection.athlete_id && row.team_id === selection.team_id);
    setSelectedKey(candidate ? `${candidate.athlete_id}:${candidate.team_id}:${candidate.category}` : "");
  }, [archive, search, target]);
  const rows = useMemo(() => {
    const ranked = aggregateLowerFootballPlayers(archive?.rows || [], target, category, query, rankMetric);
    return rankLowerFootballPlayers(
      ranked.filter((row) => row.games >= (Number(minimumGames) || 0)),
      rankingBasis,
    );
  }, [archive, category, minimumGames, query, rankMetric, rankingBasis, target]);
  const selected = useMemo(
    () => {
      if (!archive || !selectedKey) return null;
      const [athleteId, teamId, selectedCategory] = selectedKey.split(":");
      if (!athleteId || !teamId || !lowerFootballCategories.some((item) => item.key === selectedCategory)) return null;
      return aggregateLowerFootballPlayers(archive.rows, target, selectedCategory as LowerFootballCategory)
        .find((row) => row.athlete_id === athleteId && row.team_id === teamId) || null;
    },
    [archive, selectedKey, target],
  );
  const selectedSourceRows = useMemo(
    () => selected && archive
      ? lowerFootballSourceRows(archive.rows, target, selected.category, selected.athlete_id, selected.team_id)
      : [],
    [archive, selected, target],
  );
  const selectedGameContexts = useMemo(() => {
    if (!selected || !archive) return [];
    const seen = new Set<string>();
    return selectedSourceRows.flatMap((sourceRow) => {
      if (seen.has(sourceRow.game_id)) return [];
      seen.add(sourceRow.game_id);
      return [{ sourceRow, game: lowerFootballGameContext(archive.games, sourceRow) }];
    });
  }, [archive, selected, selectedSourceRows]);
  const definition = lowerFootballCategoryDefinition(category);
  const metricOptions = useMemo(
    () => lowerFootballMetricOptions(archive?.rows || [], target, category, definition.metric),
    [archive, category, definition.metric, target],
  );
  const selectedMetric = metricOptions.find((item) => item.key === rankMetric) || metricOptions[0] || { key: definition.metric, label: definition.metric };
  useEffect(() => {
    if (metricOptions.length && !metricOptions.some((item) => item.key === rankMetric)) setRankMetric(metricOptions[0].key);
  }, [metricOptions, rankMetric]);
  const sourceFieldCoverage = useMemo(
    () => lowerFootballSourceFieldCoverage(archive?.rows || [], target),
    [archive, target],
  );
  const metricKeys = useMemo(() => lowerFootballMetricKeys(rows), [rows]);
  const download = () => downloadCsv(
    `football-${target}-player-${category}-${selectedMetric.key}-2026.csv`,
    toCsv(
      ["Rank", "Division", "Category", "Ranking basis", "Player", "Athlete ID", "Team", "Team ID", "Games", "Source rows", selectedMetric.label, `${selectedMetric.label} per game`, ...metricKeys],
      rows.map((row) => [row.rank, row.division.toUpperCase(), definition.label, rankingBasis === "per_game" ? "per_game" : "total", row.athlete, row.athlete_id, row.team, row.team_id, row.games, row.source_rows, row.primary, row.per_game, ...metricKeys.map((key) => row.metrics[key] ?? null)]),
    ),
  );
  const downloadRaw = () => {
    const exported = lowerFootballRawExport(archive?.rows || [], target);
    downloadCsv("football-" + target + "-player-event-rows-2026.csv", toCsv(exported.headers, exported.rows));
  };
  if (!archive) return <section className="paper-panel" aria-live="polite"><div className="eyebrow">D{division} PLAYER ARCHIVE</div>{error ? <p className="status-error" role="alert">{error}</p> : <p>Loading the retained lower-division player event archive…</p>}</section>;
  return <section className="paper-panel" aria-labelledby="lower-football-player-title">
    <div className="section-heading"><div><div className="eyebrow">MEN&apos;S FOOTBALL · D{division} PLAYER ARCHIVE</div><h2 id="lower-football-player-title">Rank observed game production.</h2></div><button className="button secondary" type="button" onClick={download} disabled={!rows.length}>Download CSV ↓</button></div>
    <p className="note">Exact publisher athlete IDs and team IDs are aggregated from {archive.coverage.games.toLocaleString()} retained D2/D3 event summaries. This is an observed 2026 game archive through {new Date(archive.generated_at).toLocaleDateString("en-US", { timeZone: "UTC" })}; it is not a claim that an unobserved game or missing category is zero.</p>
    <div className="toolbar"><label className="control"><span>STAT CATEGORY</span><select value={category} onChange={(event) => { const next = event.target.value as LowerFootballCategory; const nextDefinition = lowerFootballCategoryDefinition(next); setCategory(next); setRankMetric(nextDefinition.metric); setSelectedKey(""); window.history.replaceState(null, "", lowerFootballPlayerSelectionSearch(window.location.search, null)); }}>{lowerFootballCategories.map((item) => <option key={item.key} value={item.key}>{item.label} · {item.unit}</option>)}</select></label><label className="control"><span>SOURCE FIELD</span><select value={selectedMetric.key} onChange={(event) => setRankMetric(event.target.value)}>{metricOptions.map((item) => <option key={item.key} value={item.key}>{item.label} · {item.key}</option>)}</select></label><label className="control"><span>RANK BY</span><select value={rankingBasis} onChange={(event) => setRankingBasis(event.target.value as LowerFootballRankingBasis)}><option value="total">Season total</option><option value="per_game">Per game</option></select></label><label className="control"><span>MINIMUM GAMES</span><select value={minimumGames} onChange={(event) => setMinimumGames(event.target.value)}><option value="1">1+</option><option value="3">3+</option><option value="5">5+</option></select></label><label className="control"><span>SEARCH PLAYER / TEAM</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, team, or ID" /></label></div>
    <p className="note">{rows.length.toLocaleString()} qualified players · {archive.coverage.rows_by_division[target]?.toLocaleString() || 0} source rows in D{division} · ranked by {rankingBasis === "per_game" ? `average ${selectedMetric.label} per retained game` : `summed ${selectedMetric.label}`} with missing values excluded. Equal retained values share a competition rank.</p>
    <details className="ranking-recorded-details" style={{ marginBottom: 18 }}>
      <summary>Source field coverage · {sourceFieldCoverage.length} fields · {archive.receipts.length.toLocaleString()} receipts</summary>
      <div className="button-row" style={{ marginTop: 12 }}><button className="button secondary" type="button" onClick={downloadRaw} disabled={!archive.rows.length}>Download raw event rows CSV ↓</button><span className="note">Exact athlete, team, game, category, and provider field values are retained.</span></div>
      <p className="note">These counts audit provider fields within exact {target.toUpperCase()} rows. A populated-value count excludes blank provider cells; it does not turn an unavailable value into zero.</p>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Source field</th><th>Provider label</th><th>Categories</th><th className="numeric">Rows carrying field</th><th className="numeric">Populated values</th></tr></thead><tbody>{sourceFieldCoverage.map((field) => <tr key={field.key}><th scope="row"><code>{field.key}</code></th><td>{field.label}</td><td>{field.categories.join(", ")}</td><td className="numeric">{field.source_rows.toLocaleString()}</td><td className="numeric">{field.populated_values.toLocaleString()}</td></tr>)}</tbody></table></div>
      <p className="note">Receipt digest: <code>{archive.source.receipt_sha256}</code>. The archive contains {archive.coverage.players_by_division[target]?.toLocaleString() || 0} exact athlete IDs across {archive.coverage.teams.toLocaleString()} retained teams in the combined D2/D3 release; this table stays within D{division}.</p>
    </details>
    <div className="table-scroll"><table className="data-table"><thead><tr><th>Rank</th><th>Player</th><th>Team</th><th className="numeric">GP</th><th className="numeric">{selectedMetric.label}</th><th className="numeric">Per game</th><th className="numeric">Source rows</th><th>Recorded measures</th></tr></thead><tbody>{rows.slice(0, 100).map((row) => { const key = `${row.athlete_id}:${row.team_id}:${row.category}`; return <tr key={key}><td className="rank-number">{row.rank}</td><th scope="row"><button className="text-link" type="button" onClick={() => { const next = selectedKey === key ? null : { athlete_id: row.athlete_id, team_id: row.team_id, category: row.category }; setSelectedKey(next ? key : ""); window.history.replaceState(null, "", lowerFootballPlayerSelectionSearch(window.location.search, next)); }} aria-expanded={selectedKey === key} aria-controls="lower-football-source-detail">{row.athlete}</button><small>{row.athlete_id}{row.position ? ` · ${row.position}` : ""}</small></th><td>{row.team}<small>{row.team_id}</small></td><td className="numeric">{row.games}</td><td className="numeric"><strong>{number(row.primary)}</strong></td><td className="numeric">{number(row.per_game)}</td><td className="numeric">{row.source_rows}</td><td>{Object.entries(row.metrics).filter(([key]) => key !== selectedMetric.key).slice(0, 6).map(([key, value]) => `${key}: ${number(value)}`).join(" · ") || "—"}</td></tr>; })}</tbody></table></div>
    {rows.length > 100 && <p className="note">Showing the first 100 rows; download CSV contains all {rows.length.toLocaleString()} matching players.</p>}
    {selected ? <section id="lower-football-source-detail" className="paper-panel" aria-labelledby="lower-football-source-detail-title" style={{ marginTop: 18 }}>
      <div className="section-heading"><div><div className="eyebrow">EXACT SOURCE ROWS · {target.toUpperCase()}</div><h3 id="lower-football-source-detail-title">{selected.athlete} · {lowerFootballCategoryDefinition(selected.category).label}</h3></div><button className="button secondary" type="button" onClick={() => { setSelectedKey(""); window.history.replaceState(null, "", lowerFootballPlayerSelectionSearch(window.location.search, null)); }}>Close detail</button></div>
      <p className="note">Every field below comes from the retained provider response for athlete <code>{selected.athlete_id}</code>, team <code>{selected.team_id}</code>, and category <code>{selected.category}</code>. This exact-ID detail is shareable from the URL; blank and unavailable fields remain blank.</p>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Date</th><th>Game ID</th><th>Jersey</th><th>Source field</th><th>Provider label</th><th>Raw value</th></tr></thead><tbody>{selectedSourceRows.flatMap((sourceRow) => lowerFootballSourceFields(sourceRow).map((field, index) => <tr key={`${sourceRow.game_id}-${field.key}-${index}`}><td>{sourceRow.date ? new Date(sourceRow.date).toLocaleDateString("en-US", { timeZone: "UTC" }) : "—"}</td><td><code>{sourceRow.game_id}</code></td><td>{sourceRow.jersey || "—"}</td><td><code>{field.key}</code></td><td>{field.label}</td><td>{field.value == null ? "—" : field.value}</td></tr>))}</tbody></table></div>
      <h4 style={{ margin: "18px 0 8px" }}>Schedule context</h4>
      <p className="note">Schedule metadata is joined by exact game ID. Team side and opponent are shown only when this row&apos;s exact team ID matches a published home or away participant.</p>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Date</th><th>Published game</th><th>Team side</th><th>Opponent team ID</th><th>Status</th></tr></thead><tbody>{selectedGameContexts.map(({ sourceRow, game }) => <tr key={`schedule-${sourceRow.game_id}`}><td>{game?.date ? new Date(game.date).toLocaleDateString("en-US", { timeZone: "UTC" }) : "—"}</td><td>{game?.name || "Schedule metadata unavailable"}</td><td>{game?.team_side || "unknown"}</td><td><code>{game?.opponent_team_id || "—"}</code></td><td>{game?.status || "—"}</td></tr>)}</tbody></table></div>
      {!selectedSourceRows.length ? <p className="empty">No retained source rows match this exact identity scope.</p> : null}
    </section> : null}
  </section>;
}
