"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  archivedClassGap,
  filterArchivedTeamOutlooks,
  type ArchivedRecruitingRelease,
  type ArchivedTeamSort,
} from "../../_lib/archived-recruiting";

const PAGE_SIZE = 24;

const sortLabels: Record<ArchivedTeamSort, string> = {
  rank: "Archive rank",
  departure_share: "Departure share",
  departures: "Departures",
  roster: "Roster size",
  name: "Program name",
};

export default function ArchivedTeamOutlook({ release }: { release: ArchivedRecruitingRelease }) {
  const [query, setQuery] = useState("");
  const [conference, setConference] = useState("");
  const [sort, setSort] = useState<ArchivedTeamSort>("rank");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const conferences = useMemo(
    () => [...new Set(release.teams.map((team) => team.conference))].sort((a, b) => a.localeCompare(b)),
    [release.teams],
  );
  const result = useMemo(
    () => filterArchivedTeamOutlooks(release.teams, { query, conference, sort, direction, page, pageSize: PAGE_SIZE }),
    [conference, direction, page, query, release.teams, sort],
  );
  const pageCount = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const reset = (callback: () => void) => {
    setPage(0);
    callback();
  };

  return (
    <section className="section paper-panel" aria-labelledby="archived-team-outlook">
      <div className="section-heading">
        <div>
          <div className="eyebrow">Team recruiting context / retained {release.season} snapshot</div>
          <h2 id="archived-team-outlook">See roster pressure across the field.</h2>
        </div>
        <span className="note">{release.teams.length.toLocaleString()} programs retained</span>
      </div>
      <p className="note">
        This prior-season outlook covers roster size, class labels, recorded departures and positional needs for each retained program. It is context for learning and comparison; it does not establish a current roster, commitment, eligibility or availability decision.
      </p>
      <div className="toolbar" style={{ marginTop: 16 }}>
        <label className="control">
          <span>PROGRAM OR CONFERENCE</span>
          <input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="Search programs" />
        </label>
        <label className="control">
          <span>CONFERENCE</span>
          <select value={conference} onChange={(event) => reset(() => setConference(event.target.value))}>
            <option value="">All conferences</option>
            {conferences.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="control">
          <span>ORDER</span>
          <select value={sort} onChange={(event) => reset(() => setSort(event.target.value as ArchivedTeamSort))}>
            {Object.entries(sortLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <label className="control">
          <span>DIRECTION</span>
          <select value={direction} onChange={(event) => reset(() => setDirection(event.target.value as "asc" | "desc"))}>
            <option value="asc">Lowest first</option>
            <option value="desc">Highest first</option>
          </select>
        </label>
      </div>
      <div className="section-heading" style={{ marginTop: 20, marginBottom: 12 }}>
        <p>{result.total.toLocaleString()} matching programs · page {page + 1} of {pageCount}</p>
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Program</th>
              <th>Class makeup</th>
              <th className="numeric">Roster</th>
              <th className="numeric">Departures</th>
              <th className="numeric">Share</th>
              <th>Needs</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((team) => {
              const classGap = archivedClassGap(team);
              return (
                <tr key={team.id}>
                  <td className="numeric">{team.srsRank}</td>
                  <th scope="row">
                    <Link href={`/basketball/programs/${encodeURIComponent(team.id)}/`}>{team.name}</Link>
                    <small>{team.conference} · archive ID {team.id}</small>
                    {team.departingNames.length > 0 && (
                      <details>
                        <summary>Recorded departures</summary>
                        <small>{team.departingNames.map((departure) => `${departure.name}${departure.position ? ` · ${departure.position}` : ""}`).join("; ")}</small>
                      </details>
                    )}
                  </th>
                  <td>
                    <small>{Object.entries(team.classBreakdown).map(([label, count]) => `${label} ${count}`).join(" · ") || "Unavailable"}</small>
                    {classGap > 0 && <small>+ {classGap} class label{classGap === 1 ? "" : "s"} unavailable</small>}
                  </td>
                  <td className="numeric">{team.rosterSize}</td>
                  <td className="numeric"><strong>{team.departingCount}</strong><small>{team.departingStarCount} marked star departures</small></td>
                  <td className="numeric">{team.departingShare}%</td>
                  <td>{team.positionalNeeds.length ? team.positionalNeeds.join(" · ") : "No need recorded"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!result.rows.length && <p className="empty">No retained team outlook matches these filters.</p>}
      <div className="pagination">
        <span>Retained values remain separate from the live roster observation archive.</span>
        <div>
          <button className="button secondary" type="button" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>← Previous</button>{" "}
          <button className="button secondary" type="button" disabled={page + 1 >= pageCount} onClick={() => setPage((value) => value + 1)}>Next →</button>
        </div>
      </div>
    </section>
  );
}
