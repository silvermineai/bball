"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { BBRosters } from "../_lib/basketball-types";
import { fetchJson } from "../_lib/fetch-json";
import { fmt } from "../_lib/format";
import { useBasketballRelease } from "./useBasketballRelease";

type MovementRow = {
  id: string;
  name: string;
  team: string;
  team_id: string;
  previous_teams: string[];
  previous_games: number | null;
  previous_minutes: number | null;
};

type MovementResponse = {
  players?: MovementRow[];
  players_available?: number;
  source?: { fetched_at?: string | null } | null;
};

const productionFor = (player: MovementRow, release: BBRosters | null) =>
  release?.players.find((candidate) => candidate.id === player.id && candidate.team_id === player.team_id)?.prior_production ?? null;

export default function LiveBasketballMovementLeaders() {
  const { data: release } = useBasketballRelease<BBRosters>("rosters-2026");
  const [data, setData] = useState<MovementResponse | null>(null);
  const [status, setStatus] = useState<"checking" | "ready" | "unavailable">("checking");

  useEffect(() => {
    const controller = new AbortController();
    setStatus("checking");
    fetchJson<MovementResponse>(
      "/api/basketball/research/rosters?season=2026&status=different_program&limit=40",
      { signal: controller.signal },
    )
      .then((payload) => {
        if (!controller.signal.aborted) {
          setData(payload);
          setStatus(payload.players?.length ? "ready" : "unavailable");
        }
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) setStatus("unavailable");
      });
    return () => controller.abort();
  }, []);

  const rows = useMemo(() => (data?.players ?? [])
    .map((player) => ({ player, production: productionFor(player, release) }))
    .filter((row) => row.player.previous_minutes != null)
    .sort((a, b) => (b.player.previous_minutes ?? -1) - (a.player.previous_minutes ?? -1))
    .slice(0, 8), [data, release]);

  return (
    <section className="dashboard-section" aria-labelledby="dashboard-movement">
      <div className="dashboard-section-heading">
        <div><span className="eyebrow">05 / MOVEMENT · 2025–26</span><h2 id="dashboard-movement">Prior production on the move</h2></div>
        <Link href="/basketball/recruiting/?view=observations&amp;rosterSeason=2026&amp;rosterStatus=different_program">Full movement lab →</Link>
      </div>
      <p className="dashboard-caption">The leading exact-ID program changes observed in the 2026 roster edition, with 2025–26 minutes and production kept beside the new listing. A roster observation is not a transaction or availability decision.</p>
      {status === "checking" ? <p className="empty" role="status">Loading roster movement…</p> : status === "unavailable" || !data ? <p className="empty" role="status">The live movement snapshot is temporarily unavailable. <Link href="/basketball/recruiting/">Open the recruiting board →</Link></p> : (
        <>
          <div className="dashboard-table-wrap">
            <table className="data-table dashboard-table">
              <thead><tr><th>Player</th><th>Listed program</th><th>Prior program</th><th className="numeric">MIN</th><th className="numeric">GP</th><th className="numeric">PPG</th><th className="numeric">APG</th><th className="numeric">TS%</th><th className="numeric">Box BPM</th></tr></thead>
              <tbody>{rows.map(({ player, production }) => (
                <tr key={`${player.id}-${player.team_id}`}>
                  <th scope="row"><Link href={`/basketball/player/?id=${encodeURIComponent(player.id)}&season=2025`}>{player.name}</Link></th>
                  <td><Link href={`/basketball/programs/${encodeURIComponent(player.team_id)}/`}>{player.team}</Link></td>
                  <td>{player.previous_teams.join(", ") || "Not recorded"}</td>
                  <td className="numeric">{player.previous_minutes?.toLocaleString() ?? "—"}</td>
                  <td className="numeric">{player.previous_games?.toLocaleString() ?? "—"}</td>
                  <td className="numeric"><strong>{fmt(production?.ppg)}</strong></td>
                  <td className="numeric">{fmt(production?.apg)}</td>
                  <td className="numeric">{production?.ts == null ? "—" : `${fmt(production.ts * 100)}%`}</td>
                  <td className="numeric">{fmt(production?.box_bpm)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <p className="dashboard-updated">{(data.players_available ?? rows.length).toLocaleString()} changed-program observations available · exact player IDs · prior season production</p>
        </>
      )}
    </section>
  );
}
