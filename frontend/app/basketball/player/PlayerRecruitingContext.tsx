"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  categoryLabels,
  eventLabels,
  publicationDate,
} from "../../_lib/recruiting";
import {
  playerRecruitingContext,
  parseLivePlayerRecruitingPayload,
  playerRecruitingContextRequests,
  playerRecruitingStatRows,
  type PlayerRecruitingContext as PlayerRecruitingContextData,
} from "../../_lib/player-recruiting";

type ReleaseMeta = {
  edition: string;
  reviewedAt: string;
  rosterFetchedAt: string | null;
};

function statValue(value: number | null, percent: boolean) {
  if (value == null) return "—";
  return percent ? `${(value * 100).toFixed(1)}%` : value.toFixed(1);
}

function RecruitingStatGrid({
  stats,
}: {
  stats: Parameters<typeof playerRecruitingStatRows>[0];
}) {
  return (
    <div className="recruiting-stat-grid">
      {playerRecruitingStatRows(stats).map((metric) => (
        <span key={metric.key}>
          <strong>{statValue(metric.value, metric.percent)}</strong>
          <small>{metric.label}</small>
        </span>
      ))}
    </div>
  );
}

export default function PlayerRecruitingContext({
  id,
}: {
  id: string;
}) {
  const [context, setContext] = useState<PlayerRecruitingContextData | null>(null);
  const [releaseMeta, setReleaseMeta] = useState<ReleaseMeta | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setContext(null);
    setReleaseMeta(null);
    setError("");
    const requests = playerRecruitingContextRequests();
    Promise.all([
      fetch(requests.recruiting, { signal: controller.signal }),
      fetch(requests.rosters, { signal: controller.signal }),
    ])
      .then(async ([recruitingResponse, rosterResponse]) => {
        if (!recruitingResponse.ok || !rosterResponse.ok) {
          throw new Error("The live recruiting evidence release could not be loaded.");
        }
        return Promise.all([recruitingResponse.json(), rosterResponse.json()]);
      })
      .then(([recruitingPayload, rosterPayload]) => {
        const parsed = parseLivePlayerRecruitingPayload(recruitingPayload, rosterPayload);
        if (!parsed) throw new Error("The live recruiting evidence release is incomplete.");
        if (!controller.signal.aborted) {
          setContext(playerRecruitingContext(id, parsed.recruiting, parsed.rosters));
          const rosterSource = parsed.rosters.source;
          setReleaseMeta({
            edition: parsed.recruiting.edition,
            reviewedAt: parsed.recruiting.reviewed_at,
            rosterFetchedAt: rosterSource?.fetched_at || null,
          });
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
        This panel joins only the publisher&apos;s exact source ID ({id}) from the live retained release. A name
        match alone is never treated as identity evidence. Dated announcements
        are a partial review file; roster observations describe a source listing,
        not eligibility, availability, or a confirmed destination.
      </p>
      {releaseMeta ? (
        <p className="note">
          Live recruiting edition <code>{releaseMeta.edition.slice(0, 16)}…</code> · reviewed {releaseMeta.reviewedAt.slice(0, 10)}
          {releaseMeta.rosterFetchedAt ? ` · roster receipt ${releaseMeta.rosterFetchedAt.slice(0, 10)}` : ""}
        </p>
      ) : null}
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
                    {row.latest ? <span>{publicationDate(row.latest.source.published_on)} · {row.latest.source.title}</span> : "No dated statement"}
                    <small>{row.latest?.summary || ""}</small>
                  </td>
                  <td>
                    {row.stats ? <RecruitingStatGrid stats={row.stats} /> : "—"}
                    <small>{row.stats ? `${row.stats.games} GP · ${row.stats.season - 1}–${String(row.stats.season).slice(-2)}` : "Prior production unavailable"}</small>
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
                  <td>
                    {row.prior_production ? <RecruitingStatGrid stats={row.prior_production} /> : "—"}
                    <small>{row.prior_production ? `${row.prior_production.games} GP · ${rosterSeason - 1}–${String(rosterSeason).slice(-2)}` : "Prior production unavailable"}</small>
                  </td>
                  <td>{row.source_url ? "Roster row retained" : "No roster receipt"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">No exact current roster observation is linked to this source ID. The absence of a listing is not evidence that the player is unavailable.</p>
      )}
      <p className="note">The panel reflects selected school announcements and the current source roster release. Use the linked receipts to inspect the underlying statement.</p>
    </section>
  );
}
