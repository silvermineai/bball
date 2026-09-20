"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { BBGame } from "../../_lib/basketball-types";
import {
  loadMatchupPersonnel,
  matchupPersonnelLeaders,
  matchupPersonnelRows,
  personnelStatusLabel,
  type MatchupPersonnel,
  type MatchupPersonnelSide,
} from "../../_lib/matchup-personnel";

function metric(value: number | null, digits = 1) {
  return value == null || !Number.isFinite(value) ? "—" : value.toFixed(digits);
}

function percentage(value: number | null) {
  return value == null || !Number.isFinite(value) ? "—" : `${value.toFixed(1)}%`;
}

function PersonnelTable({ side, priorSeason }: { side: MatchupPersonnelSide; priorSeason: number }) {
  const rows = matchupPersonnelRows(side);
  const leaders = matchupPersonnelLeaders(side);
  return (
    <article className="personnel-team">
      <header>
        <div>
          <span className="eyebrow">ROSTER EVIDENCE</span>
          <h3>{side.team}</h3>
        </div>
        <strong>{side.listed_players}</strong>
      </header>
      <p className="personnel-team-summary">
        {side.returning_players} returning · {side.incoming_players} incoming · {side.new_to_dataset_players} new
        {side.ambiguous_players ? ` · ${side.ambiguous_players} check` : ""}
      </p>
      <div className="personnel-leaders" aria-label={`${side.team} prior workload leaders`}>
        <span className="eyebrow">TOP PRIOR WORKLOAD</span>
        {leaders.length ? leaders.map((leader) => (
          <div className="personnel-row" key={leader.athlete_id}>
            <span><strong>{leader.player}</strong><small>{personnelStatusLabel(leader.status)} · source-listed prior season</small></span>
            <span><strong>{metric(leader.minutes, 0)} min</strong><small>{percentage(leader.share * 100)} of reported prior minutes</small></span>
          </div>
        )) : <small className="muted">Prior minute totals unavailable; no workload leader inferred.</small>}
      </div>
      <div className="table-scroll">
        <table className="data-table personnel-table">
          <thead><tr><th>Player</th><th>Status</th><th>Prior team</th><th className="numeric">Min</th><th className="numeric">MPG</th><th className="numeric">PPG</th><th className="numeric">RPG</th><th className="numeric">APG</th><th className="numeric">SPG</th><th className="numeric">BPG</th><th className="numeric">FG%</th><th className="numeric">3P%</th><th className="numeric">FT%</th><th className="numeric">BPM</th><th className="numeric">OBPM</th><th className="numeric">DBPM</th></tr></thead>
          <tbody>{rows.map((row) => (
            <tr key={row.key}>
              <td><Link href={`/basketball/player/?id=${encodeURIComponent(row.athlete_id)}&season=${priorSeason}`}><strong>{row.player}</strong></Link><small>{row.position || "Position unavailable"} · Profile ID {row.athlete_id}</small><small>FG {row.field_goals || "—"} · 3P {row.three_pointers || "—"} · FT {row.free_throws || "—"}</small></td>
              <td><span className={`personnel-status ${row.status}`}>{personnelStatusLabel(row.status)}</span></td>
              <td>{row.prior_team || <span className="muted">—</span>}</td>
              <td className="numeric">{metric(row.minutes, 0)}</td>
              <td className="numeric">{metric(row.mpg)}</td>
              <td className="numeric">{metric(row.ppg)}</td>
              <td className="numeric">{metric(row.rpg)}</td>
              <td className="numeric">{metric(row.apg)}</td>
              <td className="numeric">{metric(row.spg)}</td>
              <td className="numeric">{metric(row.bpg)}</td>
              <td className="numeric">{percentage(row.fg_pct)}</td>
              <td className="numeric">{percentage(row.three_pct)}</td>
              <td className="numeric">{percentage(row.ft_pct)}</td>
              <td className="numeric">{metric(row.box_bpm)}</td>
              <td className="numeric">{metric(row.box_obpm)}</td>
              <td className="numeric">{metric(row.box_dbpm)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </article>
  );
}

export default function MatchupPersonnelPanel({ game }: { game: BBGame }) {
  const [personnel, setPersonnel] = useState<MatchupPersonnel | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setPersonnel(null);
    setError("");
    setLoading(true);
    loadMatchupPersonnel(game, controller.signal)
      .then((payload) => {
        if (!controller.signal.aborted) setPersonnel(payload);
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) {
          setPersonnel(null);
          setError(reason instanceof Error ? reason.message : "Exact-game personnel evidence is unavailable.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [game]);

  if (loading) return <section className="paper-panel personnel-panel" aria-live="polite"><p className="note">Loading exact-game personnel…</p></section>;
  if (error || !personnel) return <section className="paper-panel personnel-panel" role="status"><span className="eyebrow">PERSONNEL UNAVAILABLE</span><h2>No roster values shown.</h2><p className="note">{error || "The exact-game personnel response was incomplete."}</p></section>;

  return (
    <section className="paper-panel personnel-panel" aria-labelledby="personnel-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">EXACT-GAME PERSONNEL / {personnel.prior_season} WORKLOAD</span>
          <h2 id="personnel-title">Who carries the matchup?</h2>
        </div>
        <span className="note">Source athlete IDs only</span>
      </div>
      <div className="strip personnel-coverage-strip">
        <div><strong>{personnel.coverage.listed_players}</strong><span>listed players</span></div>
        <div><strong>{personnel.coverage.players_with_prior_minutes}/{personnel.coverage.listed_players}</strong><span>prior minutes</span></div>
        <div><strong>{personnel.coverage.players_with_publisher_stats}/{personnel.coverage.listed_players}</strong><span>stat lines</span></div>
        <div><strong>{personnel.coverage.players_with_box_bpm}/{personnel.coverage.listed_players}</strong><span>Box BPM</span></div>
      </div>
      <div className="personnel-grid">
        <PersonnelTable side={personnel.away} priorSeason={personnel.prior_season} />
        <PersonnelTable side={personnel.home} priorSeason={personnel.prior_season} />
      </div>
      <p className="note personnel-policy">Each prior-team stint remains a separate row. Dashes mean unavailable source evidence; they are never treated as zero.</p>
    </section>
  );
}
