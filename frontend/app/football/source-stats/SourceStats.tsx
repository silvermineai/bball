"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { date } from "../../_lib/format";
import { downloadCsv, toCsv } from "../../_lib/csv";

type Dataset = "all" | "box" | "passing" | "rushing" | "receiving" | "defense" | "specialists" | "team_advanced" | "teams" | "betting";
type Meta = { seasons: number[]; datasets: { dataset: Exclude<Dataset, "all">; rows: number }[]; dataset_labels: Record<Exclude<Dataset, "all">, string> };
type Row = {
  dataset: Exclude<Dataset, "all">;
  season: number;
  record_key: string;
  athlete_id: string | null;
  team_id: string | null;
  game_id: string | null;
  category: string | null;
  kickoff: string | null;
  home_name: string | null;
  away_name: string | null;
  home_score: number | null;
  away_score: number | null;
  stats: Record<string, unknown>;
  game: { id: string; kickoff: string; home_name: string | null; away_name: string | null; home_score: number | null; away_score: number | null } | null;
};
type Result = { dataset: Dataset; season: number; page: number; page_size: number; total: number; source_receipts: Array<{ dataset: Exclude<Dataset, "all">; season: number; url: string; fetched_at: string; sha256: string }>; rows: Row[] };

const fallbackLabels: Record<Exclude<Dataset, "all">, string> = {
  box: "Player box scores", passing: "Passing aggregates", rushing: "Rushing aggregates", receiving: "Receiving aggregates", defense: "Defensive events", specialists: "Kicking, punting & returns", team_advanced: "Advanced team rates", teams: "Team directory", betting: "Historical market archive",
};
const pretty = (key: string) => key.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const display = (value: unknown) => value == null || value === "" ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value);

