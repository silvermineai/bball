"use client";

import { useEffect, useState } from "react";
import type { BBGame } from "../../_lib/basketball-types";
import {
  loadMatchupPersonnel,
  matchupPersonnelRows,
  personnelStatusLabel,
  type MatchupPersonnel,
  type MatchupPersonnelSide,
} from "../../_lib/matchup-personnel";

function metric(value: number | null, digits = 1) {
  return value == null || !Number.isFinite(value) ? "—" : value.toFixed(digits);
}

function PersonnelTable({ side }: { side: MatchupPersonnelSide }) {
  const rows = matchupPersonnelRows(side);
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
      <div className="table-scroll">
        <table className="data-table personnel-table">
          <thead><tr><th>Player</th><th>Status</th><th>Prior team</th><th className="numeric">Min</th><th className="numeric">PPG</th><th className="numeric">RPG</th><th className="numeric">APG</th><th className="numeric">BPM</th></tr></thead>
          <tbody>{rows.map((row) => (
            <tr key={row.key}>
              <td><strong>{row.player}</strong><small>{row.position || "Position unavailable"}</small></td>
              <td><span className={`personnel-status ${row.status}`}>{personnelStatusLabel(row.status)}</span></td>
              <td>{row.prior_team || <span className="muted">—</span>}</td>
              <td className="numeric">{metric(row.minutes, 0)}</td>
              <td className="numeric">{metric(row.ppg)}</td>
              <td className="numeric">{metric(row.rpg)}</td>
              <td className="numeric">{metric(row.apg)}</td>
              <td className="numeric">{metric(row.box_bpm)}</td>
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
        <PersonnelTable side={personnel.away} />
        <PersonnelTable side={personnel.home} />
      </div>
      <p className="note personnel-policy">Each prior-team stint remains a separate row. Dashes mean unavailable source evidence; they are never treated as zero.</p>
    </section>
  );
}
