"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { downloadCsv, toCsv } from "../../_lib/csv";

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
  committed_team_id: string | null;
  committed_team_name: string | null;
  high_school: string | null;
  hometown: string | null;
  height_inches: number | null;
  weight_pounds: number | null;
  source_url: string;
  previous_rank?: number | null;
  previous_captured_at?: string | null;
};
type Result = {
  total: number;
  page: number;
  page_size: number;
  cohort?: { committed: number; ranked: number; graded: number };
  position_breakdown?: Array<{ position: string; total: number }>;
  commitment_destinations?: Array<{ team_id: string | null; team: string; total: number; ranked_total: number; top100_total: number; best_rank: number | null; average_rank: number | null; position_breakdown?: Array<{ position: string; total: number }> }>;
  rank_movement?: { total: number; new_to_release: number; moved_up: number; moved_down: number; unchanged: number; rank_unavailable: number };
  edition: string | null;
  captured_at: string | null;
  rows: Prospect[];
  source?: { provider: string; methodology: string };
  unavailable_reason?: string;
};
type ClassSnapshot = Pick<Result, "total" | "cohort" | "captured_at" | "position_breakdown" | "commitment_destinations"> & { season: string };

const number = (value: number | null, digits = 0) => value == null ? "—" : value.toFixed(digits);
const grade = (value: number | null) => value == null || value <= 0 ? "—" : number(value);
const size = (height: number | null, weight: number | null) => {
  const heightLabel = height == null || height <= 0
    ? null
    : `${Math.floor(height / 12)}'${Math.round(height % 12)}"`;
  const weightLabel = weight == null || weight <= 0 ? null : `${Math.round(weight)} lb`;
  return [heightLabel, weightLabel].filter(Boolean).join(" · ") || "—";
};
const rate = (part: number, total: number) => total > 0 ? `${((part / total) * 100).toFixed(0)}%` : "—";

