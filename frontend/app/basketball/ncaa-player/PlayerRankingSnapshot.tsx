"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  loadNcaaPlayerRankingSnapshot,
  rankingSnapshotSearch,
  summarizeRankingSnapshot,
  type SnapshotRow,
} from "../../_lib/ncaa-player-ranking-snapshot";

const valueLabel = (row: SnapshotRow) => {
  if (row.value == null) return "—";
  if (row.metric === "ts") return `${row.value.toFixed(1)}%`;
  if (row.metric === "ppg" || row.metric === "fpg") return row.value.toFixed(1);
  return row.value.toFixed(2);
};

/** Keep year-over-year movement explicit when either season lacks a rank. */
export function rankingTrendLabel(row: SnapshotRow) {
  const trend = row.trend;
  if (!trend) return "Prior season not queried";
  if (trend.rankDelta == null) {
    return trend.previousStatus === "not_qualified"
      ? `Prior ${trend.previousSeason - 1}–${String(trend.previousSeason).slice(-2)}: sample not met`
      : `Prior ${trend.previousSeason - 1}–${String(trend.previousSeason).slice(-2)}: no board evidence`;
  }
  if (trend.rankDelta === 0) return `→ unchanged at #${trend.previousRank}`;
  return trend.rankDelta > 0
    ? `↑ ${trend.rankDelta} rank${trend.rankDelta === 1 ? "" : "s"} from #${trend.previousRank}`
    : `↓ ${Math.abs(trend.rankDelta)} rank${Math.abs(trend.rankDelta) === 1 ? "" : "s"} from #${trend.previousRank}`;
}

export default function PlayerRankingSnapshot({
  id,
  season,
}: {
  id: string;
  season: number;
}) {
  const [rows, setRows] = useState<SnapshotRow[] | null>(null);
  const summary = rows ? summarizeRankingSnapshot(rows) : null;
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
          <div className="eyebrow">Player ranking profile / {season - 1}–{String(season).slice(-2)}</div>
          <h2>See the shape, then inspect the sample.</h2>
        </div>
        <Link href={`/basketball/ncaa-rankings/?season=${season}&q=${encodeURIComponent(id)}`}>
          Tune the full board →
        </Link>
      </div>
      <p className="note">
        Exact player ID match, refreshed from the ranking API. Percentiles use each board&apos;s full qualified cohort; a missing row means the player did not clear that board&apos;s stated sample, not that the archive recorded zero.
      </p>
      {!rows ? (
        <p className="empty" role="status">Loading ranking snapshot…</p>
      ) : summary ? (
        <>
          <div className="strip ranking-profile-summary" aria-label="Player ranking profile summary">
            <div><strong>{summary.qualified}/{summary.total}</strong><span>Boards qualified</span></div>
            <div><strong>{summary.medianPercentile == null ? "—" : `${summary.medianPercentile.toFixed(1)}%`}</strong><span>Median qualified percentile</span></div>
            <div><strong>{summary.strongest ? summary.strongest.label : "—"}</strong><span>Strongest relative board</span></div>
            <div><strong>{summary.topDecile}</strong><span>Top-decile boards</span></div>
          </div>
          <div className="ranking-profile-list" aria-label="Player percentile profile">
            {rows.map((row) => {
              const qualified = row.status === "qualified" && row.rank != null && row.percentile != null;
              const href = `/basketball/ncaa-rankings/?${rankingSnapshotSearch(row.metric, season, id)}`;
              return <article className={`ranking-profile-row${qualified ? "" : " is-unavailable"}`} key={row.metric}>
                <div className="ranking-profile-label">
                  <Link href={href}>{row.label} →</Link>
                  <span>{qualified ? `#${row.rank} of ${row.total.toLocaleString()}` : row.status === "not_qualified" ? "Sample not met" : "Board unavailable"}</span>
                </div>
                <div className="ranking-profile-track" aria-hidden="true">
                  <span style={{ width: qualified ? `${Math.max(2, row.percentile!)}%` : "0%" }} />
                </div>
                <strong>{qualified ? `${row.percentile!.toFixed(1)}%` : "—"}</strong>
                <small>{qualified ? valueLabel(row) : row.note}</small>
                <small className="ranking-profile-trend">{rankingTrendLabel(row)}</small>
              </article>;
            })}
          </div>
        </>
      ) : null}
      <p className="note" style={{ marginTop: 16 }}>
        The summary compares percentile ranks only; it does not average points, percentages and impact values together. Balanced production and impact + production are descriptive shortlist indices built from retained rows. They are not recruiting grades, eligibility decisions or forecast inputs.
      </p>
    </section>
  );
}
