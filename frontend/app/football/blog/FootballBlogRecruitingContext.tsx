"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { fmt } from "../../_lib/format";
import { loadFootballRecruitingContext, type FootballRecruitingTeam } from "../../_lib/football-recruiting-context";
import { footballMatchupContextEdgeLabel, footballMatchupContextRows, type FootballMatchupContextRow } from "../../_lib/football-matchup-context";

type RecruitingContextState = {
  status: "checking" | "ready" | "unavailable";
  teams: Map<string, FootballRecruitingTeam> | null;
};

const RecruitingContext = createContext<RecruitingContextState>({ status: "checking", teams: null });

/**
 * Load the personnel edition once for the blog queue. The matchup desk uses
 * the same exact-ID loader; keeping this as a provider avoids one API request
 * per notebook card and keeps the blog's recruiting read tied to that source.
 */
export default function FootballBlogRecruitingProvider({ season, children }: { season: number; children: ReactNode }) {
  const [state, setState] = useState<RecruitingContextState>({ status: "checking", teams: null });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "checking", teams: null });
    loadFootballRecruitingContext(controller.signal, season)
      .then((teams) => {
        if (!controller.signal.aborted) setState({ status: "ready", teams });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "unavailable", teams: null });
      });
    return () => controller.abort();
  }, [season]);

  return <RecruitingContext.Provider value={state}>{children}</RecruitingContext.Provider>;
}

export function FootballBlogRecruitingStatus() {
  const { status, teams } = useContext(RecruitingContext);
  if (status === "checking") return <p className="note" role="status">Loading exact-team recruiting context for the notebook queue…</p>;
  if (status === "unavailable") return <p className="note" role="status">Team-level recruiting context is temporarily unavailable. Open the <Link href="/football/recruiting/">football personnel desk</Link> to inspect the retained records.</p>;
  return <p className="note" role="status">Recruiting context connected for {teams?.size.toLocaleString() || "0"} exact team IDs. Talent and returning-production fields remain descriptive and season-scoped.</p>;
}

function contextValue(row: FootballMatchupContextRow, value: number | null) {
  if (value == null) return "—";
  if (row.format === "rank") return `#${fmt(value, 0)}`;
  if (row.format === "percent") return `${fmt(value * 100, 1)}%`;
  return fmt(value, 1);
}

export function FootballBlogRecruitingLens({
  awayId,
  awayName,
  homeId,
  homeName,
  season,
}: {
  awayId: string;
  awayName: string;
  homeId: string;
  homeName: string;
  season: number;
}) {
  const { status, teams } = useContext(RecruitingContext);
  if (status !== "ready") return null;
  const away = teams?.get(awayId);
  const home = teams?.get(homeId);
  const rows = footballMatchupContextRows(away, home);
  const hasEvidence = rows.some((row) => row.away != null || row.home != null);
  if (!hasEvidence) return null;
  const awayLabel = away?.team || awayName;
  const homeLabel = home?.team || homeName;
  const returningNote = [away, home].some((team) => team?.returning_estimated === true)
    ? "At least one returning-production field is marked estimated by the retained source."
    : "Returning-production fields retain the source's reported status.";
  return (
    <section className="football-card-intel" aria-label="Recruiting and returning production context">
      <div className="football-card-intel-heading">
        <strong>Recruiting lens</strong>
        <span>{season} exact-team context</span>
      </div>
      <div className="table-scroll">
        <table className="data-table matchup-context-table">
          <thead><tr><th>Measure</th><th>{awayLabel}<small>Team ID {awayId}</small></th><th>{homeLabel}<small>Team ID {homeId}</small></th><th>Read</th></tr></thead>
          <tbody>{rows.map((row) => (
            <tr key={row.key}>
              <th scope="row">{row.label}<small>{row.direction === "lower" ? "Lower is stronger" : "Higher is stronger"}</small></th>
              <td className="numeric">{contextValue(row, row.away)}</td>
              <td className="numeric">{contextValue(row, row.home)}</td>
              <td>{footballMatchupContextEdgeLabel(row)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p className="football-card-intel-note">
        {returningNote} This context does not alter the primary forecast or establish eligibility, availability or starting roles. <Link href={`/football/recruiting/?view=talent&season=${encodeURIComponent(String(season))}&team=${encodeURIComponent(awayId)}`}>Open {awayLabel} records</Link> · <Link href={`/football/recruiting/?view=talent&season=${encodeURIComponent(String(season))}&team=${encodeURIComponent(homeId)}`}>Open {homeLabel} records</Link>.
      </p>
    </section>
  );
}
