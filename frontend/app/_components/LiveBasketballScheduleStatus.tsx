"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type ScheduleClock = {
  season?: number;
  total?: number;
  confirmed?: number;
  provider?: string;
  latest_observed_at?: string | null;
};

export default function LiveBasketballScheduleStatus() {
  const [payload, setPayload] = useState<ScheduleClock | null>(null);
  const [status, setStatus] = useState<"checking" | "live" | "fallback">("checking");
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setStatus("checking");
    fetch("/api/basketball/research/schedule-times?season=2027&meta=1", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("schedule clock unavailable");
        return response.json() as Promise<ScheduleClock>;
      })
      .then((value) => {
        if (!controller.signal.aborted) {
          setPayload(value);
          setStatus("live");
        }
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) setStatus("fallback");
      });
    return () => controller.abort();
  }, [retryNonce]);

  return (
    <p className="note" role="status">
      {status === "live" && payload
        ? <>ESPN schedule-clock check: {(payload.confirmed || 0).toLocaleString()} of {(payload.total || 0).toLocaleString()} observed games have a source-confirmed start{payload.latest_observed_at ? ` · last checked ${new Date(payload.latest_observed_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" })} UTC` : ""}. Date-only and conflicting observations stay labeled TBD; this evidence never rewrites the forecast schedule. <Link href="/basketball/forecast-lab/">Open the forecast lab →</Link></>
        : status === "fallback"
          ? <>Live schedule-clock evidence unavailable; the published game slate remains available. <Link href="/basketball/games/">Open the game slate →</Link> <button className="text-link" type="button" onClick={() => setRetryNonce((value) => value + 1)}>Retry live check</button></>
          : "Checking ESPN schedule-clock evidence…"}
    </p>
  );
}
