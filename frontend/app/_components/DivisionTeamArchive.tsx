"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { lowerDivisionTeamHref } from "../_lib/division-archive-links";
import {
  filterDivisionTeams,
  parseDivisionTeams,
  type DivisionTeam,
  type DivisionTeamSort,
} from "../_lib/division-team-archive";

const number = (value: number | null, digits = 0) => value == null || !Number.isFinite(value) ? "—" : value.toFixed(digits);

export default function DivisionTeamArchive({ division }: { division: "2" | "3" }) {
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("team") || "";
  const [teams, setTeams] = useState<DivisionTeam[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<DivisionTeamSort>("wins");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/basketball/ncaa-individual.json", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Team archive unavailable.")))
      .then((value) => { if (!controller.signal.aborted) setTeams(parseDivisionTeams(value)); })
      .catch((reason: unknown) => { if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Team archive unavailable."); });
    return () => controller.abort();
  }, []);
  const rows = useMemo(() => teams ? filterDivisionTeams(teams, division, query, sort) : [], [division, query, sort, teams]);
  const total = teams?.filter((team) => String(team.division) === division).length || 0;
  const selected = useMemo(
    () => teams?.find((team) => String(team.division) === division && String(team.team_ncaa_id) === selectedId) || null,
    [division, selectedId, teams],
  );
  const closeDossierHref = `/basketball/ratings/?division=${division}`;
  return <section className="field-card division-team-archive" aria-labelledby="division-team-title">
    <div className="eyebrow">MEN&apos;S BASKETBALL · D{division} TEAM ARCHIVE</div>
    <h2 id="division-team-title">Division team records</h2>
    <p className="muted">Observed team-directory rows from the retained NCAA final-season release. Wins, losses, games and scoring stay unavailable when the source did not supply them.</p>
    {error ? <p className="status-error" role="alert">{error}</p> : !teams ? <p className="muted">Loading division team archive…</p> : <>
      {selected ? <article className="paper-panel division-archive-dossier" aria-labelledby="division-team-dossier-title" style={{ marginBottom: 20 }}>
        <div className="section-heading" style={{ marginBottom: 12 }}><div><div className="eyebrow">Exact NCAA team ID · D{division}</div><h3 id="division-team-dossier-title">{selected.name}</h3></div><Link className="hero-link" href={closeDossierHref}>Close dossier →</Link></div>
        <p className="note">Team ID {selected.team_ncaa_id} · {selected.conference || "Conference unavailable"}. This dossier is filtered from the validated D{division} team directory; it never falls through to Division I ratings.</p>
        <div className="strip"><div><strong>{number(selected.games)}</strong><span>Games</span></div><div><strong>{number(selected.wins)}</strong><span>Wins</span></div><div><strong>{number(selected.losses)}</strong><span>Losses</span></div><div><strong>{selected.games && selected.wins != null ? `${number(100 * selected.wins / selected.games, 1)}%` : "—"}</strong><span>Win rate</span></div><div><strong>{number(selected.ppg, 1)}</strong><span>PPG</span></div></div>
        <p className="note">A dash means the retained team directory did not contain a usable numeric value. No record or rate is inferred.</p>
      </article> : selectedId ? <p className="status-error" role="alert">No D{division} team with archive ID {selectedId} is present in this validated edition. No other division was searched.</p> : null}
      <div className="division-player-controls">
        <label htmlFor="division-team-search">Search team or conference</label>
        <input id="division-team-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Program or conference" />
        <label htmlFor="division-team-sort">Rank by</label>
        <select id="division-team-sort" value={sort} onChange={(event) => setSort(event.target.value as DivisionTeamSort)}><option value="wins">Wins</option><option value="win_rate">Win rate</option><option value="ppg">Points per game</option><option value="name">Program name</option></select>
      </div>
      <p className="note">{total.toLocaleString()} retained teams · {rows.length.toLocaleString()} matching rows · season 2026.</p>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Program</th><th>Conference</th><th className="numeric">GP</th><th className="numeric">W</th><th className="numeric">L</th><th className="numeric">Win%</th><th className="numeric">PPG</th></tr></thead><tbody>{rows.map((team) => <tr key={`${division}-${team.team_ncaa_id}`}><th scope="row"><Link href={lowerDivisionTeamHref(division, team.team_ncaa_id)}>{team.name} →</Link><small>Team ID {team.team_ncaa_id}</small></th><td>{team.conference || "—"}</td><td className="numeric">{number(team.games)}</td><td className="numeric">{number(team.wins)}</td><td className="numeric">{number(team.losses)}</td><td className="numeric">{team.games && team.wins != null ? `${number(100 * team.wins / team.games, 1)}%` : "—"}</td><td className="numeric">{number(team.ppg, 1)}</td></tr>)}</tbody></table></div>
      {!rows.length ? <p className="empty">No retained teams match this filter.</p> : null}
    </>}
  </section>;
}
