"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Integrity = {
  total: number;
  valid_estimate_games: number;
  paired_box_games: number;
  missing_box_games: number;
  invalid_period_games: number;
  outlier_pace_games: number;
  score_mismatch_games: number;
};

export default function ModelIntegrity() {
  const [data, setData] = useState<Integrity | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/basketball/research/coverage", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Live integrity data is unavailable.");
        return response.json() as Promise<{ possession_validation?: Integrity | null }>;
      })
      .then((value) => {
        if (!value.possession_validation) throw new Error("This release has no possession integrity record.");
        if (!controller.signal.aborted) setData(value.possession_validation);
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError") {
          setError(reason instanceof Error ? reason.message : "Live integrity data is unavailable.");
        }
      });
    return () => controller.abort();
  }, []);

  return (
    <section className="section paper-panel" aria-live="polite">
      <div className="section-heading">
        <div>
          <div className="eyebrow">Live D1 / model-ready evidence</div>
          <h2>Know how much of the schedule survives the guards.</h2>
        </div>
        <Link href="/research/coverage/">Open the full coverage check →</Link>
      </div>
      <p className="note">
        This read-only diagnostic uses the deployed warehouse and mirrors the
        model&apos;s required fields, final scores, period and pace checks. It is
        separate from the forecast artifact, so a refresh cannot silently
        rewrite historical evaluation.
      </p>
      {error ? <p className="note">{error} <Link href="/research/coverage/">Review coverage →</Link></p> : !data ? <p className="empty" role="status">Checking completed box scores…</p> : (
        <>
          <div className="raw-stat-grid">
            <div><dt>{data.valid_estimate_games.toLocaleString()}</dt><dd>Valid possession estimates</dd></div>
            <div><dt>{data.total.toLocaleString()}</dt><dd>Completed games checked</dd></div>
            <div><dt>{data.paired_box_games.toLocaleString()}</dt><dd>Games with all required team fields</dd></div>
            <div><dt>{(data.total - data.valid_estimate_games).toLocaleString()}</dt><dd>Games withheld from features</dd></div>
          </div>
          <p className="note" style={{ marginTop: 16 }}>
            Withheld diagnostics: {data.missing_box_games.toLocaleString()} missing-field games · {data.invalid_period_games.toLocaleString()} invalid-period games · {data.outlier_pace_games.toLocaleString()} pace outliers · {data.score_mismatch_games.toLocaleString()} schedule/box-score mismatches.
          </p>
        </>
      )}
    </section>
  );
}
