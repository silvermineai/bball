"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchJson } from "../../../_lib/fetch-json";
import {
  combineProgramProspectClasses,
  loadProgramProspectClass,
  type ProgramProspectRow,
  type RecruitingClass,
} from "../../programs/[id]/ProgramProspects";

/**
 * The matchup brief needs a small recruiting lens, but it must retain the
 * program-ID and evidence boundaries used by the full program dossier. This
 * summary is deliberately descriptive: it never turns a commitment into a
 * roster or a listed school into an offer.
 */
export type MatchupRecruitingSummary = {
  season: number;
  matched: number;
  committed: number;
  listed: number;
  ranked: number;
  bestRank: number | null;
  topProspects: Array<{ athleteId: string; name: string; rank: number; position: string | null; evidence: ProgramProspectRow["evidence"] }>;
};

export function summarizeMatchupRecruiting(
  rows: ProgramProspectRow[],
  seasons: readonly number[] = [2026, 2027],
): MatchupRecruitingSummary[] {
  return seasons.map((season) => {
    const classRows = rows.filter((row) => row.season === season);
    const ranked = classRows.filter((row) => Number.isInteger(row.rank) && (row.rank ?? 0) > 0);
    const topProspects = ranked
      .slice()
      .sort((a, b) => (a.rank as number) - (b.rank as number) || a.name.localeCompare(b.name))
      .slice(0, 3)
      .map((row) => ({
        athleteId: row.athlete_id,
        name: row.name,
        rank: row.rank as number,
        position: row.position,
        evidence: row.evidence,
      }));
    return {
      season,
      matched: classRows.length,
      committed: classRows.filter((row) => row.evidence === "Recorded commitment").length,
      listed: classRows.filter((row) => row.evidence === "Listed school").length,
      ranked: ranked.length,
      bestRank: ranked.length ? Math.min(...ranked.map((row) => row.rank as number)) : null,
      topProspects,
    };
  });
}

type TeamInput = { teamId: string; teamName: string };
type TeamResult = TeamInput & {
  releases: RecruitingClass[];
  rows: ProgramProspectRow[];
};
type LoadState = "loading" | "ready" | "unavailable";

const CLASSES = [2026, 2027] as const;

async function loadTeam(team: TeamInput, signal: AbortSignal): Promise<TeamResult> {
  const results = await Promise.all(
    CLASSES.map((season) => loadProgramProspectClass(season, team.teamId, signal, fetchJson)),
  );
  const releases = results.filter((release): release is RecruitingClass => release !== null);
  return {
    ...team,
    releases,
    rows: combineProgramProspectClasses(releases, team.teamId),
  };
}

function rankLabel(rank: number | null) {
  return rank == null ? "—" : `No. ${rank}`;
}

function captureLabel(releases: RecruitingClass[]) {
  const captured = releases
    .map((release) => release.captured_at)
    .filter((value): value is string => !!value)
    .sort()
    .at(-1);
  return captured ? `captured ${new Date(captured).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}` : "capture time unavailable";
}

export default function MatchupRecruitingContext({
  homeId,
  homeName,
  awayId,
  awayName,
}: {
  homeId: string;
  homeName: string;
  awayId: string;
  awayName: string;
}) {
  const [state, setState] = useState<LoadState>("loading");
  const [teams, setTeams] = useState<TeamResult[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.allSettled([
      loadTeam({ teamId: homeId, teamName: homeName }, controller.signal),
      loadTeam({ teamId: awayId, teamName: awayName }, controller.signal),
    ]).then((results) => {
      if (controller.signal.aborted) return;
      const loaded = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      setTeams(loaded);
      setState(loaded.some((team) => team.releases.length > 0) ? "ready" : "unavailable");
    });
    return () => controller.abort();
  }, [awayId, awayName, homeId, homeName]);

  return (
    <section className="section paper-panel" aria-labelledby="matchup-recruiting-title">
      <div className="section-heading">
        <div>
          <div className="eyebrow">Recruiting context / exact program IDs</div>
          <h2 id="matchup-recruiting-title">Who is attached to this matchup?</h2>
        </div>
        <Link href="/basketball/recruiting/">Open the national board →</Link>
      </div>
      <p className="note">
        The table joins the retained 2026 and 2027 prospect classes to each exact program ID. Recorded commitments and listed-school rows stay separate; neither establishes enrollment, eligibility, availability or a forecast role.
      </p>
      {state === "loading" ? (
        <p className="empty" role="status">Loading exact program recruiting records…</p>
      ) : state === "unavailable" ? (
        <p className="empty" role="status">No exact program recruiting release is available for this matchup.</p>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Program</th>
                <th>Class</th>
                <th className="numeric">Matched</th>
                <th className="numeric">Committed here</th>
                <th className="numeric">Listed school</th>
                <th className="numeric">Ranked</th>
                <th className="numeric">Best rank</th>
                <th>Top retained records</th>
              </tr>
            </thead>
            <tbody>
              {teams.flatMap((team) => {
                const summaries = summarizeMatchupRecruiting(team.rows, CLASSES);
                return summaries.map((summary) => (
                  <tr key={`${team.teamId}-${summary.season}`}>
                    <th scope="row">
                      <Link href={`/basketball/programs/${encodeURIComponent(team.teamId)}/`}>{team.teamName}</Link>
                      <small>{team.releases.length ? captureLabel(team.releases) : "release unavailable"}</small>
                    </th>
                    <td>{summary.season}</td>
                    <td className="numeric">{summary.matched || "—"}</td>
                    <td className="numeric">{summary.committed || "—"}</td>
                    <td className="numeric">{summary.listed || "—"}</td>
                    <td className="numeric">{summary.ranked || "—"}</td>
                    <td className="numeric">{rankLabel(summary.bestRank)}</td>
                    <td>
                      {summary.topProspects.length ? summary.topProspects.map((prospect) => (
                        <span className="table-inline-item" key={prospect.athleteId}>
                          <Link href={`/basketball/recruiting/prospect/?season=${summary.season}&id=${encodeURIComponent(prospect.athleteId)}`}>{prospect.name}</Link> <small>#{prospect.rank} · {prospect.position || "position unavailable"}</small>
                        </span>
                      )) : <span className="muted">No ranked row retained</span>}
                    </td>
                  </tr>
                ));
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="note" style={{ marginTop: 12 }}>
        Source release is the current internal recruiting board; the capture clock and exact-ID join are shown so a missing row remains missing rather than being inferred.
      </p>
    </section>
  );
}
