"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Prospect = {
  athlete_id: string;
  name: string;
  position: string | null;
  grade: number | null;
  rank: number | null;
  position_rank: number | null;
  state_rank: number | null;
  region_rank: number | null;
  status: string | null;
  committed_team_name: string | null;
  high_school: string | null;
  hometown: string | null;
  height_inches: number | null;
  weight_pounds: number | null;
  source_url: string;
};
type Result = {
  total: number;
  page: number;
  page_size: number;
  cohort?: { committed: number; ranked: number; graded: number };
  position_breakdown?: Array<{ position: string; total: number }>;
  edition: string | null;
  captured_at: string | null;
  rows: Prospect[];
  source?: { provider: string; methodology: string };
  unavailable_reason?: string;
};
type ClassSnapshot = Pick<Result, "total" | "cohort" | "captured_at" | "position_breakdown"> & { season: string };

const number = (value: number | null, digits = 0) => value == null ? "—" : value.toFixed(digits);
const grade = (value: number | null) => value == null || value <= 0 ? "—" : number(value);
const size = (height: number | null, weight: number | null) => {
  const heightLabel = height == null || height <= 0
    ? null
    : `${Math.floor(height / 12)}'${Math.round(height % 12)}"`;
  const weightLabel = weight == null || weight <= 0 ? null : `${Math.round(weight)} lb`;
  return [heightLabel, weightLabel].filter(Boolean).join(" · ") || "—";
};

