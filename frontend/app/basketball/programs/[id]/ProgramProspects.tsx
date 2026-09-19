"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchJson } from "../../../_lib/fetch-json";

export type ProgramProspect = {
  athlete_id: string;
  name: string;
  position: string | null;
  rank: number | null;
  grade: number | null;
  status: string | null;
  committed_team_id: string | null;
  committed_team_name: string | null;
  school_ids?: string[];
  high_school: string | null;
  hometown: string | null;
};

export type RecruitingClass = {
  season: number;
  total: number;
  page?: number;
  page_size?: number;
  cohort?: { committed: number };
  edition: string | null;
  captured_at: string | null;
  rows: ProgramProspect[];
  unavailable_reason?: string;
};

type ProgramProspectFetcher = <T>(url: string, options?: { signal?: AbortSignal }) => Promise<T>;

const MAX_CLASS_PAGES = 1001;

function validPage(release: RecruitingClass, season: number, page: number, expected: RecruitingClass) {
  const pageSize = Number(release.page_size || expected.page_size || 50);
  return Number(release.season) === season
    && Number(release.page || 0) === page
    && Number(release.total) === Number(expected.total)
    && Number.isInteger(pageSize)
    && pageSize > 0
    && (release.edition ?? null) === (expected.edition ?? null)
    && (release.captured_at ?? null) === (expected.captured_at ?? null)
    && Array.isArray(release.rows)
    && release.rows.length <= pageSize;
}

/**
 * Load a complete exact-program class while keeping the release immutable.
 * A changed edition, malformed page, duplicate athlete ID or oversized export
 * invalidates the class rather than exposing a partial or mixed board.
 */
export async function loadProgramProspectClass(
  season: number,
  teamId: string,
  signal?: AbortSignal,
  fetcher: ProgramProspectFetcher = fetchJson,
): Promise<RecruitingClass | null> {
  const request = (page: number) =>
    `/api/basketball/research/recruiting-rankings?season=${season}&team_id=${encodeURIComponent(teamId)}&page=${page}`;
  const first = await fetcher<RecruitingClass>(request(0), { signal });
  const pageSize = Number(first.page_size || 50);
  const total = Number(first.total);
  const totalPages = Number.isInteger(total) && total >= 0 && Number.isInteger(pageSize) && pageSize > 0
    ? Math.max(1, Math.ceil(total / pageSize))
    : 0;
  if (
    first.unavailable_reason
    || !validPage(first, season, 0, first)
    || totalPages < 1
    || totalPages > MAX_CLASS_PAGES
  ) return null;

  const pages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) => fetcher<RecruitingClass>(request(index + 1), { signal })),
  );
  const releases = [first, ...pages];
  if (releases.some((release, page) => !validPage(release, season, page, first))) return null;
  const rows = releases.flatMap((release) => release.rows);
  if (rows.length !== total) return null;
  const identities = new Set<string>();
  for (const row of rows) {
    if (!/^\d{1,15}$/.test(String(row.athlete_id || "")) || identities.has(String(row.athlete_id))) return null;
    identities.add(String(row.athlete_id));
  }
  return { ...first, rows };
}

export type ProgramProspectRow = ProgramProspect & {
  season: number;
  evidence: "Recorded commitment" | "Listed school" | "Committed elsewhere";
};

export type ProgramProspectSummary = {
  matched: number;
  committed: number;
  listed: number;
  committedElsewhere: number;
  editions: number;
  byClass: Array<{
    season: number;
    matched: number;
    committed: number;
    listed: number;
    committedElsewhere: number;
    committedRanked: number;
    committedBestRank: number | null;
    committedAverageRank: number | null;
    listedRanked: number;
    listedBestRank: number | null;
    listedAverageRank: number | null;
  }>;
};

const recordedRank = (value: number | null): value is number => Number.isInteger(value) && (value ?? 0) > 0;

const rankProfile = (ranks: number[]) => ({
  ranked: ranks.length,
  best: ranks.length ? Math.min(...ranks) : null,
  average: ranks.length ? ranks.reduce((total, rank) => total + rank, 0) / ranks.length : null,
});

/**
 * Summarize only rows that match the exact program ID. The API's `total` and
 * `cohort.committed` fields describe the full national class, so using them
 * here would overstate a program's recruiting footprint.
 */