export default function SourceStats() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [dataset, setDataset] = useState<Dataset>("box");
  const [season, setSeason] = useState("2025");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("dataset") as Dataset | null;
    if (requested && ["all", "box", "passing", "rushing", "receiving", "defense", "specialists", "team_advanced", "teams", "betting"].includes(requested)) setDataset(requested);
    if (params.get("season")) setSeason(params.get("season")!);
    setQuery(params.get("q") || "");
    const requestedPage = Number(params.get("page"));
    if (Number.isInteger(requestedPage) && requestedPage >= 0 && requestedPage < 1000) setPage(requestedPage);
    setHydrated(true);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/football/source-stats?meta=1", { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error("The football source catalog is unavailable."); return response.json() as Promise<Meta>; })
      .then((value) => {
        if (controller.signal.aborted) return;
        setMeta(value);
        if (value.seasons.length && !value.seasons.includes(Number(season))) setSeason(String(value.seasons[0]));
      })
      .catch((reason: unknown) => { if ((reason as { name?: string })?.name !== "AbortError") setError(reason instanceof Error ? reason.message : "The football source catalog is unavailable."); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!hydrated || !meta) return;
    const url = new URL(window.location.href);
    if (dataset === "box") url.searchParams.delete("dataset"); else url.searchParams.set("dataset", dataset);
    if (season === "2025") url.searchParams.delete("season"); else url.searchParams.set("season", season);
    if (query.trim()) url.searchParams.set("q", query.trim()); else url.searchParams.delete("q");
    if (page) url.searchParams.set("page", String(page)); else url.searchParams.delete("page");
    window.history.replaceState(window.history.state, "", url);
  }, [dataset, hydrated, meta, page, query, season]);

  useEffect(() => {
    if (!meta) return;
    const controller = new AbortController();
    setResult(null);
    const params = new URLSearchParams({ dataset, season, page: String(page) });
    if (query.trim()) params.set("q", query.trim());
    fetch(`/api/football/source-stats?${params}`, { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error("The football source records could not be loaded."); return response.json() as Promise<Result>; })
      .then((value) => { if (!controller.signal.aborted) setResult(value); })
      .catch((reason: unknown) => { if ((reason as { name?: string })?.name !== "AbortError") setError(reason instanceof Error ? reason.message : "The football source records could not be loaded."); });
    return () => controller.abort();
  }, [dataset, meta, page, query, season]);

  const labels = meta?.dataset_labels || fallbackLabels;
  const change = (fn: () => void) => { setPage(0); setError(""); fn(); };
  const exportRows = result?.rows || [];
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">Football source archive / every retained record</div>
        <h1>Read the whole<br /><em>stat sheet.</em></h1>
        <p>Search the source rows behind the football player boards, event notebook, team rates and historical market archive. IDs and name-only records stay labeled exactly as supplied by the attributed release.</p>
      </div>
      <div className="strip">
        <div><strong>{result?.total.toLocaleString() ?? "—"}</strong><span>Matching source records</span></div>
        <div><strong>{meta?.datasets.length || "—"}</strong><span>Retained stat datasets</span></div>
        <div><strong>{meta?.seasons.length || "—"}</strong><span>Source seasons</span></div>
        <div><strong>40</strong><span>Rows per page</span></div>
      </div>
      <div className="toolbar">
        <label className="control"><span>SOURCE DATASET</span><select value={dataset} onChange={(event) => change(() => setDataset(event.target.value as Dataset))}><option value="box">{labels.box}</option><option value="all">All retained datasets</option>{(meta?.datasets || []).filter((item) => item.dataset !== "box").map((item) => <option key={item.dataset} value={item.dataset}>{labels[item.dataset]}</option>)}</select></label>
        <label className="control"><span>STAT SEASON</span><select value={season} onChange={(event) => change(() => setSeason(event.target.value))}>{(meta?.seasons || [2025]).map((value) => <option key={value} value={value}>{value}{value === 2026 ? " · Partial season" : ""}</option>)}</select></label>
        <label className="control"><span>PLAYER, TEAM ID OR SOURCE FIELD</span><input type="search" maxLength={100} value={query} placeholder="Search literal source text" onChange={(event) => { setQuery(event.target.value); setPage(0); }} /></label>
        {result && <button className="button secondary" type="button" onClick={() => downloadCsv(`football-source-stats-${season}-${dataset}.csv`, toCsv(["Dataset", "Season", "Record key", "Athlete ID", "Team ID", "Game ID", "Category", "Kickoff", "Source stats"], exportRows.map((row) => [row.dataset, row.season, row.record_key, row.athlete_id, row.team_id, row.game_id, row.category, row.kickoff, JSON.stringify(row.stats)])))}>Download CSV ↓</button>}
      </div>
      <p className="note">The search is literal and bounded. Source fields are not renamed, inferred or combined across categories. Defensive and specialist releases are name-attributed when no stable athlete ID is supplied; those rows remain useful evidence but are never attached to a player career.</p>
      {error && <p className="status-error" role="alert">{error}</p>}
      {!result ? <p className="empty" role="status">{meta ? "Loading source records…" : "Loading source catalog…"}</p> : <>
        {result.source_receipts.length > 0 && <details className="paper-panel" style={{ marginBottom: 22 }}><summary><strong>Source receipts for the {result.season} edition</strong> · {result.source_receipts.length} release{result.source_receipts.length === 1 ? "" : "s"}</summary><div className="table-scroll" style={{ marginTop: 16 }}><table className="data-table"><thead><tr><th>Dataset</th><th>Retrieved</th><th>SHA-256</th><th>Release</th></tr></thead><tbody>{result.source_receipts.map((receipt) => <tr key={`${receipt.dataset}-${receipt.season}`}><td>{labels[receipt.dataset]}</td><td>{date(receipt.fetched_at)}</td><td className="mono">{receipt.sha256.slice(0, 16)}…</td><td><a href={receipt.url} target="_blank" rel="noreferrer">Open release ↗</a></td></tr>)}</tbody></table></div></details>}
        <div className="section-heading" style={{ marginBottom: 20 }}><p>{result.total.toLocaleString()} matching records · page {page + 1} of {Math.max(1, Math.ceil(result.total / result.page_size))}</p><Link className="hero-link" href="/football/players/">Open identified player rankings →</Link></div>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Source row</th><th>Dataset / category</th><th>Game context</th><th>Retained fields</th></tr></thead><tbody>{result.rows.map((row) => <tr key={`${row.dataset}-${row.season}-${row.record_key}`}><td><strong>{row.athlete_id ? <Link href={`/football/player/?id=${encodeURIComponent(row.athlete_id)}&season=${row.season}`}>{String(row.stats.athlete_name || row.stats.player_name || row.athlete_id)}</Link> : String(row.stats.athlete_name || row.stats.player_name || "Name-only source row")}</strong><small>{row.athlete_id ? `Athlete ${row.athlete_id}` : "No stable athlete ID supplied"}</small><small>{row.team_id ? `Team ${row.team_id}` : "Team unavailable"}{row.game_id ? ` · Game ${row.game_id}` : ""}</small></td><td>{labels[row.dataset]}<small>{row.category || "Uncategorized"} · {row.season}</small></td><td>{row.game ? <><span>{row.game.away_name || "Away"} at {row.game.home_name || "Home"}</span><small>{date(row.game.kickoff)} · {row.game.away_score ?? "—"}–{row.game.home_score ?? "—"}</small></> : <span>Season or team aggregate</span>}</td><td><details><summary>Inspect {Object.keys(row.stats).length} source fields</summary><dl className="raw-stat-grid">{Object.entries(row.stats).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => <div key={key}><dt>{pretty(key)}</dt><dd>{display(value)}</dd></div>)}</dl></details></td></tr>)}</tbody></table></div>
        {!result.rows.length && <p className="empty">No source records match these filters.</p>}
        <div className="pagination"><span>{result.total.toLocaleString()} records · source values remain auditable</span><div><button className="button secondary" disabled={!page} onClick={() => setPage(page - 1)}>← Previous</button><button className="button secondary" disabled={(page + 1) * result.page_size >= result.total} onClick={() => setPage(page + 1)}>Next →</button></div></div>
      </>}
      <section className="section paper-panel"><div className="eyebrow">Source boundary</div><h2>Everything stays in its namespace.</h2><p>SportsDataverse releases are attributed under CC BY 4.0 and retain ESPN / CollegeFootballData source fields. This browser makes the raw evidence discoverable without turning a name-only event record into a player identity, adding a composite grade or presenting archived betting rows as verified pregame lines.</p><p><Link href="/research/coverage/">Review source receipts and live row counts →</Link> · <Link href="/football/events/">Open the defense and specialist notebook →</Link></p></section>
    </>
  );
}
