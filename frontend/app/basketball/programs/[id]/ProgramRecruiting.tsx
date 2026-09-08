import Link from "next/link";
import type { BBRosters } from "../../../_lib/basketball-types";
import type { RosterLabRow } from "../../../_lib/roster-readiness";
import {
  categoryLabels,
  eventLabels,
  publicationDate,
  recruitingRows,
  rosterNameMatch,
  type RecruitingRelease,
} from "../../../_lib/recruiting";

export default function ProgramRecruiting({
  teamId,
  programName,
  recruiting,
  rosters,
  readiness,
}: {
  teamId: string;
  programName: string;
  recruiting: RecruitingRelease;
  rosters: BBRosters;
  readiness?: RosterLabRow;
}) {
  const announcements = recruitingRows(recruiting).filter(
    (row) => row.team_id === teamId,
  );
  const rosterRows = rosters.players.filter((row) => row.team_id === teamId);
  const summary = rosters.team_summaries?.find((row) => row.team_id === teamId);
  const exactRosterMatches = announcements.filter(
    (row) => rosterNameMatch(row.name, teamId, rosterRows) === "exact",
  ).length;
  const reviewed = recruiting.programs.some((program) => program.id === teamId);

  return (
    <section className="section paper-panel program-recruiting-panel">
      <div className="section-heading">
        <div>
          <div className="eyebrow">05 / Recruiting evidence</div>
          <h2>What changed around {programName}?</h2>
        </div>
        <Link href={`/basketball/recruiting/?team=${encodeURIComponent(teamId)}`}>
          Open the full recruiting file →
        </Link>
      </div>
      <p className="note">
        This panel keeps dated school publications, source-listed roster
        observations and prior college production in separate evidence lanes.
        A source record does not establish eligibility, availability or a
        future role.
      </p>
      <div className="strip recruiting-strip">
        <div>
          <strong>{summary?.listed_players ?? 0}</strong>
          <span>Source-listed players</span>
        </div>
        <div>
          <strong>{summary?.returning_players ?? 0}</strong>
          <span>Same-program prior records</span>
        </div>
        <div>
          <strong>{summary?.transfer_players ?? 0}</strong>
          <span>Different-program records</span>
        </div>
        <div>
          <strong>
            {summary?.represented_prior_minutes_share == null
              ? "—"
              : `${(summary.represented_prior_minutes_share * 100).toFixed(0)}%`}
          </strong>
          <span>Prior minutes represented</span>
        </div>
      </div>
      {readiness && (
        <section className="paper-panel" style={{ marginTop: 24 }}>
          <div className="section-heading" style={{ marginBottom: 8 }}>
            <div>
              <div className="eyebrow">Role workload watch</div>
              <h3>Which source-listed role is represented?</h3>
            </div>
            <Link href={`/basketball/roster-lab/?q=${encodeURIComponent(programName)}`}>
              Open roster lab →
            </Link>
          </div>
          <p className="note">
            Prior minutes are grouped by the source-reported position on the
            current listing. “Unrepresented” means prior minutes not attached
            to a same-program listing in this release; it does not establish a
            departure, transfer, eligibility or expected role.
          </p>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Role</th>
                  <th className="numeric">Listed</th>
                  <th className="numeric">Prior minutes</th>
                  <th className="numeric">Returning minutes</th>
                  <th className="numeric">Incoming prior minutes</th>
                  <th className="numeric">Returning share</th>
                  <th className="numeric">Unrepresented</th>
                </tr>
              </thead>
              <tbody>
                {(["guard", "forward", "center"] as const).map((group) => {
                  const workload = readiness.positionWorkload[group];
                  const listed = readiness.positionCounts[group];
                  const unrepresented = Math.max(0, workload.priorMinutes - workload.returningMinutes);
                  return (
                    <tr key={group}>
                      <th scope="row">{group[0].toUpperCase() + group.slice(1)}</th>
                      <td className="numeric">{listed}</td>
                      <td className="numeric">{workload.priorMinutes ? Math.round(workload.priorMinutes).toLocaleString() : "—"}</td>
                      <td className="numeric">{workload.returningMinutes ? Math.round(workload.returningMinutes).toLocaleString() : "—"}</td>
                      <td className="numeric">{workload.incomingPriorMinutes ? Math.round(workload.incomingPriorMinutes).toLocaleString() : "—"}</td>
                      <td className="numeric">{workload.returningShare == null ? "—" : `${(workload.returningShare * 100).toFixed(0)}%`}</td>
                      <td className="numeric">{unrepresented ? Math.round(unrepresented).toLocaleString() : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="note" style={{ marginTop: 12 }}>
            {readiness.positionCounts.unreported} listed player{readiness.positionCounts.unreported === 1 ? "" : "s"} have no recognized source position. The workload denominator is the matched prior-production sample ({Math.round(readiness.priorMinutes).toLocaleString()} minutes).
          </p>
        </section>
      )}
      {!reviewed && (
        <p className="career-coverage-warning">
          No dated school announcement is in the selected review file for this
          program. The roster row below is observation-only; absence of a
          reviewed announcement does not mean the program made no move.
        </p>
      )}
      {announcements.length ? (
        <>
          <div className="section-heading" style={{ marginTop: 24 }}>
            <div>
              <div className="eyebrow">Dated school publications</div>
              <h3>{announcements.length} announced addition{announcements.length === 1 ? "" : "s"}</h3>
            </div>
            <span className="note">
              {exactRosterMatches} exact source-name match{exactRosterMatches === 1 ? "" : "es"} in the roster release
            </span>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Evidence</th>
                  <th>Prior program</th>
                  <th className="numeric">Prior MPG</th>
                  <th className="numeric">Prior PPG</th>
                  <th>Latest publication</th>
                </tr>
              </thead>
              <tbody>
                {announcements.map((row) => (
                  <tr key={row.key}>
                    <th scope="row">
                      {row.stats ? (
                        <Link href={`/basketball/player/?id=${encodeURIComponent(row.stats.id)}&season=${row.stats.season}`}>
                          {row.name} →
                        </Link>
                      ) : (
                        row.name
                      )}
                      <small>{categoryLabels[row.category]}</small>
                    </th>
                    <td>
                      <a href={row.latest.source.url} target="_blank" rel="noreferrer">
                        {eventLabels[row.latest.kind]} ↗
                      </a>
                      <small>{row.latest.summary}</small>
                    </td>
                    <td>
                      {row.previous_program || (row.category === "freshman" ? "Prep addition" : "Not supplied")}
                      {row.stats && <small>{row.stats.team} · {row.stats.season - 1}–{String(row.stats.season).slice(-2)}</small>}
                    </td>
                    <td className="numeric">{row.stats?.mpg == null ? "—" : row.stats.mpg.toFixed(1)}</td>
                    <td className="numeric">{row.stats?.ppg == null ? "—" : row.stats.ppg.toFixed(1)}</td>
                    <td>
                      {publicationDate(row.latest.source.published_on)}
                      <small>{row.timeline.length} dated record{row.timeline.length === 1 ? "" : "s"}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="empty" style={{ marginTop: 24 }}>
          No announced additions are in the reviewed file for this program.
        </p>
      )}
      <div className="section-heading" style={{ marginTop: 28 }}>
        <div>
          <div className="eyebrow">Roster observation</div>
          <h3>Who is listed in the source release?</h3>
        </div>
        <Link href={`/basketball/roster-board/?q=${encodeURIComponent(programName)}`}>
          Rank this roster’s workload →
        </Link>
      </div>
      <p className="note">
        {rosterRows.length
          ? `${rosterRows.length} source-listed players. Prior rates below are attached by exact source ID where available; missing values remain missing.`
          : "No source-listed roster rows were observed for this program in the current release."}
      </p>
      {!!rosterRows.length && (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Observation</th>
                <th className="numeric">Prior MPG</th>
                <th className="numeric">Prior PPG</th>
                <th className="numeric">Prior TS%</th>
              </tr>
            </thead>
            <tbody>
              {[...rosterRows]
                .sort((a, b) => (b.prior_production?.minutes ?? -1) - (a.prior_production?.minutes ?? -1) || a.name.localeCompare(b.name))
                .slice(0, 12)
                .map((row) => (
                  <tr key={row.id}>
                    <th scope="row">
                      <Link href={`/basketball/player/?id=${encodeURIComponent(row.id)}&season=2026`}>
                        {row.name} →
                      </Link>
                      <small>{row.position || "Position unavailable"}</small>
                    </th>
                    <td>
                      {row.status === "same_program"
                        ? "Same program"
                        : row.status === "different_program"
                          ? "Different program"
                          : row.status === "ambiguous"
                            ? "Multiple current programs"
                            : "No prior appearance observed"}
                      <small>{row.previous_teams.join(", ") || "No prior program listed"}</small>
                    </td>
                    <td className="numeric">{row.prior_production?.mpg == null ? "—" : row.prior_production.mpg.toFixed(1)}</td>
                    <td className="numeric">{row.prior_production?.ppg == null ? "—" : row.prior_production.ppg.toFixed(1)}</td>
                    <td className="numeric">{row.prior_production?.ts == null ? "—" : `${(row.prior_production.ts * 100).toFixed(1)}%`}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          {rosterRows.length > 12 && <p className="note">Showing the 12 highest prior-minute records. Open the full roster board for every source-listed player.</p>}
        </div>
      )}
      <p className="note" style={{ marginTop: 20 }}>
        Recruiting review edition {publicationDate(recruiting.reviewed_at)} ·
        coverage is partial ({recruiting.coverage.programs} programs reviewed).
        See the <Link href="/basketball/recruiting/">full methodology and coverage map</Link> before drawing a roster conclusion.
      </p>
    </section>
  );
}
