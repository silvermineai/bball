"use client";

import { useEffect, useState } from "react";
import { date, fmt } from "../../_lib/format";

type LiveRow = {
  model_id?: string;
  created_at?: string;
  prediction?: {
    home_margin?: number;
    home_win_probability?: number;
    total?: number;
  } | null;
};

type LiveResponse = { rows?: LiveRow[] };

export default function LiveBriefForecastStatus({
  gameId,
  staticEdition,
}: {
  gameId: string;
  staticEdition: string;
}) {
  const [row, setRow] = useState<LiveRow | null>(null);
  const [status, setStatus] = useState<"checking" | "live" | "unavailable">("checking");

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/basketball/research/forecasts?season=2027&gameId=${encodeURIComponent(gameId)}&model=latest&status=all&limit=1`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("live forecast unavailable");
        return response.json() as Promise<LiveResponse>;
      })
      .then((payload) => {
        if (!controller.signal.aborted) {
          setRow(payload.rows?.[0] || null);
          setStatus(payload.rows?.[0] ? "live" : "unavailable");
        }
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) setStatus("unavailable");
      });
    return () => controller.abort();
  }, [gameId]);

  const prediction = row?.prediction;
  return (
    <p className="note" role="status">
      {status === "live" && row
        ? <>Live D1 forecast check: {prediction?.home_margin == null ? "margin unavailable" : `home margin ${fmt(prediction.home_margin, 1)}`} · {prediction?.home_win_probability == null ? "win probability unavailable" : `${fmt(prediction.home_win_probability * 100, 1)}% home`} · {prediction?.total == null ? "total unavailable" : `total ${fmt(prediction.total, 1)}`} · model {row.model_id || "unlabeled"}{row.created_at ? ` · captured ${date(row.created_at)}` : ""}. The notebook above is the static edition from {date(staticEdition)}.</>
        : status === "unavailable"
          ? <>Live D1 forecast check unavailable; the brief remains available from its static edition ({date(staticEdition)}).</>
          : "Checking the latest registered D1 forecast for this game…"}
    </p>
  );
}
