"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fmt } from "../_lib/format";

type TeamRow = {
  id: string;
  team: string;
  abbreviation?: string | null;
  value: number | null;
};

type TeamStatsResponse = {
  season: number;
  total: number;
  field?: { label?: string; unit?: string };
  rows?: TeamRow[];
};

type TeamProductionRow = TeamRow & {
  points?: number | null;
  rebounds: number | null;
  assists: number | null;
  steals?: number | null;
  blocks?: number | null;
  fieldGoalPct: number | null;
  threePointFieldGoalPct?: number | null;
  freeThrowPct?: number | null;
  turnovers: number | null;
};

type TeamStatKey = "avgPoints" | "avgRebounds" | "avgAssists" | "avgSteals" | "avgBlocks" | "fieldGoalPct" | "threePointFieldGoalPct" | "freeThrowPct" | "avgTurnovers";

const teamStatOptions: Array<{ key: TeamStatKey; category: "general" | "offensive" | "defensive"; label: string; description: string; unit: "per game" | "percent" }> = [
  { key: "avgPoints", category: "offensive", label: "Points per game", description: "scoring volume", unit: "per game" },
  { key: "avgRebounds", category: "general", label: "Rebounds per game", description: "total rebounding", unit: "per game" },
  { key: "avgAssists", category: "offensive", label: "Assists per game", description: "passing production", unit: "per game" },
  { key: "avgSteals", category: "defensive", label: "Steals per game", description: "defensive events", unit: "per game" },
  { key: "avgBlocks", category: "defensive", label: "Blocks per game", description: "rim protection events", unit: "per game" },
  { key: "fieldGoalPct", category: "offensive", label: "Field-goal percentage", description: "overall shooting", unit: "percent" },
  { key: "threePointFieldGoalPct", category: "offensive", label: "3-point percentage", description: "long-range shooting", unit: "percent" },
  { key: "freeThrowPct", category: "offensive", label: "Free-throw percentage", description: "free-throw shooting", unit: "percent" },
  { key: "avgTurnovers", category: "offensive", label: "Turnovers per game", description: "ball security", unit: "per game" },
];
const contextStatKeys: TeamStatKey[] = ["avgPoints", "avgRebounds", "avgAssists", "fieldGoalPct", "avgTurnovers"];

const shortTeamStatLabel = (option: (typeof teamStatOptions)[number]) => option.unit === "percent"
  ? option.key === "threePointFieldGoalPct" ? "3P%" : option.key === "freeThrowPct" ? "FT%" : "FG%"
  : option.key === "avgPoints" ? "PPG" : option.key === "avgRebounds" ? "RPG" : option.key === "avgAssists" ? "APG" : option.key === "avgSteals" ? "SPG" : option.key === "avgBlocks" ? "BPG" : "TO/G";

export function filterDivisionOneTeams(rows: TeamRow[], teamIds: ReadonlySet<string>) {
  return rows.filter((row) => teamIds.has(String(row.id)));
}

export function combineTeamProduction(
  points: TeamRow[],
  stats: ReadonlyMap<string, ReadonlyMap<string, TeamRow>>,
): TeamProductionRow[] {
  return points.map((row) => ({
    ...row,
    rebounds: stats.get("avgRebounds")?.get(String(row.id))?.value ?? null,
    assists: stats.get("avgAssists")?.get(String(row.id))?.value ?? null,
    fieldGoalPct: stats.get("fieldGoalPct")?.get(String(row.id))?.value ?? null,
    turnovers: stats.get("avgTurnovers")?.get(String(row.id))?.value ?? null,
  }));
}

