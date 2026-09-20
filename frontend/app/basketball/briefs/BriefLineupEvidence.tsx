"use client";

import { useState } from "react";
import { date, fmt, signed } from "../../_lib/format";
import { buildBriefLineupEvidence, type BriefLineupEvidence } from "../../_lib/brief-lineup-evidence";
import type { MatchupStintEdition } from "../../_lib/matchup-stints";

export default function BriefLineupEvidence({
  homeName,
  awayName,
  season,
}: {
  homeName: string;
  awayName: string;
  season: number;
}) {
  const [groups, setGroups] = useState<BriefLineupEvidence[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/data/basketball/matchup-stints-${encodeURIComponent(String(season))}.json`);
      if (!response.ok) throw new Error("The retained lineup edition could not be loaded.");
      const edition = await response.json() as MatchupStintEdition;
      if (edition.season !== season) throw new Error("The lineup edition does not match this brief.");
      setGroups(buildBriefLineupEvidence(edition, [awayName, homeName]));
    } catch (reason) {
      setGroups(null);
      setError(reason instanceof Error ? reason.message : "The retained lineup edition could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="paper-panel" aria-labelledby="brief-lineup-evidence">
      <div className="section-heading">
        <div>
          <div className="eyebrow">Five-v-five archive / source-native handoff</div>
          <h3 id="brief-lineup-evidence">See which lineups actually shared the floor.</h3>
        </div>
        <button className="button secondary" type="button" onClick={load} disabled={loading}>
          {loading ? "Loading lineup evidence…" : groups ? "Refresh lineup evidence" : "Load lineup evidence"}
        </button>
      </div>
      <p className="note">
        Load the {season - 1}–{String(season).slice(-2)} archive to see the
        highest-volume source-native five-v-five samples for these programs.
        This is historical film context; it does not project a current rotation
        or join names to recruiting identities.
      </p>
      {error && <p className="status-error" role="alert">{error}</p>}
      {groups && (
        <div className="two-col" style={{ marginTop: 16 }}>
          {groups.map((group) => (
            <section className="brief-personnel" key={group.team}>
              <h4>{group.team}</h4>
              {group.rows.length ? (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead><tr><th>Five / opponent</th><th className="numeric">Poss.</th><th className="numeric">Games</th><th className="numeric">Net / 100</th><th>Last shared</th></tr></thead>
                    <tbody>{group.rows.map((row) => (
                      <tr key={`${group.team}-${row.sourceId}`}>
                        <th scope="row">
                          <details>
                            <summary>{row.opponent}</summary>
                            <small>Our five: {row.lineup.join(" · ")}</small>
                            <small>Opponent five: {row.opposingLineup.join(" · ")}</small>
                          </details>
                        </th>
                        <td className="numeric">{fmt(row.possessions, 0)}</td>
                        <td className="numeric">{fmt(row.games, 0)}</td>
                        <td className="numeric">{row.netPer100 == null ? "—" : signed(row.netPer100)}</td>
                        <td>{row.lastDate ? date(row.lastDate) : "—"}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : <p className="empty">No valid source-native five-v-five rows matched this exact team name.</p>}
            </section>
          ))}
        </div>
      )}
      {groups && <p className="note" style={{ marginTop: 14 }}>Possessions and repeat-game counts stay visible so a high margin from a small sample does not look like a stable matchup. Player labels are retained exactly as published in this archive.</p>}
    </section>
  );
}
