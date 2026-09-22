"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { date, fmt } from "../../_lib/format";
import { downloadCsv } from "../../_lib/csv";
import { footballRecruitingCsv, type FootballRecruitingView } from "../../_lib/football-recruiting-export";
import {
  footballRecruitingDivisionParam,
  parseFootballRecruitingDivision,
  type FootballRecruitingDivision,
} from "../../_lib/football-recruiting-scope";

type View = "rosters" | "recruits" | "talent" | "returning";
type Division = FootballRecruitingDivision;
type Receipt = { dataset: string; season: number; fetched_at: string; sha256: string };
type Meta = { seasons: number[]; datasets: Array<{ dataset: string; season: number; rows: number }>; receipts: Receipt[]; views: Array<{ view: View; dataset: string; label: string }>; coverage?: { completeness: "not_established"; note: string } };
type Row = Record<string, unknown> & { id?: string | null; team_id?: string | null; division?: string | null; raw?: Record<string, unknown>; record_key?: string };
type Result = {
  view: View;
  label: string;
  dataset: string;
  season: number;
  page: number;
  page_size: number;
  total: number;
  source_receipts: Receipt[];
  division_scope?: { requested: Division; source: string; note: string };
  summary?: {
    total: number;
    programs: number;
    graded: number;
    average_grade: number | null;
    star_counts: { five: number; four: number; three: number; two_or_less: number; unavailable: number };
  };
  position_summary?: {
    total: number;
    reconciles: boolean;
    rows: Array<{
      position: string | null;
      total: number;
      graded: number;
      average_grade: number | null;
      star_counts: { five: number; four: number; three: number; two_or_less: number; unavailable: number };
    }>;
  };
  program_summary?: {
    total: number;
    reconciles: boolean;
    rows: Array<{
      team_id: string | null;
      team: string | null;
      division: string | null;
      conference: string | null;
      total: number;
      graded: number;
      average_grade: number | null;
      star_counts: { five: number; four: number; three: number; two_or_less: number; unavailable: number };
    }>;
  };
  rows: Row[];
};

const labels: Record<View, string> = {
  rosters: "Season rosters",
  recruits: "Recruiting commitments",
  talent: "Team talent",
  returning: "Returning production",
};
const divisionLabels: Record<Division, string> = { all: "All divisions", fbs: "FBS", fcs: "FCS", d2: "Division II", d3: "Division III", naia: "NAIA", unknown: "Division unavailable" };
const percent = (value: unknown) => typeof value === "number" ? `${fmt(value * 100, 1)}%` : "—";
const value = (row: Row, key: string) => row[key] == null ? "—" : String(row[key]);