export default function EspnRecruitingBoard() {
  const [season, setSeason] = useState("2027");
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState("");
  const [rankMax, setRankMax] = useState("");
  const [committed, setCommitted] = useState("all");
  const [movement, setMovement] = useState("all");
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [classSnapshots, setClassSnapshots] = useState<ClassSnapshot[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("q");
    const requestedSeason = params.get("season");
    if (requestedSeason === "2026" || requestedSeason === "2027" || requestedSeason === "2028" || requestedSeason === "2029" || requestedSeason === "2030") setSeason(requestedSeason);
    if (requested) setQuery(requested);
    const requestedPosition = params.get("position");
    const normalizedPosition = requestedPosition?.toUpperCase();
    if (normalizedPosition && ["PG", "SG", "SF", "PF", "C"].includes(normalizedPosition)) setPosition(normalizedPosition);
    const requestedRank = params.get("rank");
    if (requestedRank && ["25", "50", "100", "250"].includes(requestedRank)) setRankMax(requestedRank);
    const requestedCommitted = params.get("committed");
    if (requestedCommitted === "yes" || requestedCommitted === "no") setCommitted(requestedCommitted);
    const requestedMovement = params.get("movement");
    if (requestedMovement && ["up", "down", "unchanged", "new", "unavailable"].includes(requestedMovement)) setMovement(requestedMovement);
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
    if (rankMax) params.set("rank", rankMax);
    if (committed !== "all") params.set("committed", committed);
    if (movement !== "all") params.set("movement", movement);
    if (page > 0) params.set("page", String(page));
    const search = params.toString();
    window.history.replaceState(window.history.state, "", search ? `${window.location.pathname}?${search}` : window.location.pathname);
    setCopied("");
  }, [committed, hydrated, movement, page, position, query, rankMax, season]);
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied("Recruiting board link copied.");
    } catch {
      setCopied("Copy the filtered URL from your address bar.");
    }
  };
  const exportHeaders = ["season", "rank", "previous_rank", "rank_change", "previous_captured_at", "name", "position", "grade", "position_rank", "state_rank", "region_rank", "height_inches", "weight_pounds", "committed_team", "committed_team_id", "status", "high_school", "hometown", "athlete_id", "source_url"];
  const exportRow = (row: Prospect) => [season, row.rank, row.previous_rank, row.rank == null || row.previous_rank == null ? null : row.previous_rank - row.rank, row.previous_captured_at, row.name, row.position, row.grade, row.position_rank, row.state_rank, row.region_rank, row.height_inches, row.weight_pounds, row.committed_team_name, row.committed_team_id, row.status, row.high_school, row.hometown, row.athlete_id, row.source_url];
  const downloadPage = () => {
    if (!result) return;
    downloadCsv(`espn-recruiting-${season}-page-${page + 1}.csv`, toCsv(exportHeaders, result.rows.map(exportRow)));
    setExportMessage(`Downloaded ${result.rows.length.toLocaleString()} prospects from this page.`);
  };
  const downloadAll = async () => {
    if (!result || exporting) return;
    setExporting(true);
    setExportMessage(`Preparing 0 of ${result.total.toLocaleString()} prospects…`);
    try {
      const all: Prospect[] = [];
      const pages = Math.max(1, Math.ceil(result.total / result.page_size));
      for (let requestedPage = 0; requestedPage < pages; requestedPage += 1) {
        const params = new URLSearchParams({ season, page: String(requestedPage), committed, movement });
        if (query.trim()) params.set("q", query.trim());
        if (position) params.set("position", position);
        if (rankMax) params.set("rank_max", rankMax);
        const response = await fetch(`/api/basketball/research/recruiting-rankings?${params}`);
        if (!response.ok) throw new Error("The complete recruiting export could not be loaded.");
        const payload = await response.json() as Result;
        all.push(...payload.rows);
        setExportMessage(`Preparing ${all.length.toLocaleString()} of ${result.total.toLocaleString()} prospects…`);
      }
      downloadCsv(`espn-recruiting-${season}-filtered.csv`, toCsv(exportHeaders, all.map(exportRow)));
      setExportMessage(`Downloaded ${all.length.toLocaleString()} filtered prospects.`);
    } catch (reason) {
      setExportMessage(reason instanceof Error ? reason.message : "The complete recruiting export could not be loaded.");
    } finally {
      setExporting(false);
    }
  };
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ season, page: String(page), committed, movement });
    if (query.trim()) params.set("q", query.trim());
    if (position) params.set("position", position);
    if (rankMax) params.set("rank_max", rankMax);
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
  }, [committed, movement, page, position, query, rankMax, season]);
  useEffect(() => {
    const controller = new AbortController();
    Promise.allSettled(["2026", "2027", "2028", "2029", "2030"].map(async (classYear) => {
      const response = await fetch(`/api/basketball/research/recruiting-rankings?season=${classYear}&page=0&committed=all`, { signal: controller.signal });
      if (!response.ok) throw new Error("class snapshot unavailable");
      const value = await response.json() as Result;
      if (value.unavailable_reason) throw new Error(value.unavailable_reason);
      return { season: classYear, total: value.total, cohort: value.cohort, captured_at: value.captured_at, position_breakdown: value.position_breakdown, commitment_destinations: value.commitment_destinations } satisfies ClassSnapshot;
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
        <label className="control"><span>CLASS</span><select value={season} onChange={(event) => { setSeason(event.target.value); setPage(0); }}><option value="2026">2026</option><option value="2027">2027</option><option value="2028">2028</option><option value="2029">2029</option><option value="2030">2030</option></select></label>
        <label className="control"><span>SEARCH</span><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="Prospect, school or hometown" /></label>
        <label className="control"><span>POSITION</span><select value={position} onChange={(event) => { setPosition(event.target.value); setPage(0); }}><option value="">All positions</option><option value="PG">PG</option><option value="SG">SG</option><option value="SF">SF</option><option value="PF">PF</option><option value="C">C</option></select></label>
        <label className="control"><span>RANK</span><select value={rankMax} onChange={(event) => { setRankMax(event.target.value); setPage(0); }}><option value="">All source ranks</option><option value="25">Top 25</option><option value="50">Top 50</option><option value="100">Top 100</option><option value="250">Top 250</option></select></label>
        <label className="control"><span>STATUS</span><select value={committed} onChange={(event) => { setCommitted(event.target.value); setPage(0); }}><option value="all">All statuses</option><option value="yes">Committed</option><option value="no">Undecided / other</option></select></label>
        <label className="control"><span>RANK MOVEMENT</span><select value={movement} onChange={(event) => { setMovement(event.target.value); setPage(0); }}><option value="all">All movement</option><option value="up">Moved up</option><option value="down">Moved down</option><option value="unchanged">Unchanged</option><option value="new">New to archive</option><option value="unavailable">Rank unavailable</option></select></label>
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
            <span>{snapshot.total.toLocaleString()} prospects · {(snapshot.cohort?.committed ?? 0).toLocaleString()} committed ({rate(snapshot.cohort?.committed ?? 0, snapshot.total)})</span>
            <small>{(snapshot.cohort?.ranked ?? 0).toLocaleString()} ranked · {(snapshot.cohort?.graded ?? 0).toLocaleString()} graded</small>
            <small>{(snapshot.position_breakdown || []).map((item) => `${item.position} ${item.total}`).join(" · ") || "Position unavailable"}</small>
            <small>{(snapshot.commitment_destinations || []).slice(0, 3).map((item) => `${item.team} ${item.total}`).join(" · ") || "No source-listed destinations"}</small>
            <small>{snapshot.captured_at ? `Source captured ${new Date(snapshot.captured_at).toLocaleDateString()}` : "Capture date unavailable"}</small>
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
          {result.rank_movement && <section className="paper-panel recruiting-movement-panel" aria-label="ESPN rank movement">
            <div className="section-heading" style={{ marginBottom: 12 }}>
              <div><div className="eyebrow">Release-to-release movement</div><h3>See what changed in the source board.</h3></div>
              <span className="note">Compared with the latest earlier capture for each athlete</span>
            </div>
            <div className="strip">
              <div><strong>{result.rank_movement.moved_up.toLocaleString()}</strong><span>Moved up</span></div>
              <div><strong>{result.rank_movement.moved_down.toLocaleString()}</strong><span>Moved down</span></div>
              <div><strong>{result.rank_movement.unchanged.toLocaleString()}</strong><span>Unchanged</span></div>
              <div><strong>{result.rank_movement.new_to_release.toLocaleString()}</strong><span>New to archive</span></div>
            </div>
            <p className="note">A positive change means the national rank number improved (for example, 80 to 55). “New to archive” means no earlier ESPN release is retained for that exact athlete ID. Missing ranks stay unavailable.</p>
          </section>}
          <div className="button-row" style={{ marginBottom: 16 }}>
            <button className="button secondary" type="button" onClick={downloadPage}>Download page CSV ↓</button>
            <button className="button secondary" type="button" onClick={downloadAll} disabled={exporting}>{exporting ? "Preparing full CSV…" : "Download all matching CSV ↓"}</button>
          </div>
          {exportMessage && <p className="note" role="status">{exportMessage}</p>}
          {committed !== "no" && (result.commitment_destinations || []).length > 0 && <section className="paper-panel" aria-label="Recruiting commitment destinations" style={{ marginBottom: 24 }}>
            <div className="section-heading" style={{ marginBottom: 12 }}>
              <div><div className="eyebrow">Destination board / active cohort</div><h3>Where the commitments are landing.</h3></div>
              <span className="note">Top 12 destinations</span>
            </div>
            <div className="article-grid">
              {(result.commitment_destinations || []).map((destination) => <article className="article-card" key={`${destination.team_id || "unknown"}-${destination.team}`}>
                <div className="eyebrow">{destination.total === 1 ? "One commitment" : `${destination.total} commitments`}</div>
                <h3>{destination.team_id ? <Link href={`/basketball/programs/${encodeURIComponent(destination.team_id)}/`}>{destination.team} →</Link> : destination.team}</h3>
                <p>{destination.ranked_total} ranked · {destination.top100_total} top 100{destination.best_rank == null ? "" : ` · best #${destination.best_rank}`}{destination.average_rank == null ? "" : ` · avg #${destination.average_rank.toFixed(0)}`}</p>
                <small>{(destination.position_breakdown || []).map((item) => `${item.position} ${item.total}`).join(" · ") || "Position mix unavailable"}</small>
                <small>{destination.team_id ? <Link href={`/basketball/programs/${encodeURIComponent(destination.team_id)}/`}>Open program dossier →</Link> : "Program dossier unavailable for this source row."} · Source-listed {season} commitment{destination.total === 1 ? "" : "s"} in the active board filters.</small>
              </article>)}
            </div>
            <p className="note" style={{ marginTop: 12 }}>Counts use ESPN&apos;s committed team field and the same season, rank, position, search and status filters as the table. Ranked, top-100, best-rank and average-rank values use source ranks; they are source-reported destinations, not confirmation of enrollment or eligibility.</p>
          </section>}
          <div className="table-wrap">
            <table className="data-table">
              <caption className="sr-only">ESPN {season} basketball recruiting prospects</caption>
              <thead><tr><th>Rank</th><th>Movement</th><th>Prospect</th><th>Position ranks</th><th>Grade</th><th>Size</th><th>Commitment</th><th>Origin</th><th>Source</th></tr></thead>
              <tbody>{result.rows.map((row) => <tr key={row.athlete_id}>
                <td>{number(row.rank)}</td>
                <td>{!row.previous_captured_at ? <span className="note">New / —</span> : row.previous_rank == null || row.rank == null ? <span className="note">Rank unavailable<small>prior capture retained</small></span> : <span className={row.previous_rank - row.rank > 0 ? "movement-up" : row.previous_rank - row.rank < 0 ? "movement-down" : "note"}>{row.previous_rank - row.rank > 0 ? "▲" : row.previous_rank - row.rank < 0 ? "▼" : "="} {Math.abs(row.previous_rank - row.rank)} <small>from #{row.previous_rank}</small></span>}</td>
                <td><Link href={`/basketball/recruiting/prospect/?season=${season}&id=${row.athlete_id}`}><strong>{row.name}</strong></Link><br /><span className="note">{row.high_school || "High school not listed"}</span></td>
                <td>{row.position || "—"}<br /><span className="note">Pos #{number(row.position_rank)}</span><br /><span className="note">State #{number(row.state_rank)} · Region #{number(row.region_rank)}</span></td>
                <td>{grade(row.grade)}</td>
                <td>{size(row.height_inches, row.weight_pounds)}</td>
                <td>{row.committed_team_name ? row.committed_team_id ? <Link href={`/basketball/programs/${encodeURIComponent(row.committed_team_id)}/`}>{row.committed_team_name} →</Link> : row.committed_team_name : row.status || "—"}</td>
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
