"use client";
import { useState } from "react";
import Link from "next/link";
import type { BBRosters } from "../../_lib/basketball-types";
import { useBasketballRelease } from "../../_components/useBasketballRelease";
import { downloadCsv, toCsv } from "../../_lib/csv";
import {
  sortRosterObservations,
  type RosterSortKey,
} from "../../_lib/roster-observations";
const labels: Record<string, string> = {
  same_program: "Prior program also observed",
  different_program: "Different program observed",
  new_to_dataset: "No prior appearance in dataset",
  ambiguous: "Multiple current programs",
};
export default function Recruiting() {
  const [season, setSeason] = useState("2027"),
    [q, setQ] = useState(""),
    [status, setStatus] = useState("all"),
    [sort, setSort] = useState<RosterSortKey>("status"),
    [teamQuery, setTeamQuery] = useState(""),
    [teamSort, setTeamSort] = useState<"returning" | "prior" | "name">("returning"),
    [page, setPage] = useState(0);
  const { data, error } = useBasketballRelease<BBRosters>(
    season === "2027" ? "rosters" : "rosters-2026",
  );
  const rows = sortRosterObservations(
    (data?.players || []).filter(
      (p) =>
        (p.name + " " + p.team + " " + p.previous_teams.join(" "))
          .toLowerCase()
          .includes(q.toLowerCase()) &&
        (status === "all" || p.status === status),
    ),
    sort,
  );
  const teamRows = [...(data?.team_summaries || [])]
    .filter((team) => team.team.toLowerCase().includes(teamQuery.toLowerCase()))
    .sort((a, b) => {
      if (teamSort === "name") return a.team.localeCompare(b.team);
      if (teamSort === "prior") return (b.prior_minutes ?? 0) - (a.prior_minutes ?? 0) || a.team.localeCompare(b.team);
      return (b.returning_minutes_share ?? -1) - (a.returning_minutes_share ?? -1) || a.team.localeCompare(b.team);
    });
  return (
    <>
      <div className="toolbar">
        <label className="control">
          <span>VIEW</span>
          <select
            value={season}
            onChange={(e) => {
              setSeason(e.target.value);
              setStatus("all");
              setPage(0);
            }}
          >
            <option value="2027">2026–27 · Unconfirmed source listings</option>
            <option value="2026">2025–26 · Recorded game appearances</option>
          </select>
        </label>
        <label className="control">
          <span>PLAYER OR PROGRAM</span>
          <input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
            placeholder="Search current or prior program"
          />
        </label>
        <label className="control">
          <span>OBSERVATION</span>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
          >
            <option value="all">All observations</option>
            {Object.entries(labels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="control">
          <span>ORDER</span>
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as RosterSortKey);
              setPage(0);
            }}
          >
            <option value="status">Movement signal</option>
            <option value="prior">Most prior programs</option>
            <option value="workload">Most prior minutes</option>
            <option value="program">Current program</option>
            <option value="name">Player name</option>
          </select>
        </label>
      </div>
      {error ? (
        <p role="alert" className="status-error">
          {error}
        </p>
      ) : !data ? (
        <p className="empty" role="status">
          Loading roster observations…
        </p>
      ) : (
        <>
          <div
            className="strip"
            style={{ borderTop: "1px solid var(--ink)", marginBottom: 25 }}
          >
            <div>
              <strong>{data.teams_observed}</strong>
              <span>Programs in this source view</span>
            </div>
            <div>
              <strong>{data.players_observed.toLocaleString()}</strong>
              <span>Distinct observed player IDs</span>
            </div>
            <div>
              <strong>
                {data.status_counts.different_program?.toLocaleString() || 0}
              </strong>
              <span>Different program records</span>
            </div>
            <div>
              <strong>
                {data.status_counts.new_to_dataset?.toLocaleString() || 0}
              </strong>
              <span>No prior appearance found</span>
            </div>
          </div>
          <p className="note" style={{ marginBottom: 22 }}>
            {season === "2027"
              ? "Listings can carry over from earlier seasons; no school-confirmed current transfer status is supplied. Missing players may reflect incomplete rosters, not departures."
              : "Both sides of this comparison require recorded playing time. A different program record describes historical participation, not why or when a transfer happened."}{" "}
            New to the dataset does not mean freshman. Prior production is
            recorded workload from the preceding source season, not a
            projected role at the listed program.
          </p>
          {data.unusable_rows != null && data.unusable_rows > 0 && (
            <p className="career-coverage-warning">
              {data.unusable_rows.toLocaleString()} source roster rows were
              excluded as team-attributed placeholders; raw records remain in
              the research warehouse.
            </p>
          )}
          {!!data.team_summaries?.length && (
            <details className="career-coverage-details" style={{ marginBottom: 24 }}>
              <summary>{season === "2027" ? "Team workload continuity" : "Recorded workload movement"} ({data.team_summaries.length} programs)</summary>
              <p className="note">
                Prior minutes are summed from the preceding source season. The
                {season === "2027"
                  ? " listed view is an unconfirmed observation; this table is a workload context signal, not a depth chart or eligibility claim."
                  : " recorded appearance view uses playing time on both sides; this table is a workload context signal, not a transfer ledger or explanation of movement."}
              </p>
              <div className="toolbar">
                <label className="control">
                  <span>PROGRAM SEARCH</span>
                  <input
                    type="search"
                    value={teamQuery}
                    maxLength={100}
                    placeholder="Search all observed programs"
                    onChange={(e) => setTeamQuery(e.target.value)}
                  />
                </label>
                <label className="control">
                  <span>ORDER</span>
                  <select value={teamSort} onChange={(e) => setTeamSort(e.target.value as typeof teamSort)}>
                    <option value="returning">Returning minutes share</option>
                    <option value="prior">Prior minutes represented</option>
                    <option value="name">Program name</option>
                  </select>
                </label>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() =>
                    downloadCsv(
                      `basketball-roster-team-continuity-${season}.csv`,
                      toCsv(
                        ["Program", "Program ID", "Listed players", "Returning players", "Different-program players", "New-to-dataset players", "Prior minutes", "Returning minutes", "Incoming prior minutes", "Returning minutes share", "Represented prior minutes share"],
                        teamRows.map((team) => [team.team, team.team_id, team.listed_players, team.returning_players, team.transfer_players, team.new_players, team.prior_minutes, team.returning_minutes, team.incoming_prior_minutes, team.returning_minutes_share == null ? null : team.returning_minutes_share * 100, team.represented_prior_minutes_share == null ? null : team.represented_prior_minutes_share * 100]),
                      ),
                    )
                  }
                  disabled={!teamRows.length}
                >
                  Download team CSV ↓
                </button>
              </div>
              <p className="note" role="status">
                {teamRows.length.toLocaleString()} of {data.team_summaries.length.toLocaleString()} observed programs shown. {season === "2027" ? "The denominator is the source roster listing, not confirmed Division I membership." : "The denominator is the recorded appearance sample, which includes programs outside the primary forecast field."}
              </p>
              <div className="table-scroll">
                <table className="data-table">
                  <thead><tr><th>Program</th><th className="numeric">Listed</th><th className="numeric">Returning</th><th className="numeric">Incoming</th><th className="numeric">Prior minutes</th><th className="numeric">Returning share</th></tr></thead>
                  <tbody>
                    {teamRows.map((team) => (
                        <tr key={team.team_id}>
                          <td><Link href={`/basketball/programs/${team.team_id}/`}>{team.team}</Link><small>{team.transfer_players} different-program · {team.new_players} new to dataset</small></td>
                          <td className="numeric">{team.listed_players}</td>
                          <td className="numeric">{team.returning_players}</td>
                          <td className="numeric">{team.incoming_prior_minutes ? `${Math.round(team.incoming_prior_minutes).toLocaleString()} min` : "—"}</td>
                          <td className="numeric">{team.prior_minutes ? Math.round(team.prior_minutes).toLocaleString() : "—"}</td>
                          <td className="numeric">{team.returning_minutes_share == null ? "—" : `${(team.returning_minutes_share * 100).toFixed(1)}%`}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
          <div className="section-heading" style={{ marginBottom: 20 }}>
            <p>
              {rows.length.toLocaleString()} matching observations · export
              respects the season, search, observation and sort filters
            </p>
            <button
              className="button secondary"
              type="button"
              onClick={() =>
                downloadCsv(
                  `basketball-roster-observations-${season}.csv`,
                  toCsv(
                    [
                      "Player",
                      "Source ID",
                      "Current program",
                      "Current program ID",
                      "Prior observed programs",
                      "Observation",
                      "Position",
                      "Source-listed class",
                      "Prior recorded games",
                      "Prior recorded minutes",
                      "Prior minutes per game",
                      "Prior points per game",
                      "Prior rebounds per game",
                      "Prior assists per game",
                      "Prior recorded programs",
                      "Height",
                      "Weight",
                      "Source URL",
                    ],
                    rows.map((p) => [
                      p.name,
                      p.id,
                      p.team,
                      p.team_id,
                      p.previous_teams.join("; "),
                      labels[p.status],
                      p.position,
                      p.class_year,
                      p.prior_production?.games,
                      p.prior_production?.minutes,
                      p.prior_production?.mpg,
                      p.prior_production?.ppg,
                      p.prior_production?.rpg,
                      p.prior_production?.apg,
                      p.prior_production?.teams?.join("; "),
                      p.height,
                      p.weight,
                      p.source_url,
                    ]),
                  ),
                )
              }
            >
              Download CSV ↓
            </button>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>
                    {season === "2027"
                      ? "Source-listed program"
                      : "Observed program"}
                  </th>
                  <th>Prior appearances</th>
                  <th>Observation</th>
                  <th>Source-listed class</th>
                  <th>Prior recorded production</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(page * 40, page * 40 + 40).map((p) => (
                  <tr key={`${p.id}-${p.team_id}`}>
                    <td>
                      <Link href={`/basketball/player/?id=${p.id}`}>
                        {p.name}
                      </Link>
                      <small>
                        {[p.position, p.height].filter(Boolean).join(" · ")}
                      </small>
                      {p.source_url && (
                        <small>
                          <a href={p.source_url} target="_blank" rel="noreferrer">
                            Publisher profile ↗
                          </a>
                        </small>
                      )}
                    </td>
                    <td>
                      <Link href={`/basketball/programs/${p.team_id}/`}>
                        {p.team}
                      </Link>
                    </td>
                    <td>{p.previous_teams.join(", ") || "Not observed"}</td>
                    <td>{labels[p.status]}</td>
                    <td>{p.class_year || "—"}</td>
                    <td>
                      {p.prior_production ? (
                        <>
                          {p.prior_production.minutes.toLocaleString()} min · {p.prior_production.games} GP
                          <small>
                            {p.prior_production.ppg == null ? "—" : p.prior_production.ppg.toFixed(1)} PPG · {p.prior_production.mpg == null ? "—" : p.prior_production.mpg.toFixed(1)} MPG
                          </small>
                        </>
                      ) : "No prior recorded stats"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rows.length && (
            <p className="empty">
              No records match this view. Zero observed changes does not
              establish that no transfers occurred.
            </p>
          )}
          <div className="pagination">
            <span>
              {rows.length.toLocaleString()} records · page {page + 1} of{" "}
              {Math.max(1, Math.ceil(rows.length / 40))}
            </span>
            <div>
              <button
                className="button secondary"
                disabled={!page}
                onClick={() => setPage(page - 1)}
              >
                ← Previous
              </button>
              <button
                className="button secondary"
                disabled={(page + 1) * 40 >= rows.length}
                onClick={() => setPage(page + 1)}
              >
                Next →
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
