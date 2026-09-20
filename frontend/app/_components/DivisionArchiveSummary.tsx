"use client";

import { useEffect, useState } from "react";
import {
  divisionSummaryMetrics,
  summarizeDivisionArchive,
  type DivisionArchiveSummary as Summary,
  type LowerBasketballDivision,
} from "../_lib/division-archive-summary";
import DivisionCoverageMatrix from "./DivisionCoverageMatrix";

const date = (value: string | null) => {
  if (!value) return "capture date unavailable";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "capture date unavailable" : parsed.toLocaleDateString("en-US", { timeZone: "UTC" });
};

export default function DivisionArchiveSummary({ division }: { division: LowerBasketballDivision }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/basketball/ncaa-individual.json", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Division archive unavailable.")))
      .then((value: unknown) => {
        if (!controller.signal.aborted) setSummary(summarizeDivisionArchive(value, division));
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "Division archive unavailable.");
        }
      });
    return () => controller.abort();
  }, [division]);

  return <section className="paper-panel division-archive-summary" aria-labelledby="division-archive-summary-title">
    <div className="eyebrow">MEN&apos;S BASKETBALL · D{division} ARCHIVE</div>
    <h2 id="division-archive-summary-title">Published rows for Division {division}</h2>
    <p className="note">This scope has a retained final-season player and team directory. Counts below come from the checked-in release; missing source fields remain unavailable.</p>
    {error ? <p className="status-error" role="alert">{error}</p> : !summary ? <p className="muted" role="status">Loading division archive summary…</p> : <>
      <DivisionCoverageMatrix sport="basketball" gender="men" division={division} />
      <div className="scope-snapshot-counts" aria-label={`Division ${division} archive counts`}>
        <strong>{summary.players.toLocaleString()}</strong><span>player rows</span>
        <strong>{summary.teams.toLocaleString()}</strong><span>team rows</span>
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead><tr><th>Recorded field</th><th className="numeric">Rows with value</th></tr></thead>
          <tbody>{divisionSummaryMetrics.map(([key, label]) => <tr key={key}><th scope="row">{label}</th><td className="numeric">{summary.metrics[key].toLocaleString()}</td></tr>)}</tbody>
        </table>
      </div>
      <p className="note">Season {summary.season == null ? "unavailable" : `${summary.season - 1}–${String(summary.season).slice(-2)}`} · captured {date(summary.generated_at)}. The archive supports descriptive lookup and within-division sorting; Silvermine D1 ratings and forecasts are not substituted.</p>
    </>}
  </section>;
}
