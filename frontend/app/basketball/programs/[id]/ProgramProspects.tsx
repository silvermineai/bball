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
  evidence: "Recorded commitment" | "Listed school";
};

export type ProgramProspectSummary = {
  matched: number;
  committed: number;
  listed: number;
  editions: number;
  byClass: Array<{ season: number; matched: number; committed: number; listed: number }>;
};

/**
 * Summarize only rows that match the exact program ID. The API's `total` and
 * `cohort.committed` fields describe the full national class, so using them
 * here would overstate a program's recruiting footprint.
 */
export function summarizeProgramProspects(rows: ProgramProspectRow[]): ProgramProspectSummary {
  const byClass = new Map<number, { matched: number; committed: number; listed: number }>();
  for (const row of rows) {
    const current = byClass.get(row.season) || { matched: 0, committed: 0, listed: 0 };
    current.matched += 1;
    if (row.evidence === "Recorded commitment") current.committed += 1;
    else current.listed += 1;
    byClass.set(row.season, current);
  }
  const classRows = Array.from(byClass.entries())
    .sort(([a], [b]) => a - b)
    .map(([season, values]) => ({ season, ...values }));
  return {
    matched: rows.length,
    committed: rows.filter((row) => row.evidence === "Recorded commitment").length,
    listed: rows.filter((row) => row.evidence === "Listed school").length,
    editions: classRows.length,
    byClass: classRows,
  };
}

export function programProspectEvidence(row: ProgramProspect, teamId: string): ProgramProspectRow["evidence"] {
  return row.committed_team_id === teamId ? "Recorded commitment" : "Listed school";
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

const CLASSES = [2026, 2027, 2028, 2029] as const;

export default function ProgramProspects({ teamId, programName }: { teamId: string; programName: string }) {
  const [releases, setReleases] = useState<RecruitingClass[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");

  useEffect(() => {
    const controller = new AbortController();
    Promise.allSettled(CLASSES.map((season) => loadProgramProspectClass(season, teamId, controller.signal))).then((results) => {
      if (controller.signal.aborted) return;
      const available = results.flatMap((result) =>
        result.status === "fulfilled"
        && result.value
        && result.value.season >= CLASSES[0]
        && result.value.season <= CLASSES[CLASSES.length - 1]
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
          <div className="eyebrow">Recorded prospect links / 2026–29</div>
          <h2 id="program-prospect-title">Who has {programName} on the retained board?</h2>
        </div>
        <Link href="/basketball/recruiting/">Open the national board →</Link>
      </div>
      <p className="note">
        Exact program IDs connect these prospect rows to the dossier. “Listed school” only means the program ID appears on that retained prospect record; it does not establish an offer, active interest, visit, commitment, roster spot or eligibility.
      </p>
      {status === "loading" ? (
        <p className="empty" role="status">Loading exact-ID prospect records…</p>
      ) : status === "unavailable" ? (
        <p className="empty" role="status">The program prospect index is temporarily unavailable.</p>
      ) : summary.matched === 0 ? (
        <p className="empty" role="status">No 2026–29 prospect row in the retained classes includes this exact program ID. Missing evidence does not mean the program is inactive.</p>
      ) : (
        <>
          <div className="strip recruiting-strip">
            <div><strong>{summary.matched.toLocaleString()}</strong><span>Matched prospect rows</span></div>
            <div><strong>{summary.committed.toLocaleString()}</strong><span>Recorded commitments</span></div>
            <div><strong>{summary.listed.toLocaleString()}</strong><span>Other listed-school rows</span></div>
            <div><strong>{summary.editions.toLocaleString()}</strong><span>Class editions represented</span></div>
          </div>
          {summary.byClass.length > 0 && <div className="table-scroll" style={{ marginTop: 20 }}>
            <table className="data-table">
              <caption className="eyebrow" style={{ captionSide: "top", textAlign: "left", padding: "0 0 8px" }}>Matched rows by class</caption>
              <thead><tr><th>Class</th><th className="numeric">Matched</th><th className="numeric">Recorded commitments</th><th className="numeric">Listed school only</th></tr></thead>
              <tbody>{summary.byClass.map((item) => <tr key={item.season}><th scope="row">{item.season}</th><td className="numeric">{item.matched.toLocaleString()}</td><td className="numeric">{item.committed.toLocaleString()}</td><td className="numeric">{item.listed.toLocaleString()}</td></tr>)}</tbody>
            </table>
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
                  <td><strong>{row.evidence}</strong>{row.evidence === "Recorded commitment" && row.committed_team_name ? <small>{row.committed_team_name}</small> : <small>Exact program ID on school list</small>}</td>
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
