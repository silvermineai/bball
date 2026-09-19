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

type RecruitingClass = {
  season: number;
  total: number;
  cohort?: { committed: number };
  edition: string | null;
  captured_at: string | null;
  rows: ProgramProspect[];
  unavailable_reason?: string;
};

export type ProgramProspectRow = ProgramProspect & {
  season: number;
  evidence: "Recorded commitment" | "Listed school";
};

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
    Promise.allSettled(CLASSES.map((season) =>
      fetchJson<RecruitingClass>(
        `/api/basketball/research/recruiting-rankings?season=${season}&team_id=${encodeURIComponent(teamId)}&page=0`,
        { signal: controller.signal },
      ),
    )).then((results) => {
      if (controller.signal.aborted) return;
      const available = results.flatMap((result) =>
        result.status === "fulfilled"
        && result.value.season >= CLASSES[0]
        && result.value.season <= CLASSES[CLASSES.length - 1]
        && !result.value.unavailable_reason
          ? [result.value]
          : [],
      );
      setReleases(available);
      setStatus(available.length ? "ready" : "unavailable");
    });
    return () => controller.abort();
  }, [teamId]);

  const rows = combineProgramProspectClasses(releases, teamId);
  const total = releases.reduce((sum, release) => sum + Math.max(0, release.total), 0);
  const committed = releases.reduce((sum, release) => sum + Math.max(0, release.cohort?.committed || 0), 0);
  const listed = Math.max(0, total - committed);
  const editions = new Set(releases.map((release) => release.edition).filter(Boolean)).size;

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
      ) : total === 0 ? (
        <p className="empty" role="status">No 2026–29 prospect row in the retained classes includes this exact program ID. Missing evidence does not mean the program is inactive.</p>
      ) : (
        <>
          <div className="strip recruiting-strip">
            <div><strong>{total.toLocaleString()}</strong><span>Matched prospect rows</span></div>
            <div><strong>{committed.toLocaleString()}</strong><span>Recorded commitments</span></div>
            <div><strong>{listed.toLocaleString()}</strong><span>Other listed-school rows</span></div>
            <div><strong>{editions.toLocaleString()}</strong><span>Class editions represented</span></div>
          </div>
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
          {total > rows.length && <p className="note">The matched total is larger than the first API page; open the national board for the complete retained class releases.</p>}
          {rows.length > 12 && <p className="note">Showing the 12 highest recorded ranks across the matched class rows. {rows.length.toLocaleString()} rows are available in the loaded releases.</p>}
        </>
      )}
    </section>
  );
}
