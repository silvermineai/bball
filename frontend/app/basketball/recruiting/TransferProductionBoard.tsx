import Link from "next/link";
import { rankRecruitingProduction, type RecruitingProductionRankRow } from "../../_lib/recruiting-production-rank";
import type { ProspectProgram } from "../../_lib/prospect-schools";
import type { RecruitingPerson } from "../../_lib/recruiting";

const number = (value: number | null | undefined, digits = 1) => value == null ? "—" : value.toFixed(digits);
const percent = (value: number | null | undefined) => value == null ? "—" : `${(value * 100).toFixed(1)}%`;

function destinationName(teamId: string, programs: ProspectProgram[]) {
  return programs.find((program) => program.id === teamId)?.name || null;
}

function ProductionRow({ row, rank, programs }: { row: RecruitingProductionRankRow; rank: number; programs: ProspectProgram[] }) {
  const { person, stats } = row;
  const destination = destinationName(person.team_id, programs);
  return <tr>
    <td className="numeric"><strong>#{rank}</strong></td>
    <th scope="row"><strong>{person.name}</strong><small>{person.category} · source player ID {stats.id}</small></th>
    <td>{destination ? <Link href={`/basketball/programs/${encodeURIComponent(person.team_id)}/`}>{destination}</Link> : "Destination unavailable"}<small>{destination ? "Recorded destination" : "No exact directory match"}</small></td>
    <td>{stats.team}<small>{stats.season} prior season</small></td>
    <td className="numeric">{stats.games}</td>
    <td className="numeric">{number(stats.mpg)}</td>
    <td className="numeric"><strong>{number(stats.ppg)}</strong></td>
    <td className="numeric">{number(stats.rpg)}</td>
    <td className="numeric">{number(stats.apg)}</td>
    <td className="numeric">{percent(stats.ts)}</td>
    <td className="numeric">{row.score == null ? "—" : row.score.toFixed(2)}<small>{row.scoredFields}/{row.availableFields} fields</small></td>
  </tr>;
}

export default function TransferProductionBoard({ people, programs, edition, reviewedAt }: { people: RecruitingPerson[]; programs: ProspectProgram[]; edition: string; reviewedAt: string }) {
  const rows = rankRecruitingProduction(people);
  const ranked = rows.filter((row) => row.score != null).slice(0, 20);
  const eligible = rows.length;
  const priorSeasons = [...new Set(ranked.map((row) => row.stats.season))].sort((a, b) => a - b);
  if (!eligible) return null;
  return <section className="section paper-panel" aria-labelledby="transfer-production-board">
    <div className="section-heading">
      <div><div className="eyebrow">Transfer production / exact prior player IDs</div><h2 id="transfer-production-board">Which incoming players carried prior workload?</h2></div>
      <span className="note">{ranked.length.toLocaleString()} ranked · {eligible.toLocaleString()} eligible</span>
    </div>
    <p className="note">The index standardizes the retained transfer cohort&apos;s prior MPG, scoring, rebounding, playmaking, steals, blocks, true shooting and effective field-goal rate. It is a transparent comparison aid; missing fields stay missing and it does not project a new-school role, eligibility or future performance.</p>
    <div className="strip" aria-label="Transfer production coverage" style={{ marginBottom: 16 }}>
      <div><strong>{eligible.toLocaleString()}</strong><span>Transfers with stats</span></div>
      <div><strong>{ranked.length.toLocaleString()}</strong><span>With ≥4 scored fields</span></div>
      <div><strong>{priorSeasons.length ? priorSeasons.join(" / ") : "—"}</strong><span>Prior season</span></div>
      <div><strong>{new Date(reviewedAt).toLocaleDateString("en-US", { timeZone: "UTC" })}</strong><span>Reviewed UTC</span></div>
    </div>
    <div className="table-scroll"><table className="data-table">
      <thead><tr><th>Rank</th><th>Player</th><th>Recorded destination</th><th>Prior program</th><th className="numeric">GP</th><th className="numeric">MPG</th><th className="numeric">PPG</th><th className="numeric">RPG</th><th className="numeric">APG</th><th className="numeric">TS%</th><th className="numeric">Index</th></tr></thead>
      <tbody>{ranked.map((row, index) => <ProductionRow key={row.stats.id} row={row} rank={index + 1} programs={programs} />)}</tbody>
    </table></div>
    <p className="note" style={{ marginTop: 12 }}>Retained release edition <code>{edition}</code>. Rows require at least 10 recorded games and four non-constant source fields. The rank is cohort-relative and should be read alongside the full player stat record.</p>
  </section>;
}
