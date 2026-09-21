"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { womensRecruitingCoverage, type WomensRecruitingSurface } from "../_lib/womens-recruiting-coverage";

type Edition = {
  generated_at?: string;
  coverage?: {
    roster_rows?: number;
    teams?: number;
    player_season_rows?: number;
  };
};

const date = (value?: string) => {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString("en-US", { timeZone: "UTC" });
};

export default function WomensBasketballRecruiting() {
  const [edition, setEdition] = useState<Edition | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/basketball/womens-edition.json", { signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<Edition> : null)
      .then((value) => { if (!controller.signal.aborted) setEdition(value); })
      .catch(() => { if (!controller.signal.aborted) setEdition(null); });
    return () => controller.abort();
  }, []);

  const coverage = womensRecruitingCoverage({
    rosterRows: edition?.coverage?.roster_rows || 0,
    rosterTeams: edition?.coverage?.teams || 0,
    playerSeasonRows: edition?.coverage?.player_season_rows || 0,
  });

  return <section className="field-card" aria-labelledby="wbb-recruiting-title">
    <div className="eyebrow">WOMEN&apos;S RECRUITING · D1</div>
    <h2 id="wbb-recruiting-title">Roster context with the boundary attached</h2>
    <p className="muted">Women&apos;s roster and player production rows are available for study. A women&apos;s recruiting event feed has not passed the import contract, so no men&apos;s recruiting records, commitments or eligibility claims are substituted here.</p>
    {!edition ? <p className="muted">Loading women&apos;s recruiting coverage…</p> : <>
      <div className="strip" aria-label="Women&apos;s recruiting coverage counts">
        {coverage.map((surface) => <div key={surface.key}><strong>{surface.rows.toLocaleString()}</strong><span>{surface.label}</span></div>)}
      </div>
      <div className="table-scroll">
        <table className="data-table"><thead><tr><th>Surface</th><th>Status</th><th className="numeric">Rows</th><th>Interpretation</th></tr></thead><tbody>
          {coverage.map((surface: WomensRecruitingSurface) => <tr key={surface.key}><th scope="row">{surface.label}</th><td><span className={`readiness-state readiness-state-${surface.status === "recorded" ? "ready" : "missing"}`}>{surface.status === "recorded" ? "Recorded" : "Unavailable"}</span></td><td className="numeric">{surface.rows.toLocaleString()}</td><td>{surface.note}</td></tr>)}
        </tbody></table>
      </div>
      <div className="hero-actions">
        <Link className="button" href="/basketball/players/?gender=women&division=1">Browse women&apos;s player table ↗</Link>
        <Link className="button secondary" href="/basketball/?gender=women&division=1">Open women&apos;s dashboard ↗</Link>
        <Link className="hero-link" href="/research/coverage/?sport=basketball&gender=women&division=1">Review division coverage →</Link>
      </div>
      <p className="muted">Roster edition captured {date(edition.generated_at)}. A roster observation describes the retained source row; it does not prove a recruiting transaction.</p>
    </>}
  </section>;
}
