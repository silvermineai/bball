"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { date } from "../_lib/format";
import { fetchJson } from "../_lib/fetch-json";

type ProspectSnapshot = {
  season: number;
  total: number;
  ranked: number;
  committed: number;
  graded: number;
  captured_at: string | null;
  rank_movement?: {
    moved_up: number;
    moved_down: number;
    new_to_release: number;
    unchanged: number;
    rank_unavailable: number;
  };
};

/** Keep the board summary honest when a release includes unranked rows. */
export function prospectCoverageSummary(snapshot: Pick<ProspectSnapshot, "season" | "total" | "ranked" | "committed">) {
  return `${snapshot.season} · ${snapshot.total.toLocaleString()} prospects (${snapshot.ranked.toLocaleString()} ranked · ${snapshot.committed.toLocaleString()} committed)`;
}

export default function LiveBasketballProspectStatus() {
  const requestedSeasons = [2025, 2026, 2027, 2028, 2029, 2030];
  const [snapshots, setSnapshots] = useState<ProspectSnapshot[]>([]);
  const [status, setStatus] = useState<"checking" | "live" | "fallback">("checking");
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setStatus("checking");
    Promise.allSettled(requestedSeasons.map(async (season) => {
      const payload = await fetchJson<{ total?: number; captured_at?: string | null; cohort?: { ranked?: number; committed?: number; graded?: number }; rank_movement?: ProspectSnapshot["rank_movement"] }>(
        `/api/basketball/research/recruiting-rankings?season=${season}&page=0&committed=all`,
        { signal: controller.signal },
      );
      return {
        season,
        total: Number(payload.total || 0),
        ranked: Number(payload.cohort?.ranked || 0),
        committed: Number(payload.cohort?.committed || 0),
        graded: Number(payload.cohort?.graded || 0),
        captured_at: payload.captured_at || null,
        rank_movement: payload.rank_movement,
      } satisfies ProspectSnapshot;
    })).then((results) => {
      if (controller.signal.aborted) return;
      const available = results
        .flatMap((result) => result.status === "fulfilled" ? [result.value] : [])
        .filter((snapshot) => snapshot.total > 0)
        .sort((a, b) => a.season - b.season);
      setSnapshots(available);
      setStatus(available.length ? "live" : "fallback");
    });
    return () => controller.abort();
  }, [retryNonce]);

  return (
    <p className="note" role="status">
      {status === "live"
        ? <>
            Live prospect board: {snapshots.map(prospectCoverageSummary).join("  /  ")} across {snapshots.length} of {requestedSeasons.length} tracked classes{snapshots[0]?.captured_at ? ` · latest capture ${date(snapshots.reduce((latest, snapshot) => snapshot.captured_at && snapshot.captured_at > latest ? snapshot.captured_at : latest, snapshots[0].captured_at))}` : ""}. {snapshots.some((snapshot) => snapshot.rank_movement) && <>{snapshots.map((snapshot) => snapshot.rank_movement ? `${snapshot.season}: ${snapshot.rank_movement.moved_up} up · ${snapshot.rank_movement.moved_down} down · ${snapshot.rank_movement.new_to_release} new` : null).filter(Boolean).join("  /  ")}. </>}Rank and commitment fields remain recorded board evidence. <Link href="/basketball/recruiting/">Open the national recruiting board →</Link>
          </>
        : status === "fallback"
          ? <>The live prospect board is temporarily unavailable; the recruiting research file remains available. <Link href="/basketball/recruiting/">Open the recruiting board →</Link> <button className="text-link" type="button" onClick={() => setRetryNonce((value) => value + 1)}>Retry live check</button></>
          : "Checking the live prospect board…"}
    </p>
  );
}
