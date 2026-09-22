import Link from "next/link";
import { auditRecruitingDestinationRoster, recruitingProductionProfile, rankRecruitingProduction, summarizeRecruitingDestinationProduction, type RecruitingProductionRankRow } from "../../_lib/recruiting-production-rank";
import type { ProspectProgram } from "../../_lib/prospect-schools";
import type { RecruitingPerson } from "../../_lib/recruiting";
import type { BBRosters } from "../../_lib/basketball-types";

const number = (value: number | null | undefined, digits = 1) => value == null ? "—" : value.toFixed(digits);
const percent = (value: number | null | undefined) => value == null ? "—" : `${(value * 100).toFixed(1)}%`;

function destinationName(teamId: string, programs: ProspectProgram[]) {
  return programs.find((program) => program.id === teamId)?.name || null;
}

function ProductionRow({ row, rank, programs }: { row: RecruitingProductionRankRow; rank: number; programs: ProspectProgram[] }) {
  const { person, stats } = row;
  const destination = destinationName(person.team_id, programs);
  const profile = recruitingProductionProfile(stats);
  const profileValue = (entry: typeof profile[number]) => entry.format === "percent"
    ? percent(entry.value)
    : number(entry.value);
  return <tr>
    <td className="numeric"><strong>#{rank}</strong></td>
    <th scope="row"><Link href={`/basketball/player/?id=${encodeURIComponent(stats.id)}&season=${stats.season}`}><strong>{person.name}</strong></Link><small>{person.category} · exact source player ID {stats.id}</small></th>
    <td>{destination ? <Link href={`/basketball/programs/${encodeURIComponent(person.team_id)}/`}>{destination}</Link> : "Destination unavailable"}<small>{destination ? "Recorded destination" : "No exact directory match"}</small></td>
    <td>{stats.team}<small>{stats.season} prior season</small></td>
    <td className="numeric">{stats.games}</td>
    <td className="numeric">{number(stats.mpg)}</td>
    <td className="numeric"><strong>{number(stats.ppg)}</strong></td>
    <td className="numeric">{number(stats.rpg)}</td>
    <td className="numeric">{number(stats.apg)}</td>
    <td className="numeric">{percent(stats.ts)}</td>
    <td><span>{profile.slice(0, 2).map((entry) => `${entry.label} ${profileValue(entry)}`).join(" · ")}</span><small>{profile.slice(2, 4).map((entry) => `${entry.label} ${profileValue(entry)}`).join(" · ")}</small><small>{profile.slice(4).map((entry) => `${entry.label} ${profileValue(entry)}`).join(" · ")}</small></td>
    <td className="numeric">{row.score == null ? "—" : row.score.toFixed(2)}<small>{row.scoredFields}/{row.availableFields} fields</small></td>
  </tr>;
}

