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
  rebounds: number | null;
  assists: number | null;
  fieldGoalPct: number | null;
  turnovers: number | null;
};

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
  const teamIdKey = teamIds.join(",");

  useEffect(() => {
    const controller = new AbortController();
    const stats = [
      { category: "offensive", stat: "avgPoints" },
      { category: "general", stat: "avgRebounds" },
      { category: "offensive", stat: "avgAssists" },
      { category: "offensive", stat: "fieldGoalPct" },
      { category: "offensive", stat: "avgTurnovers" },
    ] as const;
    const requests = stats.flatMap(({ category, stat }) => [0, 1, 2].map((page) => fetch(`/api/basketball/research/team-stats?season=2026&category=${category}&stat=${stat}&page=${page}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Live team production unavailable");
        return response.json() as Promise<TeamStatsResponse>;
      })
      .then((payload) => ({ stat, payload }))));
    Promise.all(requests).then((payloads) => {
        if (controller.signal.aborted) return;
        const divisionOneIds = new Set(teamIdKey.split(",").filter(Boolean));
        const grouped = new Map<string, TeamRow[]>();
        for (const { stat, payload } of payloads) {
          const rows = filterDivisionOneTeams(payload.rows || [], divisionOneIds);
          grouped.set(stat, [...(grouped.get(stat) || []), ...rows]);
        }
        const points = grouped.get("avgPoints") || [];
        const maps = new Map<string, ReadonlyMap<string, TeamRow>>();
        for (const { stat } of stats.slice(1)) maps.set(stat, new Map((grouped.get(stat) || []).map((row) => [String(row.id), row])));
        const rows = combineTeamProduction(points, maps);
        setData(rows);
        setStatus(rows.length ? "ready" : "unavailable");
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) setStatus("unavailable");
      });
    return () => controller.abort();
  }, [teamIdKey]);

  return (
    <section className="dashboard-subsection" aria-labelledby="live-team-production">
      <div className="dashboard-section-heading">
        <div><span className="eyebrow">LIVE RAW TEAM DATA</span><h3 id="live-team-production">D1 scoring leaders</h3></div>
        <Link href="/basketball/team-stats/?season=2026&category=offensive&stat=avgPoints">Full team stat browser →</Link>
      </div>
      <p className="dashboard-caption">Current Division I team-season box-score production from the live archive. These descriptive rates sit beside the adjusted ratings above.</p>
      {status === "checking" ? <p className="empty" role="status">Loading current team production…</p> : status === "unavailable" || !data ? <p className="empty" role="status">Live team production is temporarily unavailable. <Link href="/basketball/team-stats/">Open the team stat browser →</Link></p> : (
        <div className="dashboard-table-wrap">
          <table className="data-table dashboard-table">
            <thead><tr><th>PPG rank</th><th>Program</th><th>Abbr.</th><th className="numeric">PPG</th><th className="numeric">RPG</th><th className="numeric">APG</th><th className="numeric">FG%</th><th className="numeric">TO/G</th></tr></thead>
            <tbody>{data.slice(0, 8).map((row, index) => (
              <tr key={row.id}>
                <td className="rank-number">{index + 1}</td>
                <th scope="row"><Link href={`/basketball/programs/${encodeURIComponent(row.id)}/`}>{row.team}</Link></th>
                <td>{row.abbreviation || "—"}</td>
                <td className="numeric"><strong>{row.value == null ? "—" : fmt(row.value, 1)}</strong></td>
                <td className="numeric">{fmt(row.rebounds, 1)}</td>
                <td className="numeric">{fmt(row.assists, 1)}</td>
                <td className="numeric">{row.fieldGoalPct == null ? "—" : `${fmt(row.fieldGoalPct, 1)}%`}</td>
                <td className="numeric">{fmt(row.turnovers, 1)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
