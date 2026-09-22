"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { date } from "../../_lib/format";
import { downloadCsv, toCsv } from "../../_lib/csv";
import { footballSourceCoverageRows } from "../../_lib/football-source-coverage";

type Dataset = "all" | "box" | "passing" | "rushing" | "receiving" | "defense" | "specialists" | "team_advanced" | "teams" | "betting" | "ncaa_player_stats" | "rosters" | "recruits" | "team_talent" | "returning_production";
type Division = "all" | "fbs" | "fcs" | "d2" | "d3" | "naia" | "unknown";
type Meta = { seasons: number[]; datasets: { dataset: Exclude<Dataset, "all">; rows: number | null }[]; dataset_labels: Record<Exclude<Dataset, "all">, string>; counts_deferred?: boolean };
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
type DivisionKey = "fbs" | "fcs" | "d2" | "d3" | "naia" | "unknown";
type DivisionCoverageResult = {
  status: "exact" | "unavailable";
  scope: "season_and_dataset";
  rows: Array<{ division: DivisionKey; rows: number; teams: number }>;
};
type Result = {
  dataset: Dataset;
  season: number;
  page: number;
  page_size: number;
  total: number;
  field_catalog?: Array<{ key: string; observed_rows: number; share: number | null }>;
  field_catalog_scope?: "returned_page";
  division_coverage?: DivisionCoverageResult;
  division_filter?: {
    requested: Division;
    status: "available" | "empty" | "unavailable";
    matched_rows: number;
    reason: string;
  };
  source_receipts: Array<{ dataset: Exclude<Dataset, "all">; season: number; fetched_at: string; sha256: string }>;
  rows: Row[];
};

const fallbackLabels: Record<Exclude<Dataset, "all">, string> = {
  box: "Player box scores", passing: "Passing aggregates", rushing: "Rushing aggregates", receiving: "Receiving aggregates", defense: "Defensive events", specialists: "Kicking, punting & returns", team_advanced: "Advanced team rates", teams: "Team directory", betting: "Historical market archive", ncaa_player_stats: "retained player game stats", rosters: "Season rosters", recruits: "Recruiting commitments", team_talent: "Team talent", returning_production: "Returning production",
};
const pretty = (key: string) => key.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const display = (value: unknown) => value == null || value === "" ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value);
const exportHeaders = ["Dataset", "Season", "Record key", "Athlete ID", "Team ID", "Game ID", "Category", "Kickoff", "Source stats", "Source retrieved", "Source SHA-256"];
const exportRow = (result: Result, row: Row) => {
  const receipt = result.source_receipts.find((item) => item.dataset === row.dataset && item.season === row.season);
  return [row.dataset, row.season, row.record_key, row.athlete_id, row.team_id, row.game_id, row.category, row.kickoff, JSON.stringify(row.stats), receipt?.fetched_at, receipt?.sha256];
};
const divisionLabel = (division: DivisionKey) => ({
  fbs: "FBS · Division I",
  fcs: "FCS · Division I",
  d2: "Division II",
  d3: "Division III",
  naia: "NAIA",
  unknown: "Unavailable / unrecognised",
}[division]);

