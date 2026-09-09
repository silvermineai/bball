"use client";

import { useEffect, useState } from "react";
import { date } from "../../_lib/format";

type CoverageResponse = {
  coverage: Array<{ dataset: string; rows: number }>;
  source_receipts: Array<{ dataset: string; source_count: number; latest_source_at: string | null }>;
};

const labels: Record<string, string> = {
  games: "Games",
  player_box: "Player box rows",
  ncaa_player_box: "NCAA player-game rows",
  ncaa_player_shooting: "NCAA shooting profiles",
  forecasts: "Forecast registrations",
  unresolved: "Identity-review rows",
};

export default function CoverageLive() {
  const [data, setData] = useState<CoverageResponse | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/basketball/research/coverage", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("The live D1 coverage check is unavailable.");
        return response.json() as Promise<CoverageResponse>;
      })
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError") setError(reason instanceof Error ? reason.message : "The live D1 coverage check is unavailable.");
      });
    return () => controller.abort();
  }, []);

  const rows = data?.coverage.filter((row) => labels[row.dataset]) || [];
  return (
    <section className="section" aria-live="polite">
      <div className="section-heading">
        <div>
          <div className="eyebrow">Live Cloudflare check</div>
          <h2>Confirm the warehouse behind the page.</h2>
        </div>
        <span className="note">{data ? "D1 read successful" : error ? "D1 check unavailable" : "Checking D1…"}</span>
      </div>
      <p className="note">This read-only check queries the deployed Cloudflare D1 database, rather than the bundled static files. It gives the current remote row counts and the latest source receipt clocks used by the research publisher.</p>
      {error ? <p className="status-error" role="alert">{error}</p> : !data ? <p className="empty" role="status">Loading remote coverage…</p> : (
        <>
          <div className="strip">
            {rows.map((row) => <div key={row.dataset}><strong>{Number(row.rows || 0).toLocaleString()}</strong><span>{labels[row.dataset]}</span></div>)}
          </div>
          <div className="table-scroll" style={{ marginTop: 20 }}>
            <table className="data-table">
              <thead><tr><th>Source dataset</th><th className="numeric">D1 receipts</th><th>Latest source clock</th></tr></thead>
              <tbody>{data.source_receipts.map((receipt) => <tr key={receipt.dataset}><td><strong>{receipt.dataset}</strong></td><td className="numeric">{Number(receipt.source_count || 0).toLocaleString()}</td><td>{receipt.latest_source_at ? date(receipt.latest_source_at) : "—"}</td></tr>)}</tbody>
            </table>
          </div>
          <p className="note">Counts are remote table rows, not deduplicated people. Source receipts identify the publisher edition; unresolved rows remain visible for identity review.</p>
        </>
      )}
    </section>
  );
}