export function summarizeProgramProspects(rows: ProgramProspectRow[]): ProgramProspectSummary {
  const byClass = new Map<number, { matched: number; committed: number; listed: number; committedElsewhere: number; committedRanks: number[]; listedRanks: number[] }>();
  for (const row of rows) {
    const current = byClass.get(row.season) || { matched: 0, committed: 0, listed: 0, committedElsewhere: 0, committedRanks: [], listedRanks: [] };
    current.matched += 1;
    if (row.evidence === "Recorded commitment") {
      current.committed += 1;
      if (recordedRank(row.rank)) current.committedRanks.push(row.rank);
    }
    else if (row.evidence === "Committed elsewhere") current.committedElsewhere += 1;
    else {
      current.listed += 1;
      if (recordedRank(row.rank)) current.listedRanks.push(row.rank);
    }
    byClass.set(row.season, current);
  }
  const classRows = Array.from(byClass.entries())
    .sort(([a], [b]) => a - b)
    .map(([season, values]) => {
      const committed = rankProfile(values.committedRanks);
      const listed = rankProfile(values.listedRanks);
      return {
        season,
        matched: values.matched,
        committed: values.committed,
        listed: values.listed,
        committedElsewhere: values.committedElsewhere,
        committedRanked: committed.ranked,
        committedBestRank: committed.best,
        committedAverageRank: committed.average,
        listedRanked: listed.ranked,
        listedBestRank: listed.best,
        listedAverageRank: listed.average,
      };
    });
  return {
    matched: rows.length,
    committed: rows.filter((row) => row.evidence === "Recorded commitment").length,
    listed: rows.filter((row) => row.evidence === "Listed school").length,
    committedElsewhere: rows.filter((row) => row.evidence === "Committed elsewhere").length,
    editions: classRows.length,
    byClass: classRows,
  };
}

export function programProspectEvidence(row: ProgramProspect, teamId: string): ProgramProspectRow["evidence"] {
  if (row.committed_team_id === teamId) return "Recorded commitment";
  if (row.committed_team_id) return "Committed elsewhere";
  return "Listed school";
}

export function isExactProgramProspect(row: ProgramProspect, teamId: string) {
  return row.committed_team_id === teamId
    || (row.school_ids || []).some((schoolId) => String(schoolId) === teamId);
}

export function combineProgramProspectClasses(releases: RecruitingClass[], teamId: string) {
  return releases
    .flatMap((release) => release.rows.filter((row) => isExactProgramProspect(row, teamId)).map((row) => ({
      ...row,
      season: release.season,
      evidence: programProspectEvidence(row, teamId),
    } satisfies ProgramProspectRow)))
    .sort((a, b) =>
      a.season - b.season
      || Number(a.rank == null) - Number(b.rank == null)
      || (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER)
      || a.name.localeCompare(b.name),
    );
}

/** Every recruiting class currently retained by the national board. */
export const PROGRAM_PROSPECT_CLASSES = [2025, 2026, 2027, 2028, 2029, 2030] as const;