export default function SourceStats() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [dataset, setDataset] = useState<Dataset>("box");
  const [season, setSeason] = useState("2025");
  const [query, setQuery] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [division, setDivision] = useState<Division>("all");
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("dataset") as Dataset | null;
    if (requested && ["all", "box", "passing", "rushing", "receiving", "defense", "specialists", "team_advanced", "teams", "betting", "ncaa_player_stats", "rosters", "recruits", "team_talent", "returning_production"].includes(requested)) setDataset(requested);
    if (params.get("season")) setSeason(params.get("season")!);
    setQuery(params.get("q") || "");
    setTeamFilter(/^\d{1,15}$/.test(params.get("team") || "") ? params.get("team") || "" : "");
    const requestedDivision = params.get("division") as Division | null;
    if (requestedDivision && ["all", "fbs", "fcs", "d2", "d3", "naia", "unknown"].includes(requestedDivision)) setDivision(requestedDivision);
    const requestedPage = Number(params.get("page"));
    if (Number.isInteger(requestedPage) && requestedPage >= 0 && requestedPage < 1000) setPage(requestedPage);
    setHydrated(true);
  }, [retryNonce]);

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
    if (teamFilter) url.searchParams.set("team", teamFilter); else url.searchParams.delete("team");
    if (division !== "all") url.searchParams.set("division", division); else url.searchParams.delete("division");
    if (page) url.searchParams.set("page", String(page)); else url.searchParams.delete("page");
    window.history.replaceState(window.history.state, "", url);
  }, [dataset, division, hydrated, meta, page, query, season, teamFilter]);

  useEffect(() => {
    if (!meta) return;
    const controller = new AbortController();
    setResult(null);
    const params = new URLSearchParams({ dataset, season, page: String(page), division });
    if (query.trim()) params.set("q", query.trim());
    if (teamFilter) params.set("team", teamFilter);
    fetch(`/api/football/source-stats?${params}`, { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error("The football source records could not be loaded."); return response.json() as Promise<Result>; })
      .then((value) => { if (!controller.signal.aborted) setResult(value); })
      .catch((reason: unknown) => { if ((reason as { name?: string })?.name !== "AbortError") setError(reason instanceof Error ? reason.message : "The football source records could not be loaded."); });
    return () => controller.abort();
  }, [dataset, division, meta, page, query, retryNonce, season, teamFilter]);

  const labels = meta?.dataset_labels || fallbackLabels;
  const change = (fn: () => void) => { setPage(0); setError(""); fn(); };
  const exportRows = result?.rows || [];
  const downloadPage = () => {
    if (!result) return;
    downloadCsv(`football-source-stats-${season}-${dataset}-page-${page + 1}.csv`, toCsv(exportHeaders, exportRows.map((row) => exportRow(result, row))));
  };
  const downloadAll = async () => {
    if (!result || exporting) return;
    const totalPages = Math.ceil(result.total / result.page_size);
    if (totalPages > 1001) {
      setExportMessage("This slice exceeds the bounded export window. Add a season, dataset, or literal search filter first.");
      return;
    }
    setExporting(true);
    setExportMessage(`Preparing 0 of ${result.total.toLocaleString()} source rows…`);
    try {
      const rows: Row[] = [];
      for (let requestedPage = 0; requestedPage < totalPages; requestedPage += 1) {
        const params = new URLSearchParams({ dataset, season, page: String(requestedPage), division });
        if (query.trim()) params.set("q", query.trim());
        if (teamFilter) params.set("team", teamFilter);
        const response = await fetch(`/api/football/source-stats?${params}`);
        if (!response.ok) throw new Error("The complete football source export could not be loaded.");
        const payload = await response.json() as Result;
        rows.push(...payload.rows);
        setExportMessage(`Preparing ${rows.length.toLocaleString()} of ${result.total.toLocaleString()} source rows…`);
      }
      downloadCsv(`football-source-stats-${season}-${dataset}-all.csv`, toCsv(exportHeaders, rows.map((row) => exportRow(result, row))));
      setExportMessage(`Downloaded ${rows.length.toLocaleString()} source rows.`);
    } catch (reason) {
      setExportMessage(reason instanceof Error ? reason.message : "The complete football source export could not be loaded.");
    } finally {
      setExporting(false);
    }
  };
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
      {meta && (
        <section className="section paper-panel" aria-labelledby="football-source-coverage">
          <div className="eyebrow">Retained source coverage</div>
          <h2 id="football-source-coverage">Know what is in each archive.</h2>
          <p>
            These are the datasets currently present across the retained
            football source catalog. Counts cover all catalog seasons; the
            selected season&apos;s exact slice appears after the filters below.
            An exact count is authoritative for this catalog;
            &quot;Deferred&quot; means the edge returned receipt metadata while the
            large table count was withheld. It never means zero.
          </p>
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Dataset</th><th className="numeric">Retained rows</th><th>Status</th></tr></thead>
              <tbody>{footballSourceCoverageRows(meta.datasets, meta.dataset_labels).map((row) => (
                <tr key={row.dataset}>
                  <th scope="row">{row.label}<small>{row.dataset}</small></th>
                  <td className="numeric">{row.rows == null ? "Deferred" : row.rows.toLocaleString()}</td>
                  <td>{row.count_status === "exact" ? "Exact edition count" : "Receipt-only catalog"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {meta.counts_deferred && <p className="note">At least one count is deferred because the source table is too large for a bounded catalog read. Open a dataset to see the authoritative count for its selected season and filters.</p>}
        </section>
      )}
      <div className="toolbar">
        <label className="control"><span>SOURCE DATASET</span><select value={dataset} onChange={(event) => change(() => setDataset(event.target.value as Dataset))}><option value="box">{labels.box}</option><option value="all">All retained datasets</option>{(meta?.datasets || []).filter((item) => item.dataset !== "box").map((item) => <option key={item.dataset} value={item.dataset}>{labels[item.dataset]}</option>)}</select></label>
        <label className="control"><span>STAT SEASON</span><select value={season} onChange={(event) => change(() => setSeason(event.target.value))}>{(meta?.seasons || [2025]).map((value) => <option key={value} value={value}>{value}{value === 2026 ? " · Partial season" : ""}</option>)}</select></label>
        <label className="control"><span>DIVISION</span><select value={division} onChange={(event) => change(() => setDivision(event.target.value as Division))}><option value="all">All divisions</option><option value="fbs">FBS (D1)</option><option value="fcs">FCS (D1)</option><option value="d2">Division II</option><option value="d3">Division III</option><option value="naia">NAIA</option><option value="unknown">Division unavailable</option></select></label>
        <label className="control"><span>PLAYER, TEAM ID OR SOURCE FIELD</span><input type="search" maxLength={100} value={query} placeholder="Search literal source text" onChange={(event) => { setQuery(event.target.value); setPage(0); }} /></label>
        {result && <><button className="button secondary" type="button" onClick={downloadPage}>Download page CSV ↓</button><button className="button secondary" type="button" onClick={downloadAll} disabled={exporting}>{exporting ? "Preparing full CSV…" : "Download all matching CSV ↓"}</button></>}
      </div>
      {(teamFilter || division !== "all") && <p className="note" role="status">{teamFilter ? <>Exact source team key filter: <code>{teamFilter}</code>{division !== "all" ? " · " : ""}</> : null}{division !== "all" ? <>Division filter: <strong>{division === "unknown" ? "unavailable / unrecognised" : division.toUpperCase()}</strong>{result?.division_filter ? <> · <span className={result.division_filter.status === "unavailable" ? "text-brass" : ""}>{result.division_filter.status === "available" ? "verified" : result.division_filter.status === "empty" ? "verified empty" : "unavailable"}</span></> : null}</> : null} · <button className="text-link" type="button" onClick={() => { setTeamFilter(""); setDivision("all"); setPage(0); }}>Clear filters</button></p>}
      {result?.division_filter?.status === "unavailable" && division !== "all" && <section className="paper-panel" style={{ marginBottom: 22 }} aria-labelledby="division-filter-boundary"><div className="eyebrow">Division filter boundary</div><h2 id="division-filter-boundary">The selected division cannot be verified for this source edition.</h2><p>{result.division_filter.reason}</p><p className="note">Open the all-source view to inspect the retained rows, or choose a dataset with an exact team-directory division join.</p></section>}
      {exportMessage && <p className="note" role="status">{exportMessage}</p>}
      <p className="note">The search is literal and bounded. Source fields are not renamed, inferred or combined across categories. Defensive, specialist and retained player releases are name-attributed when no stable athlete ID is supplied; those rows remain useful evidence but are never attached to a player career.</p>
      {error && <div className="status-error" role="alert"><span>{error}</span><button className="button secondary" type="button" onClick={() => { setError(""); setRetryNonce((value) => value + 1); }}>Retry football source archive</button></div>}
      {!result ? <p className="empty" role="status">{meta ? "Loading source records…" : "Loading source catalog…"}</p> : <>
        {result.source_receipts.length > 0 && <details className="paper-panel" style={{ marginBottom: 22 }}><summary><strong>Edition receipts for the {result.season} edition</strong> · {result.source_receipts.length} release{result.source_receipts.length === 1 ? "" : "s"}</summary><div className="table-scroll" style={{ marginTop: 16 }}><table className="data-table"><thead><tr><th>Dataset</th><th>Retrieved</th><th>SHA-256</th><th>Status</th></tr></thead><tbody>{result.source_receipts.map((receipt) => <tr key={`${receipt.dataset}-${receipt.season}`}><td>{labels[receipt.dataset]}</td><td>{date(receipt.fetched_at)}</td><td className="mono">{receipt.sha256.slice(0, 16)}…</td><td>Retained</td></tr>)}</tbody></table></div></details>}
        {result.field_catalog && <section className="paper-panel" style={{ marginBottom: 22 }} aria-labelledby="observed-source-fields"><div className="eyebrow">Source field catalog</div><h2 id="observed-source-fields">Fields observed in this page.</h2><p>These are the original top-level keys present in the returned source rows. Counts show how many rows on this page supplied each key; a missing key remains missing rather than being inferred.</p>{result.field_catalog.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Source field</th><th className="numeric">Rows with field</th><th className="numeric">Page share</th></tr></thead><tbody>{result.field_catalog.map((field) => <tr key={field.key}><th scope="row" className="mono">{field.key}</th><td className="numeric">{field.observed_rows}</td><td className="numeric">{field.share == null ? "—" : `${Math.round(field.share * 100)}%`}</td></tr>)}</tbody></table></div> : <p className="empty">No structured source fields were returned for this page.</p>}</section>}
        {result.division_coverage && <section className="paper-panel" style={{ marginBottom: 22 }} aria-labelledby="division-source-coverage"><div className="eyebrow">Exact division coverage</div><h2 id="division-source-coverage">See where player rows exist.</h2><p>Counts below cover the selected season and dataset. Division labels come only from an exact season and team-ID join to the retained team directory; a zero is a verified empty slice, while unavailable means the coverage query timed out.</p>{result.division_coverage.status === "exact" ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Division</th><th className="numeric">Source rows</th><th className="numeric">Teams represented</th><th>Status</th></tr></thead><tbody>{["fbs", "fcs", "d2", "d3", "naia", "unknown"].map((division) => { const row = result.division_coverage?.rows.find((candidate) => candidate.division === division); return <tr key={division}><th scope="row">{divisionLabel(division as DivisionKey)}</th><td className="numeric">{(row?.rows || 0).toLocaleString()}</td><td className="numeric">{(row?.teams || 0).toLocaleString()}</td><td>{row?.rows ? "Retained" : "No retained rows"}</td></tr>; })}</tbody></table></div> : <p className="empty">Division coverage is temporarily unavailable. The filtered rows remain independently bounded and exact.</p>}</section>}
        <div className="section-heading" style={{ marginBottom: 20 }}><p>{result.total.toLocaleString()} matching records · page {page + 1} of {Math.max(1, Math.ceil(result.total / result.page_size))}</p><Link className="hero-link" href="/football/players/">Open identified player rankings →</Link></div>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Source row</th><th>Dataset / category</th><th>Game context</th><th>Retained fields</th></tr></thead><tbody>{result.rows.map((row) => <tr key={`${row.dataset}-${row.season}-${row.record_key}`}><td><strong>{row.athlete_id ? <Link href={`/football/player/?id=${encodeURIComponent(row.athlete_id)}&season=${row.season}`}>{String(row.stats.athlete_name || row.stats.player_name || row.athlete_id)}</Link> : String(row.stats.athlete_name || row.stats.player_name || "Name-only source row")}</strong><small>{row.athlete_id ? `Athlete ${row.athlete_id}` : "No stable athlete ID supplied"}</small><small>{row.team_id ? `Team ${row.team_id}` : "Team unavailable"}{row.game_id ? ` · Game ${row.game_id}` : ""}</small></td><td>{labels[row.dataset]}<small>{row.category || "Uncategorized"} · {row.season}</small></td><td>{row.game ? <><span>{row.game.away_name || "Away"} at {row.game.home_name || "Home"}</span><small>{date(row.game.kickoff)} · {row.game.away_score ?? "—"}–{row.game.home_score ?? "—"}</small></> : <span>Season or team aggregate</span>}</td><td><details><summary>Inspect {Object.keys(row.stats).length} source fields</summary><dl className="raw-stat-grid">{Object.entries(row.stats).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => <div key={key}><dt>{pretty(key)}</dt><dd>{display(value)}</dd></div>)}</dl></details></td></tr>)}</tbody></table></div>
        {!result.rows.length && <p className="empty">No source records match these filters.</p>}
        <div className="pagination"><span>{result.total.toLocaleString()} records · retained values remain auditable</span><div><button className="button secondary" disabled={!page} onClick={() => setPage(page - 1)}>← Previous</button><button className="button secondary" disabled={(page + 1) * result.page_size >= result.total} onClick={() => setPage(page + 1)}>Next →</button></div></div>
      </>}
      <section className="section paper-panel"><div className="eyebrow">Data boundary</div><h2>Everything stays in its namespace.</h2><p>Retained records keep their original field names and identity boundaries. Contest-level rows do not supply a stable athlete ID and are never joined to the player archive by name. This browser makes raw evidence discoverable without adding a composite grade or presenting archived betting rows as verified pregame lines.</p><p><Link href="/research/coverage/">Review data coverage and row counts →</Link> · <Link href="/football/events/">Open the defense and specialist notebook →</Link></p></section>
    </>
  );
}
