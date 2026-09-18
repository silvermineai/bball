"use client";

import { downloadCsv, toCsv, type CsvCell } from "../_lib/csv";

type Props = {
  kind: "teams" | "players" | "events";
  season: number;
  headers: string[];
  rows: CsvCell[][];
  sport?: "basketball" | "football";
};

/**
 * Small, deliberate export affordance for the landing board. The visible
 * tables stay compact, while the download preserves every published row and
 * field behind that table.
 */
export default function DashboardExportButton({ kind, season, headers, rows, sport = "basketball" }: Props) {
  const label = kind === "teams"
    ? "Download team CSV ↓"
    : kind === "events"
      ? "Download event CSV ↓"
      : "Download player CSV ↓";
  const filename = kind === "teams"
    ? `${sport}-team-ratings-${season}.csv`
    : kind === "events"
      ? `${sport}-event-leaders-${season}.csv`
      : `${sport}-player-stats-${season}.csv`;

  return (
    <button
      className="button secondary dashboard-export-button"
      type="button"
      onClick={() => downloadCsv(filename, toCsv(headers, rows))}
      disabled={!rows.length}
    >
      {label}
    </button>
  );
}