export default function RecruitingDesk() {
  const [view, setView] = useState<View>("rosters");
  const [season, setSeason] = useState("2026");
  const [query, setQuery] = useState("");
  const [team, setTeam] = useState("");
  const [division, setDivision] = useState<Division>("all");
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
    setDivision(parseFootballRecruitingDivision(params.get("division")));
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
    const divisionParam = footballRecruitingDivisionParam(division);
    if (divisionParam == null) url.searchParams.delete("division"); else url.searchParams.set("division", divisionParam);
    if (page) url.searchParams.set("page", String(page)); else url.searchParams.delete("page");
    window.history.replaceState(window.history.state, "", url);
  }, [division, hydrated, meta, page, query, season, team, view]);
  useEffect(() => {
    if (!meta) return;
    const controller = new AbortController();
    setResult(null);
    setError("");
    const params = new URLSearchParams({ view, season, page: String(page), limit: "40" });
    if (query.trim()) params.set("q", query.trim());
    if (team.trim()) params.set("team", team.trim());
    if (division !== "all") params.set("division", division);
    fetch(`/api/football/recruiting?${params}`, { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error("The football recruiting records could not be loaded."); return response.json() as Promise<Result>; })
      .then((data) => { if (!controller.signal.aborted) setResult(data); })
      .catch((reason: unknown) => { if ((reason as { name?: string })?.name !== "AbortError") setError(reason instanceof Error ? reason.message : "The football recruiting records could not be loaded."); });
    return () => controller.abort();
  }, [division, meta, page, query, retry, season, team, view]);
  const selectedReceipt = useMemo(() => result?.source_receipts[0] || null, [result]);
  const updateView = (next: View) => { setPage(0); setView(next); };
  const downloadCurrentPage = () => {
    if (!result) return;
    const csv = footballRecruitingCsv(view as FootballRecruitingView, result.rows, Number(result.season));
    downloadCsv(`football-${view}-${result.season}-page-${page + 1}.csv`, csv);
  };
  return <>
    <div className="page-title">
      <div className="eyebrow">Football personnel desk / retained context</div>
      <h1>See the roster<br /><em>before kickoff.</em></h1>
      <p>Search the retained season roster, recruiting commitment and team-talent records together. Stable IDs and receipt clocks stay visible so personnel context can inform a question without becoming an eligibility or transfer ruling.</p>
      <div className="hero-actions"><Link className="button" href="/football/matchups/">Open matchup preparation ↗</Link><Link className="hero-link" href="/football/source-stats/">Inspect every raw source field →</Link></div>
    </div>
    <div className="strip"><div><strong>{result?.total.toLocaleString() ?? "—"}</strong><span>{labels[view]} in view</span></div><div><strong>{meta?.seasons.length || "—"}</strong><span>Retained seasons</span></div><div><strong>{meta?.datasets.filter((item) => item.season === Number(season)).reduce((sum, item) => sum + item.rows, 0).toLocaleString() || "—"}</strong><span>Selected-season personnel rows</span></div><div><strong>{selectedReceipt ? date(selectedReceipt.fetched_at) : "—"}</strong><span>Edition retrieval clock</span></div></div>
    {meta?.coverage && <section className="paper-panel" aria-label="Football recruiting coverage boundary" style={{ marginBottom: 22 }}><div className="section-heading" style={{ marginBottom: 10 }}><div><div className="eyebrow">Recruiting evidence boundary</div><h2>National completeness is not established.</h2></div><span className="note">Receipt-backed archive</span></div><p className="note">{meta.coverage.note} Use the view filters to inspect the actual roster, commitment, talent and returning-production rows; missing rows remain unavailable evidence.</p></section>}
    <div className="toolbar">
      <label className="control"><span>PERSONNEL VIEW</span><select value={view} onChange={(event) => updateView(event.target.value as View)}>{Object.entries(labels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
      <label className="control"><span>SEASON</span><select value={season} onChange={(event) => { setPage(0); setSeason(event.target.value); }}>{(meta?.seasons || [2026]).map((item) => <option key={item} value={item}>{item}{item === 2026 ? " · current source" : ""}</option>)}</select></label>
      <label className="control"><span>PLAYER, PROGRAM OR SOURCE FIELD</span><input type="search" maxLength={100} value={query} placeholder="Search literal source text" onChange={(event) => { setPage(0); setQuery(event.target.value); }} /></label>
      <label className="control"><span>TEAM ID</span><input inputMode="numeric" pattern="[0-9]*" maxLength={15} value={team} placeholder="Optional ID" onChange={(event) => { setPage(0); setTeam(event.target.value.replace(/\D/g, "")); }} /></label>
      <label className="control"><span>DIVISION</span><select value={division} onChange={(event) => { setPage(0); setDivision(event.target.value as Division); }}>{Object.entries(divisionLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
    </div>
    {selectedReceipt && <details className="paper-panel" style={{ marginBottom: 22 }} open><summary><strong>{labels[view]} edition receipt</strong> · {date(selectedReceipt.fetched_at)}</summary><p className="note" style={{ marginTop: 14 }}>Retained edition · SHA-256 <span className="mono">{selectedReceipt.sha256.slice(0, 20)}…</span></p></details>}
    <p className="note">These records are source-listed personnel context. A roster row does not prove current eligibility, a commitment does not establish enrollment, and missing records do not prove a departure. Recruiting grades and stars are shown only when the attributed release supplies them.</p>
    {error ? <div className="status-error" role="alert"><span>{error}</span><button className="button secondary" type="button" onClick={() => { setError(""); setRetry((current) => current + 1); }}>Retry football recruiting</button></div> : !result ? <p className="empty" role="status">Loading football recruiting records…</p> : <>
      {view === "recruits" && result.summary && <section className="paper-panel" aria-label="Recruiting class summary" style={{ marginBottom: 22 }}>
        <div className="section-heading" style={{ marginBottom: 12 }}>
          <div><div className="eyebrow">Recruiting class / active filters</div><h2>Read the class before the page.</h2></div>
          <span className="note">{result.summary.total.toLocaleString()} source rows reconciled</span>
        </div>
        <p className="note">These counts use the same season, search, team and division filters as the table. Grades and stars are retained source fields; missing values remain unavailable. No composite class score is inferred.</p>
        <div className="strip" style={{ marginBottom: 16 }}>
          <div><strong>{result.summary.total.toLocaleString()}</strong><span>Recruit records</span></div>
          <div><strong>{result.summary.programs.toLocaleString()}</strong><span>Programs represented</span></div>
          <div><strong>{result.summary.graded.toLocaleString()}</strong><span>With recorded grade</span></div>
          <div><strong>{result.summary.average_grade == null ? "—" : fmt(result.summary.average_grade, 1)}</strong><span>Average recorded grade</span></div>
        </div>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Recorded star band</th><th className="numeric">Recruit records</th><th className="numeric">Share</th></tr></thead><tbody>
          {([
            ["5 stars", result.summary.star_counts.five],
            ["4 stars", result.summary.star_counts.four],
            ["3 stars", result.summary.star_counts.three],
            ["2 or fewer", result.summary.star_counts.two_or_less],
            ["Stars unavailable", result.summary.star_counts.unavailable],
          ] as const).map(([label, count]) => <tr key={label}><th scope="row">{label}</th><td className="numeric"><strong>{count.toLocaleString()}</strong></td><td className="numeric">{result.summary!.total > 0 ? `${((count / result.summary!.total) * 100).toFixed(1)}%` : "—"}</td></tr>)}
        </tbody></table></div>
        <p className="note" style={{ marginTop: 12 }}>A record count describes the retained recruiting release. It does not establish enrollment, eligibility, playing time or a program&apos;s future roster strength.</p>
      </section>}
      {view === "recruits" && result.position_summary && <section className="paper-panel" aria-label="Recruiting class position summary" style={{ marginBottom: 22 }}>
        <div className="section-heading" style={{ marginBottom: 12 }}>
          <div><div className="eyebrow">Position room / active filters</div><h2>See where the class is concentrated.</h2></div>
          <span className="note">{result.position_summary.total.toLocaleString()} source rows grouped</span>
        </div>
        <p className="note">Position labels, grades and stars are grouped exactly as recorded in the same release and filter set as the class summary. Blank positions stay in an unavailable bucket; no role is inferred from a player name or listed size.</p>
        {result.position_summary.reconciles ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Recorded position</th><th className="numeric">Recruits</th><th className="numeric">Grade coverage</th><th className="numeric">Average grade</th><th className="numeric">5★</th><th className="numeric">4★</th><th className="numeric">3★</th><th className="numeric">Stars unavailable</th></tr></thead><tbody>
          {result.position_summary.rows.map((row) => <tr key={row.position || "position-unavailable"}>
            <th scope="row">{row.position || "Position unavailable"}</th>
            <td className="numeric"><strong>{row.total.toLocaleString()}</strong></td>
            <td className="numeric">{row.total > 0 ? `${((row.graded / row.total) * 100).toFixed(1)}%` : "—"}</td>
            <td className="numeric">{row.average_grade == null ? "—" : fmt(row.average_grade, 1)}</td>
            <td className="numeric">{row.star_counts.five.toLocaleString()}</td>
            <td className="numeric">{row.star_counts.four.toLocaleString()}</td>
            <td className="numeric">{row.star_counts.three.toLocaleString()}</td>
            <td className="numeric">{row.star_counts.unavailable.toLocaleString()}</td>
          </tr>)}
        </tbody></table></div> : <p className="empty" role="status">Position groups are withheld because their row count does not reconcile to this class edition.</p>}
        <p className="note" style={{ marginTop: 12 }}>This is a source distribution, not a depth chart or positional need score. “Position unavailable” means only that the release did not supply a usable label.</p>
      </section>}
      {view === "recruits" && result.program_summary && <section className="paper-panel" aria-label="Recruiting class program summary" style={{ marginBottom: 22 }}>
        <div className="section-heading" style={{ marginBottom: 12 }}>
          <div><div className="eyebrow">Program class board / active filters</div><h2>Compare the recorded classes.</h2></div>
          <span className="note">{result.program_summary.total.toLocaleString()} source rows grouped</span>
        </div>
        <p className="note">Programs are grouped by the exact team ID and team label retained on each recruiting row. Grade averages and star bands use only supplied source values; a missing team ID, division, grade or star value remains unavailable. This is a source summary, not a composite class ranking or a forecast of roster strength.</p>
        {result.program_summary.reconciles ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Program</th><th>Division</th><th>Conference</th><th className="numeric">Recruits</th><th className="numeric">Grade coverage</th><th className="numeric">Average grade</th><th className="numeric">5★</th><th className="numeric">4★</th><th className="numeric">3★</th><th className="numeric">Stars unavailable</th></tr></thead><tbody>
          {result.program_summary.rows.map((row, index) => <tr key={`${row.team_id || "team-unavailable"}-${row.team || "label-unavailable"}-${index}`}>
            <th scope="row">{row.team_id ? <Link href={`/football/matchups/?team=${encodeURIComponent(row.team_id)}`}>{row.team || row.team_id} →</Link> : row.team || "Team unavailable"}<small>{row.team_id ? `Team ${row.team_id}` : "No stable team ID"}</small></th>
            <td>{row.division || "—"}</td>
            <td>{row.conference || "—"}</td>
            <td className="numeric"><strong>{row.total.toLocaleString()}</strong></td>
            <td className="numeric">{row.total > 0 ? `${((row.graded / row.total) * 100).toFixed(1)}%` : "—"}</td>
            <td className="numeric">{row.average_grade == null ? "—" : fmt(row.average_grade, 1)}</td>
            <td className="numeric">{row.star_counts.five.toLocaleString()}</td>
            <td className="numeric">{row.star_counts.four.toLocaleString()}</td>
            <td className="numeric">{row.star_counts.three.toLocaleString()}</td>
            <td className="numeric">{row.star_counts.unavailable.toLocaleString()}</td>
          </tr>)}
        </tbody></table></div> : <p className="empty" role="status">Program groups are withheld because their row count does not reconcile to this class edition.</p>}
        <p className="note" style={{ marginTop: 12 }}>Rows are ordered by recorded recruit count. Read grade coverage beside every average; a high average built from a small or partially graded class is not treated as a ranking.</p>
      </section>}
      <div className="section-heading" style={{ marginBottom: 20 }}><p>{result.total.toLocaleString()} matching rows · page {page + 1} of {Math.max(1, Math.ceil(result.total / result.page_size))}</p><div className="button-row"><button className="button secondary" type="button" onClick={downloadCurrentPage}>Download page CSV ↓</button><Link className="hero-link" href={`/football/source-stats/?dataset=${encodeURIComponent(result.dataset)}&season=${result.season}`}>Open raw dataset browser →</Link></div></div>
      <p className="note">{result.division_scope?.note || "Division is shown only when the source row or exact season/team directory supplies it."}</p>
      <div className="table-scroll"><table className="data-table"><thead><tr>{view === "rosters" ? <><th>Player</th><th>Program</th><th>Division</th><th>Position</th><th>Experience</th><th>Status</th><th>Listed size</th></> : view === "recruits" ? <><th>Recruit</th><th>Program</th><th>Division</th><th>Position</th><th>Stars</th><th>Grade</th></> : view === "talent" ? <><th>Program</th><th>Division</th><th>Talent composite</th><th>Talent rank</th><th>Blue-chip ratio</th><th>Recruit count</th></> : <><th>Program</th><th>Division</th><th>Offense returning</th><th>Defense returning</th><th>Overall returning</th><th>Returning players</th><th>Estimated</th></>}</tr></thead><tbody>{result.rows.map((row) => <tr key={`${row.record_key}-${row.id || row.team_id}`}>
        {view === "rosters" && <><th scope="row">{row.id ? <Link href={`/football/player/?id=${encodeURIComponent(String(row.id))}&season=${result.season}`}>{value(row, "name")}</Link> : value(row, "name")}<small>{row.id ? `Athlete ${row.id}` : "No stable athlete ID"}</small></th><td>{value(row, "team")}</td><td>{value(row, "division")}</td><td>{value(row, "position")}</td><td>{value(row, "experience")}</td><td>{value(row, "status")}{row.active != null && <small>{row.active ? "Active flag" : "Inactive flag"}</small>}</td><td>{row.height == null && row.weight == null ? "—" : `${row.height == null ? "—" : `${fmt(Number(row.height), 0)} in`} · ${row.weight == null ? "—" : `${fmt(Number(row.weight), 0)} lb`}`}</td></>}
        {view === "recruits" && <><th scope="row">{value(row, "name")}<small>{value(row, "id") === "—" ? "No recruit ID" : `Recruit ${value(row, "id")}`}</small></th><td>{value(row, "team")}</td><td>{value(row, "division")}</td><td>{value(row, "position")}</td><td className="numeric">{value(row, "stars")}</td><td className="numeric">{row.grade == null ? "—" : fmt(Number(row.grade), 2)}</td></>}
        {view === "talent" && <><th scope="row"><Link href={`/football/matchups/?team=${encodeURIComponent(String(row.team || row.team_id || ""))}`}>{value(row, "team")}</Link><small>Team {value(row, "team_id")}</small></th><td>{value(row, "division")}</td><td className="numeric">{row.talent_composite == null ? "—" : fmt(Number(row.talent_composite), 1)}</td><td className="numeric">{value(row, "talent_rank")}</td><td className="numeric">{percent(row.blue_chip_ratio)}</td><td className="numeric">{value(row, "n_recruits")}</td></>}
        {view === "returning" && <><th scope="row"><Link href={`/football/matchups/?team=${encodeURIComponent(String(row.team || row.team_id || ""))}`}>{value(row, "team")}</Link><small>Team {value(row, "team_id")}</small></th><td>{value(row, "division")}</td><td className="numeric">{percent(row.off_returning)}</td><td className="numeric">{percent(row.def_returning)}</td><td className="numeric">{percent(row.overall_returning)}</td><td className="numeric">{value(row, "n_returning")}</td><td>{row.is_estimated == null ? "—" : row.is_estimated ? "Yes" : "No"}</td></>}
      </tr>)}</tbody></table></div>
      {!result.rows.length && <p className="empty">No source rows match these filters.</p>}
      <div className="pagination"><span>{result.total.toLocaleString()} rows · values remain attributable to the release</span><div><button className="button secondary" disabled={!page} onClick={() => setPage(page - 1)}>← Previous</button><button className="button secondary" disabled={(page + 1) * result.page_size >= result.total} onClick={() => setPage(page + 1)}>Next →</button></div></div>
    </>}
    <section className="section paper-panel"><div className="eyebrow">Personnel data</div><h2>Roster context with a clear boundary.</h2><p>The roster and recruiting records preserve stable IDs, raw fields and capture times. Use the table to see which units changed, which programs retain production and where to review a commitment record. These rows do not establish eligibility, transfer completion, depth-chart order or a future forecast input.</p><p><Link href="/research/coverage/">Review coverage and capture times →</Link> · <Link href="/football/learn/">Read the football field guide →</Link></p></section>
  </>;
}
