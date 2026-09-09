"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  loadNcaaPlayerRankingSnapshot,
  type SnapshotRow,
} from "../../_lib/ncaa-player-ranking-snapshot";

const valueLabel = (row: SnapshotRow) => {
  if (row.value == null) return "—";
  if (row.metric === "ts") return `${row.value.toFixed(1)}%`;
  if (row.metric === "ppg") return row.value.toFixed(1);
  return row.value.toFixed(2);
};

export default function PlayerRankingSnapshot({
  id,
  season,
}: {
  id: string;
  season: number;
}) {
  const [rows, setRows] = useState<SnapshotRow[] | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setRows(null);
    loadNcaaPlayerRankingSnapshot(id, season, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setRows(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) setRows([]);
      });
    return () => controller.abort();
  }, [id, season]);

  return (
    <section className="section paper-panel" aria-label="Player ranking snapshot">
      <div className="section-heading">
        <div>
          <div className="eyebrow">Live source rankings / {season - 1}–{String(season).slice(-2)}</div>
          <h2>Where this player lands.</h2>
        </div>
        <Link href={`/basketball/ncaa-rankings/?season=${season}&q=${encodeURIComponent(id)}`}>
          Tune the full board →
        </Link>
      </div>
      <p className="note">
        Exact NCAA player ID match, refreshed from the ranking API. Percentiles use each board&apos;s full qualified cohort; a missing row means the player did not clear that board&apos;s stated sample, not that the source recorded zero.
      </p>
      {!rows ? (
        <p className="empty" role="status">Loading ranking snapshot…</p>
      ) : (
        <div className="strip">
          {rows.map((row) => (
            <div key={row.metric}>
              <strong>
                {row.status === "qualified" && row.rank != null
                  ? `#${row.rank}`
                  : row.status === "not_qualified"
                    ? "Not qualified"
                    : "Unavailable"}
              </strong>
              <span>{row.label}</span>
              <small>
                {row.status === "qualified"
                  ? `${valueLabel(row)} · ${row.percentile?.toFixed(1)}th percentile · ${row.total.toLocaleString()} qualified`
                  : `${row.note}${row.total ? ` · ${row.total.toLocaleString()} on board` : ""}`}
              </small>
            </div>
          ))}
        </div>
      )}
      <p className="note" style={{ marginTop: 16 }}>
        Balanced production and impact + production are descriptive Silvermine shortlist indices built from the retained source rows. They are not recruiting grades, eligibility decisions or forecast inputs.
      </p>
    </section>
  );
}
