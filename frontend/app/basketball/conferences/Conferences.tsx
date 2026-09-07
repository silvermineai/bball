"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type ConferenceTeam = {
  id: number;
  name: string;
  shortName: string;
  logo: string | null;
  seed: number | null;
  confRecord: string | null;
  record: string | null;
  srs: number | null;
  srsRank: number | null;
  apRank: number | null;
};
export type Conference = {
  id: number;
  name: string;
  teams: ConferenceTeam[];
  avgSrs: number | null;
  strengthRank: number;
};
export type ConferenceRelease = { season: string; conferences: Conference[] };

type Props = { data: ConferenceRelease };
type Sort = "strength" | "srs" | "name";

const signed = (value: number | null) =>
  value == null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(2)}`;

export default function Conferences({ data }: Props) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("strength");
  const [open, setOpen] = useState<Set<number>>(
    new Set(data.conferences.slice(0, 2).map((conference) => conference.id)),
  );
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...data.conferences]
      .filter((conference) =>
        !q || `${conference.name} ${conference.teams.map((team) => team.name).join(" ")}`.toLowerCase().includes(q),
      )
      .sort((a, b) => {
        if (sort === "name") return a.name.localeCompare(b.name);
        if (sort === "srs") return (b.avgSrs ?? -Infinity) - (a.avgSrs ?? -Infinity) || a.strengthRank - b.strengthRank;
        return a.strengthRank - b.strengthRank || a.name.localeCompare(b.name);
      });
  }, [data.conferences, query, sort]);
  const toggle = (id: number) => setOpen((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <>
      <div className="page-title">
        <div className="eyebrow">League by league / {data.season}</div>
        <h1>Understand the<br /><em>conference map.</em></h1>
        <p>
          Compare every league in the published source edition, then open the
          standings that make up its average schedule-adjusted strength. This
          is a descriptive field guide, not a conference tournament forecast.
        </p>
      </div>
      <div className="strip">
        <div><strong>{data.conferences.length}</strong><span>Conferences in the source edition</span></div>
        <div><strong>{data.conferences.reduce((sum, conference) => sum + conference.teams.length, 0)}</strong><span>Programs with standings</span></div>
        <div><strong>Avg SRS</strong><span>League strength summary</span></div>
        <div><strong>{data.season}</strong><span>Recorded standings season</span></div>
      </div>
      <section className="section">
        <div className="toolbar conference-filters">
          <label className="control"><span>CONFERENCE OR PROGRAM</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Big East, Arizona…" /></label>
          <label className="control"><span>ORDER</span><select value={sort} onChange={(event) => setSort(event.target.value as Sort)}><option value="strength">Strength rank</option><option value="srs">Average SRS</option><option value="name">Conference name</option></select></label>
        </div>
        <div className="section-heading">
          <div><div className="eyebrow">{rows.length} leagues</div><h2>Strength and standings.</h2></div>
          <span className="note">Open a league for the full table.</span>
        </div>
        {!rows.length ? <p className="empty">No conference or program matches that search.</p> : (
          <div className="conference-grid">
            {rows.map((conference) => {
              const expanded = open.has(conference.id);
              const teams = expanded ? conference.teams : conference.teams.slice(0, 4);
              return (
                <section className="conference-card" key={conference.id}>
                  <button type="button" className="conference-card-header" onClick={() => toggle(conference.id)} aria-expanded={expanded}>
                    <span className="conference-rank">{conference.strengthRank}</span>
                    <span><strong>{conference.name}</strong><small>{conference.teams.length} teams · avg SRS {signed(conference.avgSrs)}</small></span>
                    <span className="conference-toggle">{expanded ? "Collapse" : "Standings"} ↓</span>
                  </button>
                  <div className="table-scroll">
                    <table className="data-table conference-table">
                      <thead><tr><th>Seed</th><th>Program</th><th className="numeric">Conf.</th><th className="numeric">Record</th><th className="numeric">SRS</th></tr></thead>
                      <tbody>{teams.map((team) => <tr key={team.id}><td>{team.seed ?? "—"}</td><td><Link href={`/basketball/programs/${team.id}/`}>{team.name}</Link>{team.apRank ? <small>AP {team.apRank}</small> : null}</td><td className="numeric">{team.confRecord ?? "—"}</td><td className="numeric">{team.record ?? "—"}</td><td className="numeric">{team.srsRank ? `#${team.srsRank}` : "—"}</td></tr>)}</tbody>
                    </table>
                  </div>
                  {!expanded && conference.teams.length > 4 ? <button type="button" className="conference-more" onClick={() => toggle(conference.id)}>+{conference.teams.length - 4} more teams</button> : null}
                </section>
              );
            })}
          </div>
        )}
      </section>
      <section className="section paper-panel">
        <div className="eyebrow">Method / Read the map correctly</div>
        <h2>Average strength is a starting point.</h2>
        <p>
          Strength rank orders conferences by the average SRS of the programs
          in this source edition. SRS is a schedule-adjusted team rating from
          the publisher feed; it is not Silvermine's adjusted efficiency model.
          Standings and records describe the completed source season and do not
          predict the next season's roster or tournament results.
        </p>
        <p>
          The directory includes the 32 conferences present in the release and
          only the programs supplied by that source. Missing programs or
          changed affiliations are coverage limits, not evidence that a league
          had no other members. Use the <Link href="/basketball/ratings/">independent ratings</Link> and <Link href="/basketball/matchups/">upcoming slate</Link> for Silvermine's separate model view.
        </p>
      </section>
    </>
  );
}
