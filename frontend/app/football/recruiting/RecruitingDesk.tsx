"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { date, fmt } from "../../_lib/format";

type View = "rosters" | "recruits" | "talent" | "returning";
type Receipt = { dataset: string; season: number; url: string; fetched_at: string; sha256: string };
type Meta = { seasons: number[]; datasets: Array<{ dataset: string; season: number; rows: number }>; receipts: Receipt[]; views: Array<{ view: View; dataset: string; label: string }> };
type Row = Record<string, unknown> & { id?: string | null; team_id?: string | null; raw?: Record<string, unknown>; record_key?: string };
type Result = { view: View; label: string; dataset: string; season: number; page: number; page_size: number; total: number; source_receipts: Receipt[]; rows: Row[] };

const labels: Record<View, string> = {
  rosters: "Season rosters",
  recruits: "Recruiting commitments",
  talent: "Team talent",
  returning: "Returning production",
};
const percent = (value: unknown) => typeof value === "number" ? `${fmt(value * 100, 1)}%` : "—";
const value = (row: Row, key: string) => row[key] == null ? "—" : String(row[key]);

export default function RecruitingDesk() {
  const [view, setView] = useState<View>("rosters");
  const [season, setSeason] = useState("2026");
  const [query, setQuery] = useState("");
  const [team, setTeam] = useState("");
  const [page, setPage] = useState(0);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedView = params.get("view") as View | null;
    if (requestedView && requestedView in labels) setView(requestedView);
    if (params.get("season")) setSeason(params.get("season")!);
    setQuery(params.get("q") || "");
    setTeam(params.get("team") || "");
    const requestedPage = Number(params.get("page"));
    if (Number.isInteger(requestedPage) && requestedPage >= 0 && requestedPage < 1000) setPage(requestedPage);
    setHydrated(true);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/football/recruiting?meta=1", { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error("The football recruiting catalog is unavailable."); return response.json() as Promise<Meta>; })
      .then((data) => { if (!controller.signal.aborted) { setMeta(data); if (data.seasons.length && !data.seasons.includes(Number(season))) setSeason(String(data.seasons[0])); } })
      .catch((reason: unknown) => { if ((reason as { name?: string })?.name !== "AbortError") setError(reason instanceof Error ? reason.message : "The football recruiting catalog is unavailable."); });
    return () => controller.abort();
  }, [retry]);
  useEffect(() => {
    if (!hydrated || !meta) return;
    const url = new URL(window.location.href);
    if (view === "rosters") url.searchParams.delete("view"); else url.searchParams.set("view", view);
    if (season === "2026") url.searchParams.delete("season"); else url.searchParams.set("season", season);
    if (query.trim()) url.searchParams.set("q", query.trim()); else url.searchParams.delete("q");
    if (team.trim()) url.searchParams.set("team", team.trim()); else url.searchParams.delete("team");
    if (page) url.searchParams.set("page", String(page)); else url.searchParams.delete("page");
    window.history.replaceState(window.history.state, "", url);
  }, [hydrated, meta, page, query, season, team, view]);
  useEffect(() => {
    if (!meta) return;
    const controller = new AbortController();
    setResult(null);
    setError("");
    const params = new URLSearchParams({ view, season, page: String(page), limit: "40" });
    if (query.trim()) params.set("q", query.trim());
    if (team.trim()) params.set("team", team.trim());
    fetch(`/api/football/recruiting?${params}`, { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error("The football recruiting records could not be loaded."); return response.json() as Promise<Result>; })
      .then((data) => { if (!controller.signal.aborted) setResult(data); })
      .catch((reason: unknown) => { if ((reason as { name?: string })?.name !== "AbortError") setError(reason instanceof Error ? reason.message : "The football recruiting records could not be loaded."); });
    return () => controller.abort();
  }, [meta, page, query, retry, season, team, view]);
  const selectedReceipt = useMemo(() => result?.source_receipts[0] || null, [result]);
  const updateView = (next: View) => { setPage(0); setView(next); };
  return <>
    <div className="page-title">
      <div className="eyebrow">Football personnel desk / source-listed context</div>
      <h1>See the roster<br /><em>before kickoff.</em></h1>
      <p>Search the attributed season roster, recruiting commitment and team-talent releases together. Stable source IDs and receipt clocks stay visible so personnel context can inform a question without becoming an eligibility or transfer ruling.</p>
      <div className="hero-actions"><Link className="button" href="/football/matchups/">Open matchup preparation ↗</Link><Link className="hero-link" href="/football/source-stats/">Inspect every raw source field →</Link></div>
    </div>
    <div className="strip"><div><strong>{result?.total.toLocaleString() ?? "—"}</strong><span>{labels[view]} in view</span></div><div><strong>{meta?.seasons.length || "—"}</strong><span>Source seasons</span></div><div><strong>{meta?.datasets.filter((item) => item.season === Number(season)).reduce((sum, item) => sum + item.rows, 0).toLocaleString() || "—"}</strong><span>Selected-season personnel rows</span></div><div><strong>{selectedReceipt ? date(selectedReceipt.fetched_at) : "—"}</strong><span>Source retrieval clock</span></div></div>
    <div className="toolbar">
      <label className="control"><span>PERSONNEL VIEW</span><select value={view} onChange={(event) => updateView(event.target.value as View)}>{Object.entries(labels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
      <label className="control"><span>SEASON</span><select value={season} onChange={(event) => { setPage(0); setSeason(event.target.value); }}>{(meta?.seasons || [2026]).map((item) => <option key={item} value={item}>{item}{item === 2026 ? " · current source" : ""}</option>)}</select></label>
      <label className="control"><span>PLAYER, PROGRAM OR SOURCE FIELD</span><input type="search" maxLength={100} value={query} placeholder="Search literal source text" onChange={(event) => { setPage(0); setQuery(event.target.value); }} /></label>
      <label className="control"><span>TEAM ID</span><input inputMode="numeric" pattern="[0-9]*" maxLength={15} value={team} placeholder="Optional ID" onChange={(event) => { setPage(0); setTeam(event.target.value.replace(/\D/g, "")); }} /></label>
    </div>
    {selectedReceipt && <details className="paper-panel" style={{ marginBottom: 22 }} open><summary><strong>{labels[view]} source receipt</strong> · {date(selectedReceipt.fetched_at)}</summary><p className="note" style={{ marginTop: 14 }}>SportsDataverse release: <a href={selectedReceipt.url} target="_blank" rel="noreferrer">open source ↗</a> · SHA-256 <span className="mono">{selectedReceipt.sha256.slice(0, 20)}…</span></p></details>}
    <p className="note">These records are source-listed personnel context. A roster row does not prove current eligibility, a commitment does not establish enrollment, and missing records do not prove a departure. Recruiting grades and stars are shown only when the attributed release supplies them.</p>
    {error ? <div className="status-error" role="alert"><span>{error}</span><button className="button secondary" type="button" onClick={() => { setError(""); setRetry((current) => current + 1); }}>Retry football recruiting</button></div> : !result ? <p className="empty" role="status">Loading football recruiting records…</p> : <>
      <div className="section-heading" style={{ marginBottom: 20 }}><p>{result.total.toLocaleString()} matching rows · page {page + 1} of {Math.max(1, Math.ceil(result.total / result.page_size))}</p><Link className="hero-link" href={`/football/source-stats/?dataset=${encodeURIComponent(result.dataset)}&season=${result.season}`}>Open raw dataset browser →</Link></div>
      <div className="table-scroll"><table className="data-table"><thead><tr>{view === "rosters" ? <><th>Player</th><th>Program</th><th>Position</th><th>Experience</th><th>Status</th><th>Listed size</th></> : view === "recruits" ? <><th>Recruit</th><th>Program</th><th>Position</th><th>Stars</th><th>Grade</th></> : view === "talent" ? <><th>Program</th><th>Talent composite</th><th>Talent rank</th><th>Blue-chip ratio</th><th>Recruit count</th></> : <><th>Program</th><th>Offense returning</th><th>Defense returning</th><th>Overall returning</th><th>Returning players</th><th>Estimated</th></>}</tr></thead><tbody>{result.rows.map((row) => <tr key={`${row.record_key}-${row.id || row.team_id}`}>
        {view === "rosters" && <><th scope="row">{row.id ? <Link href={`/football/player/?id=${encodeURIComponent(String(row.id))}&season=${result.season}`}>{value(row, "name")}</Link> : value(row, "name")}<small>{row.id ? `Athlete ${row.id}` : "No stable athlete ID"}</small></th><td>{value(row, "team")}</td><td>{value(row, "position")}</td><td>{value(row, "experience")}</td><td>{value(row, "status")}{row.active != null && <small>{row.active ? "Active flag" : "Inactive flag"}</small>}</td><td>{row.height == null && row.weight == null ? "—" : `${row.height == null ? "—" : `${fmt(Number(row.height), 0)} in`} · ${row.weight == null ? "—" : `${fmt(Number(row.weight), 0)} lb`}`}</td></>}
        {view === "recruits" && <><th scope="row">{value(row, "name")}<small>{value(row, "id") === "—" ? "No recruit ID" : `Recruit ${value(row, "id")}`}</small></th><td>{value(row, "team")}</td><td>{value(row, "position")}</td><td className="numeric">{value(row, "stars")}</td><td className="numeric">{row.grade == null ? "—" : fmt(Number(row.grade), 2)}</td></>}
        {view === "talent" && <><th scope="row"><Link href={`/football/matchups/?team=${encodeURIComponent(String(row.team || row.team_id || ""))}`}>{value(row, "team")}</Link><small>Team {value(row, "team_id")}</small></th><td className="numeric">{row.talent_composite == null ? "—" : fmt(Number(row.talent_composite), 1)}</td><td className="numeric">{value(row, "talent_rank")}</td><td className="numeric">{percent(row.blue_chip_ratio)}</td><td className="numeric">{value(row, "n_recruits")}</td></>}
        {view === "returning" && <><th scope="row"><Link href={`/football/matchups/?team=${encodeURIComponent(String(row.team || row.team_id || ""))}`}>{value(row, "team")}</Link><small>Team {value(row, "team_id")}</small></th><td className="numeric">{percent(row.off_returning)}</td><td className="numeric">{percent(row.def_returning)}</td><td className="numeric">{percent(row.overall_returning)}</td><td className="numeric">{value(row, "n_returning")}</td><td>{row.is_estimated == null ? "—" : row.is_estimated ? "Yes" : "No"}</td></>}
      </tr>)}</tbody></table></div>
      {!result.rows.length && <p className="empty">No source rows match these filters.</p>}
      <div className="pagination"><span>{result.total.toLocaleString()} rows · values remain attributable to the release</span><div><button className="button secondary" disabled={!page} onClick={() => setPage(page - 1)}>← Previous</button><button className="button secondary" disabled={(page + 1) * result.page_size >= result.total} onClick={() => setPage(page + 1)}>Next →</button></div></div>
    </>}
    <section className="section paper-panel"><div className="eyebrow">Read the boundary</div><h2>Personnel context is a source question.</h2><p>The roster and recruiting releases come from the SportsDataverse college-football pipeline and preserve the upstream IDs, raw fields and receipt hash. They are useful for asking which units changed, which programs retain production and where to review a commitment record. They do not establish eligibility, transfer completion, depth-chart order or a future forecast input.</p><p><Link href="/research/coverage/">Review coverage and source clocks →</Link> · <Link href="/football/learn/">Read the football field guide →</Link></p></section>
  </>;
}
