"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { womensRecruitingCoverage, type WomensRecruitingSurface } from "../_lib/womens-recruiting-coverage";
import { rankWomensObservedPlayers, rankWomensRecruitingProspects, summarizeWomensRecruitingProspects, validateWomensRecruitingRelease, womensRecruitingProspectCsvHeaders, womensRecruitingProspectCsvRows, womensRecruitingRankCoverage, type WomensObservedMetric, type WomensObservedPlayer, type WomensRecruitingRelease } from "../_lib/womens-recruiting-intel";
import { downloadCsv, toCsv } from "../_lib/csv";

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
  const [prospectEdition, setProspectEdition] = useState<WomensRecruitingRelease | null>(null);
  const [prospectQuery, setProspectQuery] = useState("");
  const [prospectLimit, setProspectLimit] = useState<20 | 50 | 100 | 1000>(20);
  const [metric, setMetric] = useState<WomensObservedMetric>("avgPoints");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/basketball/womens-edition.json", { signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<Edition> : null)
      .then((value) => { if (!controller.signal.aborted) setEdition(value); })
      .catch(() => { if (!controller.signal.aborted) setEdition(null); });
    fetch("/data/basketball/womens-recruiting.json", { signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<unknown> : null)
      .then((value) => { if (!controller.signal.aborted) setProspectEdition(validateWomensRecruitingRelease(value)); })
      .catch(() => { if (!controller.signal.aborted) setProspectEdition(null); });
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
  const matchingProspects = useMemo(() => rankWomensRecruitingProspects(prospectEdition?.records || [], prospectQuery, prospectEdition?.records.length || 1), [prospectEdition?.records, prospectQuery]);
  const prospects = useMemo(() => matchingProspects.slice(0, prospectLimit), [matchingProspects, prospectLimit]);
  const prospectStatusRows = useMemo(() => summarizeWomensRecruitingProspects(prospectEdition?.records || []), [prospectEdition?.records]);
  const prospectRankCoverage = useMemo(() => womensRecruitingRankCoverage(prospectEdition?.records || []), [prospectEdition?.records]);
  const downloadProspects = () => {
    if (!prospectEdition) return;
    downloadCsv(
      `womens-recruiting-${prospectEdition.season}-filtered.csv`,
      toCsv([...womensRecruitingProspectCsvHeaders], womensRecruitingProspectCsvRows(matchingProspects, prospectEdition.season)),
    );
  };
  const metricLabel: Record<WomensObservedMetric, string> = {
    avgPoints: "PPG",
    avgRebounds: "RPG",
    avgAssists: "APG",
    avgMinutes: "MPG",
  };

  return <section className="field-card" aria-labelledby="wbb-recruiting-title">
    <div className="eyebrow">WOMEN&apos;S RECRUITING CONTEXT · SOURCE-NATIVE</div>
    <h2 id="wbb-recruiting-title">Roster context with the boundary attached</h2>
    <p className="muted">Women&apos;s roster and player production rows are available for study. The women&apos;s prospect cohort is published separately from recruiting events; missing ranks, commitments and eligibility fields remain unavailable, and no men&apos;s recruiting records are substituted.</p>
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
      <section className="field-card wbb-player-card" aria-labelledby="wbb-recruiting-prospects-title">
        <div className="eyebrow">WOMEN&apos;S PROSPECT COHORT · 2027 SOURCE IDS</div>
        <div className="section-heading">
          <div><h3 id="wbb-recruiting-prospects-title">Observed prospect grades and source ranks</h3><p className="muted">Grades and dimensional ranks stay in their publisher cohorts. Missing rank or commitment fields remain unavailable when the source does not return them.</p></div>
          <div className="button-row">
            <label className="wbb-recruiting-metric">Find a prospect <input aria-label="Find a women's prospect" value={prospectQuery} onChange={(event) => setProspectQuery(event.target.value)} placeholder="Name, school, or ID" /></label>
            <label className="wbb-recruiting-metric">Show <select aria-label="Women prospect rows to show" value={prospectLimit} onChange={(event) => setProspectLimit(Number(event.target.value) as 20 | 50 | 100 | 1000)}><option value={20}>20 rows</option><option value={50}>50 rows</option><option value={100}>100 rows</option><option value={1000}>All retained</option></select></label>
            <button className="button secondary" type="button" onClick={downloadProspects} disabled={!prospectEdition || !matchingProspects.length}>Download filtered CSV ↓</button>
          </div>
        </div>
        {prospectEdition ? <>
          <div className="strip" aria-label="Women&apos;s prospect coverage">
            <div><strong>{prospectEdition.coverage.prospects.toLocaleString()}</strong><span>Prospects</span></div>
            <div><strong>{prospectEdition.coverage.graded.toLocaleString()}</strong><span>Graded</span></div>
            <div><strong>{prospectRankCoverage.national.toLocaleString()}</strong><span>National ranks</span></div>
            <div><strong>{prospectRankCoverage.position.toLocaleString()}</strong><span>Position ranks</span></div>
            <div><strong>{prospectRankCoverage.state.toLocaleString()}</strong><span>State ranks</span></div>
            <div><strong>{prospectRankCoverage.region.toLocaleString()}</strong><span>Region ranks</span></div>
            <div><strong>{prospectEdition.coverage.committed.toLocaleString()}</strong><span>Commitment IDs</span></div>
          </div>
          <p className="note">The source status mix is shown below for planning context. “Verbal” is retained publisher language; with zero destination IDs in this release, it is not treated as a school commitment or fit join.</p>
          <div className="table-scroll"><table className="data-table"><thead><tr><th>Source status</th><th className="numeric">Prospects</th><th className="numeric">Grade coverage</th><th className="numeric">Average grade</th><th className="numeric">Exact IDs</th><th className="numeric">Destination IDs</th></tr></thead><tbody>{prospectStatusRows.map((row) => <tr key={row.status}><th scope="row">{row.status}</th><td className="numeric">{row.prospects.toLocaleString()}</td><td className="numeric">{row.graded.toLocaleString()}</td><td className="numeric">{row.averageGrade == null ? "—" : row.averageGrade.toFixed(1)}</td><td className="numeric">{row.exactIds.toLocaleString()}</td><td className="numeric">{row.destinationIds.toLocaleString()}</td></tr>)}</tbody></table></div>
          <p className="note">Showing {prospects.length.toLocaleString()} of {prospectEdition.records.length.toLocaleString()} validated prospect rows. Choose “All retained” to inspect the complete source cohort.</p>
          <div className="table-scroll"><table className="data-table"><thead><tr><th>Prospect</th><th>Position</th><th className="numeric">National rank</th><th className="numeric">Position rank</th><th className="numeric">State rank</th><th className="numeric">Region rank</th><th className="numeric">Grade</th><th>High school</th><th>Hometown</th><th>Status</th></tr></thead><tbody>{prospects.map((prospect) => <tr key={prospect.athlete_id}><th scope="row"><strong>{prospect.name}</strong><small>Exact source ID · {prospect.athlete_id}</small></th><td>{prospect.position || "—"}</td><td className="numeric">{prospect.rank == null ? "—" : `#${prospect.rank}`}</td><td className="numeric">{prospect.position_rank == null ? "—" : `#${prospect.position_rank}`}</td><td className="numeric">{prospect.state_rank == null ? "—" : `#${prospect.state_rank}`}</td><td className="numeric">{prospect.region_rank == null ? "—" : `#${prospect.region_rank}`}</td><td className="numeric">{prospect.grade == null ? "—" : prospect.grade}</td><td>{prospect.high_school || "—"}</td><td>{prospect.hometown || "—"}</td><td>{prospect.status || "—"}</td></tr>)}</tbody></table></div>
          {!prospects.length ? <p className="empty">No women&apos;s prospects match this search.</p> : null}
          <p className="note">Receipt-backed women&apos;s release edition <code>{prospectEdition.edition.slice(0, 12)}…</code> · captured {date(prospectEdition.captured_at)}. Each displayed rank is a source cohort field; this release currently reports no national or dimensional ranks, so the table remains grade-sorted observed evidence rather than a Silvermine ranking.</p>
        </> : <p className="muted">Women&apos;s prospect release unavailable or failed its integrity checks; no rows are substituted.</p>}
      </section>
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
