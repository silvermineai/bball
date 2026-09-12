"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { date } from "../_lib/format";

type ProspectSnapshot = {
  season: number;
  total: number;
  captured_at: string | null;
};

export default function LiveBasketballProspectStatus() {
  const [snapshots, setSnapshots] = useState<ProspectSnapshot[]>([]);
  const [status, setStatus] = useState<"checking" | "live" | "fallback">("checking");

  useEffect(() => {
    const controller = new AbortController();
    Promise.allSettled([2026, 2027, 2028].map(async (season) => {
      const response = await fetch(
        `/api/basketball/research/recruiting-rankings?season=${season}&page=0&committed=all`,
        { signal: controller.signal },
      );
      if (!response.ok) throw new Error("prospect release unavailable");
      const payload = await response.json() as { total?: number; captured_at?: string | null };
      return {
        season,
        total: Number(payload.total || 0),
        captured_at: payload.captured_at || null,
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
  }, []);

  return (
    <p className="note" role="status">
      {status === "live"
        ? <>
            Live ESPN prospect board: {snapshots.map((snapshot) => `${snapshot.season} · ${snapshot.total.toLocaleString()}`).join("  /  ")} source-ranked prospects across the 2026–28 classes{snapshots[0]?.captured_at ? ` · latest capture ${date(snapshots.reduce((latest, snapshot) => snapshot.captured_at && snapshot.captured_at > latest ? snapshot.captured_at : latest, snapshots[0].captured_at))}` : ""}. Rank and commitment fields remain source evidence. <Link href="/basketball/recruiting/">Open the national recruiting board →</Link>
          </>
        : status === "fallback"
          ? <>The live ESPN prospect board is temporarily unavailable; the recruiting research file remains available. <Link href="/basketball/recruiting/">Open the recruiting board →</Link></>
          : "Checking the live ESPN prospect board…"}
    </p>
  );
}