export default function TransferProductionBoard({ people, programs, rosters, edition, reviewedAt }: { people: RecruitingPerson[]; programs: ProspectProgram[]; rosters: BBRosters; edition: string; reviewedAt: string }) {
  const rows = rankRecruitingProduction(people);
  const ranked = rows.filter((row) => row.score != null);
  const destinations = summarizeRecruitingDestinationProduction(people);
  const rosterAudits = auditRecruitingDestinationRoster(people, rosters);
  const eligible = rows.length;
  const priorSeasons = [...new Set(ranked.map((row) => row.stats.season))].sort((a, b) => a - b);
  if (!eligible) return null;
  return <section className="section paper-panel" aria-labelledby="transfer-production-board">
    <div className="section-heading">
      <div><div className="eyebrow">Transfer production / exact prior player IDs</div><h2 id="transfer-production-board">Which incoming players carried prior workload?</h2></div>
      <span className="note">{ranked.length.toLocaleString()} ranked · {eligible.toLocaleString()} eligible</span>
    </div>
    <p className="note">The index standardizes every eligible retained transfer row&apos;s prior MPG, scoring, rebounding, playmaking, steals, blocks, true shooting and effective field-goal rate. Each row also shows retained raw turnover, shooting and free-throw rate context. Each row links to its exact source player file. It is a transparent comparison aid; missing fields stay missing and it does not project a new-school role, eligibility or future performance.</p>
    <div className="strip" aria-label="Transfer production coverage" style={{ marginBottom: 16 }}>
      <div><strong>{eligible.toLocaleString()}</strong><span>Transfers with stats</span></div>
      <div><strong>{ranked.length.toLocaleString()}</strong><span>With ≥4 scored fields</span></div>
      <div><strong>{priorSeasons.length ? priorSeasons.join(" / ") : "—"}</strong><span>Prior season</span></div>
      <div><strong>{new Date(reviewedAt).toLocaleDateString("en-US", { timeZone: "UTC" })}</strong><span>Reviewed UTC</span></div>
    </div>
    <div className="table-scroll"><table className="data-table">
      <thead><tr><th>Rank</th><th>Player</th><th>Recorded destination</th><th>Prior program</th><th className="numeric">GP</th><th className="numeric">MPG</th><th className="numeric">PPG</th><th className="numeric">RPG</th><th className="numeric">APG</th><th className="numeric">TS%</th><th>Raw profile</th><th className="numeric">Index</th></tr></thead>
      <tbody>{ranked.map((row, index) => <ProductionRow key={row.stats.id} row={row} rank={index + 1} programs={programs} />)}</tbody>
    </table></div>
    {destinations.length > 0 && <section style={{ marginTop: 24 }} aria-labelledby="transfer-destination-summary">
      <div className="section-heading" style={{ marginBottom: 10 }}><div><div className="eyebrow">Destination rollup / exact source IDs</div><h3 id="transfer-destination-summary">How much recorded production is arriving at each destination?</h3></div><span className="note">Game-weighted rates</span></div>
      <p className="note">Each destination includes only reviewed transfer rows with an exact source player ID and at least 10 recorded games. Rates are weighted by games among the retained rows; they are context for the incoming class, not a lineup projection.</p>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Destination</th><th className="numeric">Additions</th><th className="numeric">Prior programs</th><th className="numeric">Recorded GP</th><th className="numeric">MPG</th><th className="numeric">PPG</th><th className="numeric">RPG</th><th className="numeric">APG</th><th className="numeric">TS%</th></tr></thead><tbody>{destinations.map((row) => { const destination = destinationName(row.teamId, programs); return <tr key={row.teamId}><th scope="row">{destination ? <Link href={`/basketball/programs/${encodeURIComponent(row.teamId)}/`}>{destination}</Link> : "Destination unavailable"}<small>{destination ? "Exact program directory match" : `Team ID ${row.teamId}`}</small></th><td className="numeric"><strong>{row.additions}</strong></td><td className="numeric">{row.priorPrograms}</td><td className="numeric">{row.games}</td><td className="numeric">{number(row.weightedMpg)}</td><td className="numeric"><strong>{number(row.weightedPpg)}</strong></td><td className="numeric">{number(row.weightedRpg)}</td><td className="numeric">{number(row.weightedApg)}</td><td className="numeric">{percent(row.weightedTs)}</td></tr>; })}</tbody></table></div>
    </section>}
    {rosterAudits.length > 0 && <section style={{ marginTop: 24 }} aria-labelledby="transfer-roster-audit">
      <div className="section-heading" style={{ marginBottom: 10 }}><div><div className="eyebrow">Roster handoff / exact source IDs</div><h3 id="transfer-roster-audit">Are incoming transfer IDs visible in the retained roster release?</h3></div><span className="note">Source listing audit</span></div>
      <p className="note">This audit compares each reviewed transfer&apos;s exact prior player ID with the retained {rosters.season} roster release. “Not observed” is missing source evidence, not a departure; “elsewhere” and “multiple programs” may reflect source timing or unresolved movement and do not establish eligibility or a completed transfer.</p>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Destination</th><th className="numeric">Incoming IDs</th><th className="numeric">Exact roster IDs</th><th className="numeric">At destination</th><th className="numeric">Elsewhere</th><th className="numeric">Multiple programs</th><th className="numeric">Not observed</th></tr></thead><tbody>{rosterAudits.map((row) => { const destination = destinationName(row.teamId, programs); return <tr key={`roster-audit-${row.teamId}`}><th scope="row">{destination ? <Link href={`/basketball/programs/${encodeURIComponent(row.teamId)}/`}>{destination}</Link> : "Destination unavailable"}<small>{destination ? "Exact program directory match" : `Team ID ${row.teamId}`}</small></th><td className="numeric">{row.incomingRows}</td><td className="numeric"><strong>{row.exactRosterIds}</strong></td><td className="numeric">{row.atDestination}</td><td className="numeric">{row.elsewhere}</td><td className="numeric">{row.multiplePrograms}</td><td className="numeric">{row.notObserved}</td></tr>; })}</tbody></table></div>
      <p className="note" style={{ marginTop: 12 }}>Roster release season {rosters.season} · prior season {rosters.previous_season} · dataset {rosters.source?.dataset || "unavailable"} · receipt {rosters.source?.sha256 ? <code>{rosters.source.sha256}</code> : "unavailable"}.</p>
    </section>}
    <p className="note" style={{ marginTop: 12 }}>Retained release edition <code>{edition}</code>. Rows require at least 10 recorded games and four non-constant source fields. The rank is cohort-relative and should be read alongside the full player stat record.</p>
  </section>;
}
