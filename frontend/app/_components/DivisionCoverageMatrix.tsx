import { divisionCoverage, type DivisionCoverageGender, type DivisionCoverageSport, type LowerDivision } from "../_lib/division-coverage";

export default function DivisionCoverageMatrix({ sport, gender, division }: { sport: DivisionCoverageSport; gender: DivisionCoverageGender; division: LowerDivision }) {
  const rows = divisionCoverage(sport, gender, division);
  const sportLabel = sport === "basketball" ? "Basketball" : "Football";
  return <section className="paper-panel division-coverage-matrix" aria-labelledby={`${sport}-${gender}-d${division}-coverage-title`}>
    <div className="eyebrow">{gender === "women" ? "WOMEN'S" : "MEN'S"} {sportLabel.toUpperCase()} · D{division} COVERAGE</div>
    <h3 id={`${sport}-${gender}-d${division}-coverage-title`}>What this division supports</h3>
    <p className="note">Recorded means a division-labeled release passed the scope checks. Unavailable means the surface is intentionally withheld; another division is never substituted.</p>
    <div className="table-scroll">
      <table className="data-table">
        <thead><tr><th>Surface</th><th>Status</th><th>Release boundary</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.surface}><th scope="row">{row.label}</th><td><span className={`readiness-state readiness-state-${row.state === "recorded" ? "ready" : "missing"}`}>{row.state === "recorded" ? "Recorded" : "Unavailable"}</span></td><td>{row.note}</td></tr>)}</tbody>
      </table>
    </div>
  </section>;
}
