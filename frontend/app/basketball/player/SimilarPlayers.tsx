"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { BBPlayer } from "../../_lib/basketball-types";
import { findSimilarPlayers, type SimilarPlayer } from "../../_lib/player-similarity";
import { fmt } from "../../_lib/format";

type Release = { players?: BBPlayer[] };

export default function SimilarPlayers({ id, season }: { id: string; season: number }) {
  const [rows, setRows] = useState<SimilarPlayer[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setRows(null);
    setError("");
    fetch(`/data/basketball/history/players-${encodeURIComponent(season)}.json`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Similar source profiles are unavailable.");
        return response.json() as Promise<Release>;
      })
      .then((release) => {
        if (controller.signal.aborted) return;
        const players = Array.isArray(release.players) ? release.players : [];
        const target = players.find((player) => player.id === id);
        setRows(target ? findSimilarPlayers(target, players) : []);
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError") {
          setError(reason instanceof Error ? reason.message : "Similar source profiles are unavailable.");
        }
      });
    return () => controller.abort();
  }, [id, season]);

  if (error) return <p className="note" role="status">{error}</p>;
  if (!rows) return <p className="note" role="status">Finding comparable source profiles…</p>;
  return (
    <section className="section paper-panel" aria-label="Similar source profiles">
      <div className="section-heading">
        <div>
          <div className="eyebrow">Archive lookup / same-season profiles</div>
          <h2>Who played a similar statistical role?</h2>
        </div>
        <span className="note">Descriptive similarity</span>
      </div>
      <p className="note">These matches use observed rate and workload percentiles from the same source season. They are a learning aid, not an identity link, projection or recruiting recommendation; the player index&apos;s full-sample qualification gate keeps sparse profiles out of the comparison.</p>
      {rows.length ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Player / program</th><th className="numeric">Similarity</th><th className="numeric">GP</th><th className="numeric">MIN/G</th><th className="numeric">PTS/G</th><th className="numeric">REB/G</th><th className="numeric">AST/G</th><th className="numeric">TS%</th><th>Evidence</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={`${row.id}-${row.team_id}`}>
              <th scope="row"><Link href={`/basketball/player/?id=${encodeURIComponent(row.id)}&season=${row.season}`}>{row.name}</Link><small>{row.team} · {row.position || "Position unavailable"}</small></th>
              <td className="numeric"><strong>{fmt(row.similarity, 1)}%</strong><small>{row.matchedMetrics}/11 metrics matched</small></td>
              <td className="numeric">{row.games}</td><td className="numeric">{fmt(row.mpg)}</td><td className="numeric">{fmt(row.ppg)}</td><td className="numeric">{fmt(row.rpg)}</td><td className="numeric">{fmt(row.apg)}</td><td className="numeric">{row.ts == null ? "—" : `${fmt(row.ts * 100)}%`}</td>
              <td><Link href={`/basketball/players/?season=${row.season}&q=${encodeURIComponent(row.name)}`}>Open season index →</Link></td>
            </tr>)}</tbody>
          </table>
        </div>
      ) : <p className="empty">No comparable qualified source profiles are available for this season.</p>}
    </section>
  );
}