export default function EspnRecruitingBoard() {
  const [season, setSeason] = useState("2027");
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState("");
  const [committed, setCommitted] = useState("all");
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [classSnapshots, setClassSnapshots] = useState<ClassSnapshot[]>([]);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("q");
    const requestedSeason = params.get("season");
    if (requestedSeason === "2026" || requestedSeason === "2027" || requestedSeason === "2028") setSeason(requestedSeason);
    if (requested) setQuery(requested);
    const requestedPosition = params.get("position");
    const normalizedPosition = requestedPosition?.toUpperCase();
    if (normalizedPosition && ["PG", "SG", "SF", "PF", "C"].includes(normalizedPosition)) setPosition(normalizedPosition);
    const requestedCommitted = params.get("committed");
    if (requestedCommitted === "yes" || requestedCommitted === "no") setCommitted(requestedCommitted);
    const requestedPage = Number(params.get("page"));
    if (Number.isInteger(requestedPage) && requestedPage >= 0) setPage(Math.min(requestedPage, 1000));
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    const params = new URLSearchParams();
    if (season !== "2027") params.set("season", season);
    if (query.trim()) params.set("q", query.trim());
    if (position) params.set("position", position);
    if (committed !== "all") params.set("committed", committed);
    if (page > 0) params.set("page", String(page));
    const search = params.toString();
    window.history.replaceState(window.history.state, "", search ? `${window.location.pathname}?${search}` : window.location.pathname);
    setCopied("");
  }, [committed, hydrated, page, position, query, season]);
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied("Recruiting board link copied.");
    } catch {
      setCopied("Copy the filtered URL from your address bar.");
    }
  };
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ season, page: String(page), committed });
    if (query.trim()) params.set("q", query.trim());
    if (position) params.set("position", position);
    setError("");
    fetch(`/api/basketball/research/recruiting-rankings?${params}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("The ESPN prospect release is unavailable.");
        return response.json() as Promise<Result>;
      })
      .then((value) => { if (!controller.signal.aborted) setResult(value); })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "The ESPN prospect release is unavailable.");
        }
      });
    return () => controller.abort();
  }, [committed, page, position, query, season]);
  useEffect(() => {
    const controller = new AbortController();
    Promise.allSettled(["2026", "2027", "2028"].map(async (classYear) => {
      const response = await fetch(`/api/basketball/research/recruiting-rankings?season=${classYear}&page=0&committed=all`, { signal: controller.signal });
      if (!response.ok) throw new Error("class snapshot unavailable");
      const value = await response.json() as Result;
      if (value.unavailable_reason) throw new Error(value.unavailable_reason);
      return { season: classYear, total: value.total, cohort: value.cohort, captured_at: value.captured_at, position_breakdown: value.position_breakdown } satisfies ClassSnapshot;
    })).then((settled) => {
      if (controller.signal.aborted) return;
      setClassSnapshots(settled.flatMap((item) => item.status === "fulfilled" ? [item.value] : []).sort((a, b) => a.season.localeCompare(b.season)));
    });
    return () => controller.abort();
  }, []);
  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.page_size)) : 1;
  return (
    <section className="section">
      <div className="section-heading">
        <div>
          <div className="eyebrow">National prospect board / ESPN source</div>
          <h2>{season} recruiting rankings.</h2>
        </div>
        <p>Search the source-ranked class, inspect commitment status and open the original ESPN prospect card. Ranking and grade are source fields, not eligibility or a Silvermine scouting grade.</p>
      </div>
      <div className="toolbar">
        <label className="control"><span>CLASS</span><select value={season} onChange={(event) => { setSeason(event.target.value); setPage(0); }}><option value="2026">2026</option><option value="2027">2027</option><option value="2028">2028</option></select></label>
        <label className="control"><span>SEARCH</span><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="Prospect, school or hometown" /></label>
        <label className="control"><span>POSITION</span><select value={position} onChange={(event) => { setPosition(event.target.value); setPage(0); }}><option value="">All positions</option><option value="PG">PG</option><option value="SG">SG</option><option value="SF">SF</option><option value="PF">PF</option><option value="C">C</option></select></label>
        <label className="control"><span>STATUS</span><select value={committed} onChange={(event) => { setCommitted(event.target.value); setPage(0); }}><option value="all">All statuses</option><option value="yes">Committed</option><option value="no">Undecided / other</option></select></label>
        <button className="button secondary" type="button" onClick={share}>Copy board link</button>
      </div>
      {classSnapshots.length > 0 && <div className="recruiting-class-strip" aria-label="Recruiting class comparison">
        <div className="eyebrow">Class comparison / same ESPN release</div>
        <div className="recruiting-class-grid">
          {classSnapshots.map((snapshot) => <button
            className={`recruiting-class-card${snapshot.season === season ? " is-active" : ""}`}
            type="button"
            key={snapshot.season}
            aria-pressed={snapshot.season === season}
            onClick={() => { setSeason(snapshot.season); setPage(0); }}
          >
            <strong>{snapshot.season}</strong>
            <span>{snapshot.total.toLocaleString()} prospects · {(snapshot.cohort?.committed ?? 0).toLocaleString()} committed</span>
            <small>{(snapshot.cohort?.ranked ?? 0).toLocaleString()} ranked · {(snapshot.cohort?.graded ?? 0).toLocaleString()} graded</small>
            <small>{(snapshot.position_breakdown || []).map((item) => `${item.position} ${item.total}`).join(" · ") || "Position unavailable"}</small>
          </button>)}
        </div>
      </div>}
      {copied && <p className="note" role="status">{copied}</p>}
      {error ? <p className="status-error" role="alert">{error}</p> : !result ? <p className="empty" role="status">Loading source-ranked prospects…</p> : result.unavailable_reason ? <p className="empty">{result.unavailable_reason}</p> : (
        <>
          <div className="strip" style={{ marginBottom: 24 }}>
            <div><strong>{result.total.toLocaleString()}</strong><span>Matching prospects</span></div>
            <div><strong>{(result.cohort?.committed ?? 0).toLocaleString()}</strong><span>Committed in cohort</span></div>
            <div><strong>{(result.cohort?.ranked ?? 0).toLocaleString()}</strong><span>With source rank</span></div>
            <div><strong>{(result.cohort?.graded ?? 0).toLocaleString()}</strong><span>With source grade</span></div>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <caption className="sr-only">ESPN {season} basketball recruiting prospects</caption>
              <thead><tr><th>Rank</th><th>Prospect</th><th>Position ranks</th><th>Grade</th><th>Size</th><th>Commitment</th><th>Origin</th><th>Source</th></tr></thead>
              <tbody>{result.rows.map((row) => <tr key={row.athlete_id}>
                <td>{number(row.rank)}</td>
                <td><Link href={`/basketball/recruiting/prospect/?season=${season}&id=${row.athlete_id}`}><strong>{row.name}</strong></Link><br /><span className="note">{row.high_school || "High school not listed"}</span></td>
                <td>{row.position || "—"}<br /><span className="note">Pos #{number(row.position_rank)}</span><br /><span className="note">State #{number(row.state_rank)} · Region #{number(row.region_rank)}</span></td>
                <td>{grade(row.grade)}</td>
                <td>{size(row.height_inches, row.weight_pounds)}</td>
                <td>{row.committed_team_name || row.status || "—"}</td>
                <td>{row.hometown || "—"}</td>
                <td><a className="text-link" href={row.source_url} target="_blank" rel="noreferrer">ESPN ↗</a></td>
              </tr>)}</tbody>
            </table>
          </div>
          <div className="pagination" aria-label="Prospect board pages">
            <span className="note">{result.total.toLocaleString()} matching prospects · page {page + 1} of {totalPages}</span>
            <button className="button secondary" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</button>
            <button className="button secondary" disabled={page + 1 >= totalPages} onClick={() => setPage((value) => Math.min(totalPages - 1, value + 1))}>Next</button>
          </div>
          <p className="section-note">Source edition captured {result.captured_at ? new Date(result.captured_at).toLocaleString() : "—"}. ESPN rank, grade and status remain attributed source evidence; they do not establish a roster spot, transfer date or NCAA eligibility.</p>
        </>
      )}
    </section>
  );
}