export default function ProgramProspects({ teamId, programName }: { teamId: string; programName: string }) {
  const [releases, setReleases] = useState<RecruitingClass[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");

  useEffect(() => {
    const controller = new AbortController();
    Promise.allSettled(PROGRAM_PROSPECT_CLASSES.map((season) => loadProgramProspectClass(season, teamId, controller.signal))).then((results) => {
      if (controller.signal.aborted) return;
      const available = results.flatMap((result) =>
        result.status === "fulfilled"
        && result.value
        && result.value.season >= PROGRAM_PROSPECT_CLASSES[0]
        && result.value.season <= PROGRAM_PROSPECT_CLASSES[PROGRAM_PROSPECT_CLASSES.length - 1]
          ? [result.value]
          : [],
      );
      setReleases(available);
      setStatus(available.length ? "ready" : "unavailable");
    });
    return () => controller.abort();
  }, [teamId]);

  const rows = combineProgramProspectClasses(releases, teamId);
  const summary = summarizeProgramProspects(rows);

  return (
    <section className="section paper-panel program-prospect-panel" aria-labelledby="program-prospect-title">
      <div className="section-heading">
        <div>
          <div className="eyebrow">Recorded prospect links / 2025–30</div>
          <h2 id="program-prospect-title">Who has {programName} on the retained board?</h2>
        </div>
        <Link href="/basketball/recruiting/">Open the national board →</Link>
      </div>
      <p className="note">
        Exact program IDs connect these prospect rows to the dossier. “Listed school” means the program ID appears on an uncommitted retained prospect record; it does not establish an offer, active interest or visit. A recorded commitment to another program is separated so a closed recruitment never reads like an open target.
      </p>
      {status === "loading" ? (
        <p className="empty" role="status">Loading exact-ID prospect records…</p>
      ) : status === "unavailable" ? (
        <p className="empty" role="status">The program prospect index is temporarily unavailable.</p>
      ) : summary.matched === 0 ? (
        <p className="empty" role="status">No 2025–30 prospect row in the retained classes includes this exact program ID. Missing evidence does not mean the program is inactive.</p>
      ) : (
        <>
          <div className="strip recruiting-strip">
            <div><strong>{summary.matched.toLocaleString()}</strong><span>Matched prospect rows</span></div>
            <div><strong>{summary.committed.toLocaleString()}</strong><span>Committed here</span></div>
            <div><strong>{summary.listed.toLocaleString()}</strong><span>Uncommitted listed-school rows</span></div>
            <div><strong>{summary.committedElsewhere.toLocaleString()}</strong><span>Committed elsewhere</span></div>
            <div><strong>{summary.editions.toLocaleString()}</strong><span>Class editions represented</span></div>
          </div>
          {summary.byClass.length > 0 && <div className="table-scroll" style={{ marginTop: 20 }}>
            <table className="data-table">
              <caption className="eyebrow" style={{ captionSide: "top", textAlign: "left", padding: "0 0 8px" }}>Class rank profile / exact program matches</caption>
              <thead><tr><th>Class</th><th className="numeric">Matched</th><th className="numeric">Committed here</th><th>Committed rank profile</th><th className="numeric">Uncommitted / listed</th><th>Open listed rank profile</th><th className="numeric">Committed elsewhere</th></tr></thead>
              <tbody>{summary.byClass.map((item) => <tr key={item.season}><th scope="row">{item.season}</th><td className="numeric">{item.matched.toLocaleString()}</td><td className="numeric">{item.committed.toLocaleString()}</td><td>{item.committedRanked ? <><strong>#{item.committedBestRank} best</strong><small>#{item.committedAverageRank?.toFixed(1)} average · {item.committedRanked} of {item.committed} ranked</small></> : <span className="note">No recorded rank</span>}</td><td className="numeric">{item.listed.toLocaleString()}</td><td>{item.listedRanked ? <><strong>#{item.listedBestRank} best</strong><small>#{item.listedAverageRank?.toFixed(1)} average · {item.listedRanked} of {item.listed} ranked</small></> : <span className="note">No recorded rank</span>}</td><td className="numeric">{item.committedElsewhere.toLocaleString()}</td></tr>)}</tbody>
            </table>
            <p className="note" style={{ marginTop: 10 }}>Best and average ranks use only positive recorded national ranks within that class and evidence state. Unranked rows remain in the commitment and listed counts but never enter the average. Closed recruitments are kept out of both rank profiles.</p>
          </div>}
          <div className="table-scroll" style={{ marginTop: 20 }}>
            <table className="data-table">
              <thead><tr><th>Class</th><th>Prospect</th><th className="numeric">Rank</th><th className="numeric">Grade</th><th>Program evidence</th><th>Origin</th><th>Record</th></tr></thead>
              <tbody>{rows.slice(0, 12).map((row) => (
                <tr key={`${row.season}-${row.athlete_id}`}>
                  <td>{row.season}</td>
                  <th scope="row">{row.name}<small>{row.position || "Position unavailable"}{row.high_school ? ` · ${row.high_school}` : ""}</small></th>
                  <td className="numeric">{row.rank == null ? "—" : `#${row.rank}`}</td>
                  <td className="numeric">{row.grade == null || row.grade <= 0 ? "—" : row.grade.toFixed(0)}</td>
                  <td><strong>{row.evidence}</strong>{row.evidence === "Recorded commitment" && row.committed_team_name
                    ? <small>{row.committed_team_name}</small>
                    : row.evidence === "Committed elsewhere"
                      ? <small>{row.committed_team_name || `Recorded destination ${row.committed_team_id}`}</small>
                      : <small>Exact program ID on school list</small>}</td>
                  <td>{row.hometown || "—"}</td>
                  <td><Link href={`/basketball/recruiting/prospect/?season=${row.season}&id=${encodeURIComponent(row.athlete_id)}`}>Open dossier →</Link></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {rows.length > 12 && <p className="note">Showing the 12 highest recorded ranks across the matched class rows. {rows.length.toLocaleString()} rows are available in the loaded releases.</p>}
        </>
      )}
    </section>
  );
}
