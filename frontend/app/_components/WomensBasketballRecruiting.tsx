"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { womensRecruitingCoverage, type WomensRecruitingSurface } from "../_lib/womens-recruiting-coverage";
import { rankWomensObservedPlayers, type WomensObservedMetric, type WomensObservedPlayer } from "../_lib/womens-recruiting-intel";

type Edition = {
  generated_at?: string;
  coverage?: {
    roster_rows?: number;
    teams?: number;
    player_season_rows?: number;
  };
  players?: WomensObservedPlayer[];
};

const date = (value?: string) => {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString("en-US", { timeZone: "UTC" });
};

export default function WomensBasketballRecruiting() {
  const [edition, setEdition] = useState<Edition | null>(null);
  const [metric, setMetric] = useState<WomensObservedMetric>("avgPoints");
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
  const observedPlayers = useMemo(
    () => rankWomensObservedPlayers(edition?.players || [], metric, 12),
    [edition?.players, metric],
  );
  const metricLabel: Record<WomensObservedMetric, string> = {
    avgPoints: "PPG",
    avgRebounds: "RPG",
    avgAssists: "APG",
    avgMinutes: "MPG",
  };

  return <section className="field-card" aria-labelledby="wbb-recruiting-title">
    <div className="eyebrow">WOMEN&apos;S RECRUITING CONTEXT · SOURCE-NATIVE</div>
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
      <section className="field-card wbb-player-card" aria-labelledby="wbb-recruiting-production-title">
        <div className="eyebrow">SOURCE-NATIVE PRODUCTION CONTEXT · 2026 EDITION</div>
        <div className="section-heading">
          <div>
            <h3 id="wbb-recruiting-production-title">Observed player shortlist</h3>
            <p className="muted">A compact way to study recorded women&apos;s player production while reviewing recruiting context. These rows are not recruiting events, commitments, eligibility decisions or a future-role ranking.</p>
          </div>
          <label className="wbb-recruiting-metric">Sort by
            <select aria-label="Observed player production metric" value={metric} onChange={(event) => setMetric(event.target.value as WomensObservedMetric)}>
              {Object.entries(metricLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
        </div>
        <div className="table-scroll">
          <table className="data-table"><thead><tr><th>Player</th><th>Team</th><th>Position</th><th className="numeric">{metricLabel[metric]}</th><th>Record basis</th></tr></thead><tbody>
            {observedPlayers.map((player) => <tr key={player.player_id}>
              <th scope="row"><Link href={`/basketball/players/?gender=women&q=${encodeURIComponent(player.player_id)}`}>{player.name}</Link><small>Exact source ID · {player.player_id}</small></th>
              <td>{player.team || "—"}</td>
              <td>{player.position || "—"}</td>
              <td className="numeric">{player.metricValue == null ? "—" : player.metricValue.toFixed(1)}</td>
              <td>Observed player-season row</td>
            </tr>)}
          </tbody></table>
        </div>
        {!observedPlayers.length ? <p className="empty">No source-native player production rows are available in this edition.</p> : null}
        <p className="note">The shortlist uses exact player IDs from the retained women&apos;s edition. Missing values stay unavailable; browse the full player table for all recorded fields and game-level context.</p>
      </section>
      <p className="muted">Roster edition captured {date(edition.generated_at)}. A roster observation describes the retained source row; it does not prove a recruiting transaction.</p>
    </>}
  </section>;
}
