"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  categoryLabels,
  eventLabels,
  publicationDate,
  type RecruitingRelease,
} from "../../_lib/recruiting";
import {
  playerRecruitingContext,
  type PlayerRecruitingContext as PlayerRecruitingContextData,
} from "../../_lib/player-recruiting";
import type { BBRosters } from "../../_lib/basketball-types";

export default function PlayerRecruitingContext({
  id,
}: {
  id: string;
}) {
  const [context, setContext] = useState<PlayerRecruitingContextData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setContext(null);
    setError("");
    Promise.all([
      fetch("/data/basketball/recruiting.json", { signal: controller.signal }),
      fetch("/data/basketball/rosters.json", { signal: controller.signal }),
    ])
      .then(async ([recruitingResponse, rosterResponse]) => {
        if (!recruitingResponse.ok || !rosterResponse.ok) {
          throw new Error("The recruiting evidence release could not be loaded.");
        }
        return Promise.all([
          recruitingResponse.json() as Promise<RecruitingRelease>,
          rosterResponse.json() as Promise<BBRosters>,
        ]);
      })
      .then(([recruiting, rosters]) => {
        if (!controller.signal.aborted) {
          setContext(playerRecruitingContext(id, recruiting, rosters));
        }
      })
      .catch((reason: Error) => {
        if (reason.name !== "AbortError") setError(reason.message);
      });
    return () => controller.abort();
  }, [id]);

  if (error) return <p className="status-error" role="alert">{error}</p>;
  if (!context) return <p className="empty" role="status">Loading dated recruiting evidence…</p>;

  const { announcements, rosterObservations, rosterSeason } = context;
  return (
    <section className="section paper-panel player-recruiting-context">
      <div className="section-heading">
        <div>
          <div className="eyebrow">Recruiting handoff / Exact source ID</div>
          <h2>What the current research file says.</h2>
        </div>
        <Link className="hero-link" href="/basketball/recruiting/">
          Open recruiting desk →
        </Link>
      </div>
      <p className="note">
        This panel joins only the publisher&apos;s exact source ID ({id}). A name
        match alone is never treated as identity evidence. Dated announcements
        are a partial review file; roster observations describe a source listing,
        not eligibility, availability, or a confirmed destination.
      </p>
      <div className="strip">
        <div><strong>{announcements.length}</strong><span>Reviewed announcement records</span></div>
        <div><strong>{announcements.reduce((sum, row) => sum + row.timeline.length, 0)}</strong><span>Dated source events</span></div>
        <div><strong>{rosterObservations.length}</strong><span>Current roster observations</span></div>
        <div><strong>{announcements[0]?.program.name || rosterObservations[0]?.team || "—"}</strong><span>Latest listed program</span></div>
      </div>
      {announcements.length ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Program / type</th><th>Latest reviewed statement</th><th>Prior source profile</th><th>Evidence</th></tr></thead>
            <tbody>
              {announcements.map((row) => (
                <tr key={row.key}>
                  <td>
                    <Link href={`/basketball/programs/${row.team_id}/`}>{row.program.name}</Link>
                    <small>{categoryLabels[row.category]}{row.previous_program ? ` · from ${row.previous_program}` : ""}</small>
                  </td>
                  <td>
                    {row.latest ? <a href={row.latest.source.url} target="_blank" rel="noreferrer">{publicationDate(row.latest.source.published_on)} · {row.latest.source.title} ↗</a> : "No dated source statement"}
                    <small>{row.latest?.summary || ""}</small>
                  </td>
                  <td className="numeric">
                    {row.stats?.ppg == null ? "—" : `${row.stats.ppg.toFixed(1)} PPG`}
                    <small>{row.stats?.mpg == null ? "Prior minutes unavailable" : `${row.stats.mpg.toFixed(1)} MPG · ${row.stats.season - 1}–${String(row.stats.season).slice(-2)}`}</small>
                  </td>
                  <td>
                    {row.timeline.map((event) => (
                      <small key={event.id}>{eventLabels[event.kind]} · {publicationDate(event.source.published_on)}</small>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">No reviewed announcement is linked to this exact source ID. Search the recruiting desk by name for possible leads, but treat name-only results as unresolved.</p>
      )}
      {rosterObservations.length ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Source-listed program</th><th>Status / role</th><th>Prior production</th><th>Source</th></tr></thead>
            <tbody>
              {rosterObservations.map((row) => (
                <tr key={`${rosterSeason}-${row.team_id}`}>
                  <td><Link href={`/basketball/programs/${row.team_id}/`}>{row.team}</Link><small>{rosterSeason - 1}–{String(rosterSeason).slice(-2)} · {row.previous_teams.length ? `previous: ${row.previous_teams.join(", ")}` : "no prior program listed"}</small></td>
                  <td>{row.status || "Status unavailable"}<small>{[row.position, row.class_year, row.height, row.weight].filter(Boolean).join(" · ") || "Role fields unavailable"}</small></td>
                  <td className="numeric">{row.prior_production?.mpg == null ? "—" : `${row.prior_production.mpg.toFixed(1)} MPG`}<small>{row.prior_production?.ppg == null ? "Prior points unavailable" : `${row.prior_production.ppg.toFixed(1)} PPG`}</small></td>
                  <td>{row.source_url ? <a href={row.source_url} target="_blank" rel="noreferrer">Roster source ↗</a> : "No source URL"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">No exact current roster observation is linked to this source ID. The absence of a listing is not evidence that the player is unavailable.</p>
      )}
      <p className="note">The research file was reviewed from selected school announcements and a current source roster release. Use the linked receipts to inspect the underlying statement.</p>
    </section>
  );
}