export default function LiveTeamProductionTable({ teamIds }: { teamIds: string[] }) {
  const [data, setData] = useState<TeamProductionRow[] | null>(null);
  const [status, setStatus] = useState<"checking" | "ready" | "unavailable">("checking");
  const [stat, setStat] = useState<TeamStatKey>("avgPoints");
  const teamIdKey = teamIds.join(",");
  const activeStat = teamStatOptions.find((option) => option.key === stat) || teamStatOptions[0];

  useEffect(() => {
    const controller = new AbortController();
    setStatus("checking");
    const stats = teamStatOptions.filter((option) => contextStatKeys.includes(option.key) || option.key === stat);
    const requests = stats.map(({ category, key }) => fetch(`/api/basketball/research/team-stats?season=2026&category=${category}&stat=${key}&ids=${encodeURIComponent(teamIdKey)}&limit=500&page=0`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Live team production unavailable");
        return response.json() as Promise<TeamStatsResponse>;
      })
      .then((payload) => ({ stat: key, payload })));
    Promise.all(requests).then((payloads) => {
        if (controller.signal.aborted) return;
        const divisionOneIds = new Set(teamIdKey.split(",").filter(Boolean));
        const grouped = new Map<string, TeamRow[]>();
        for (const { stat, payload } of payloads) {
          const rows = filterDivisionOneTeams(payload.rows || [], divisionOneIds);
          grouped.set(stat, [...(grouped.get(stat) || []), ...rows]);
        }
        const points = grouped.get(stat) || [];
        const maps = new Map<string, ReadonlyMap<string, TeamRow>>();
        for (const { key } of stats) maps.set(key, new Map((grouped.get(key) || []).map((row) => [String(row.id), row])));
        const rows = combineTeamProduction(points, maps);
        const withContext = rows.map((row) => ({
          ...row,
          points: maps.get("avgPoints")?.get(String(row.id))?.value ?? (stat === "avgPoints" ? row.value : null),
          steals: maps.get("avgSteals")?.get(String(row.id))?.value ?? null,
          blocks: maps.get("avgBlocks")?.get(String(row.id))?.value ?? null,
          threePointFieldGoalPct: maps.get("threePointFieldGoalPct")?.get(String(row.id))?.value ?? null,
          freeThrowPct: maps.get("freeThrowPct")?.get(String(row.id))?.value ?? null,
        }));
        setData(withContext);
        setStatus(withContext.length ? "ready" : "unavailable");
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) setStatus("unavailable");
      });
    return () => controller.abort();
  }, [stat, teamIdKey]);

  const contextColumns = [
    { key: "avgPoints" as const, label: "PPG", value: (row: TeamProductionRow) => row.points, unit: "per game" as const },
    { key: "avgRebounds" as const, label: "RPG", value: (row: TeamProductionRow) => row.rebounds, unit: "per game" as const },
    { key: "avgAssists" as const, label: "APG", value: (row: TeamProductionRow) => row.assists, unit: "per game" as const },
    { key: "fieldGoalPct" as const, label: "FG%", value: (row: TeamProductionRow) => row.fieldGoalPct, unit: "percent" as const },
    { key: "avgTurnovers" as const, label: "TO/G", value: (row: TeamProductionRow) => row.turnovers, unit: "per game" as const },
  ].filter((column) => column.key !== stat);

  return (
    <section className="dashboard-subsection" aria-labelledby="live-team-production">
      <div className="dashboard-section-heading">
        <div><span className="eyebrow">LIVE RAW TEAM DATA</span><h3 id="live-team-production">D1 team production</h3></div>
        <Link href={`/basketball/team-stats/?season=2026&category=${activeStat.category}&stat=${activeStat.key}`}>Full team stat browser →</Link>
      </div>
      <p className="dashboard-caption">Current Division I team-season box-score production from the live archive. Choose the field to reorder the table; the surrounding columns remain attached for context.</p>
      <div className="toolbar" style={{ marginBottom: 16 }}>
        <label className="control"><span>RANK BY</span><select value={stat} onChange={(event) => setStat(event.target.value as TeamStatKey)}>{teamStatOptions.map((option) => <option key={option.key} value={option.key}>{option.label} · {option.description}</option>)}</select></label>
        <p className="note" role="status">{status === "checking" ? "Loading live team rows…" : status === "ready" && data ? `Showing the top ${Math.min(8, data.length)} Division I teams by ${activeStat.label.toLowerCase()}.` : "Live team rows are temporarily unavailable."}</p>
      </div>
      {status === "checking" ? <p className="empty" role="status">Loading current team production…</p> : status === "unavailable" || !data ? <p className="empty" role="status">Live team production is temporarily unavailable. <Link href="/basketball/team-stats/">Open the team stat browser →</Link></p> : (
        <div className="dashboard-table-wrap">
          <table className="data-table dashboard-table">
            <thead><tr><th>{activeStat.label} rank</th><th>Program</th><th>Abbr.</th><th className="numeric">{shortTeamStatLabel(activeStat)}</th>{contextColumns.map((column) => <th className="numeric" key={column.key}>{column.label}</th>)}</tr></thead>
            <tbody>{data.slice(0, 8).map((row, index) => (
              <tr key={row.id}>
                <td className="rank-number">{index + 1}</td>
                <th scope="row"><Link href={`/basketball/programs/${encodeURIComponent(row.id)}/`}>{row.team}</Link></th>
                <td>{row.abbreviation || "—"}</td>
                <td className="numeric"><strong>{row.value == null ? "—" : `${fmt(row.value, 1)}${activeStat.unit === "percent" ? "%" : ""}`}</strong></td>
                {contextColumns.map((column) => {
                  const value = column.value(row);
                  return <td className="numeric" key={column.key}>{value == null ? "—" : `${fmt(value, 1)}${column.unit === "percent" ? "%" : ""}`}</td>;
                })}
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
