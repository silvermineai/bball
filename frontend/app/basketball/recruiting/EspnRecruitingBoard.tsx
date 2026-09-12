"use client";

import { useEffect, useState } from "react";

type Prospect = {
  athlete_id: string;
  name: string;
  position: string | null;
  grade: number | null;
  rank: number | null;
  position_rank: number | null;
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
  edition: string | null;
  captured_at: string | null;
  rows: Prospect[];
  source?: { provider: string; methodology: string };
  unavailable_reason?: string;
};

const number = (value: number | null, digits = 0) => value == null ? "—" : value.toFixed(digits);

export default function EspnRecruitingBoard() {
  const [season, setSeason] = useState("2027");
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState("");
  const [committed, setCommitted] = useState("all");
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
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
      </div>
      {error ? <p className="status-error" role="alert">{error}</p> : !result ? <p className="empty" role="status">Loading source-ranked prospects…</p> : result.unavailable_reason ? <p className="empty">{result.unavailable_reason}</p> : (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <caption className="sr-only">ESPN 2027 basketball recruiting prospects</caption>
              <thead><tr><th>Rank</th><th>Prospect</th><th>Pos</th><th>Grade</th><th>Commitment</th><th>Origin</th><th>Source</th></tr></thead>
              <tbody>{result.rows.map((row) => <tr key={row.athlete_id}>
                <td>{number(row.rank)}</td>
                <td><strong>{row.name}</strong><br /><span className="note">{row.high_school || "High school not listed"}</span></td>
                <td>{row.position || "—"}<br /><span className="note">#{number(row.position_rank)}</span></td>
                <td>{number(row.grade)}</td>
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
