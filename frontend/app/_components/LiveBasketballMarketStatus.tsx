"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { date } from "../_lib/format";

type ScorecardResponse = {
  generated_at?: string;
  total?: number;
  market_observations?: number;
};

export default function LiveBasketballMarketStatus() {
  const [scorecard, setScorecard] = useState<ScorecardResponse | null>(null);
  const [status, setStatus] = useState<"checking" | "live" | "fallback">("checking");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/research/scorecard?sport=basketball&limit=1", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("live market scorecard unavailable");
        return response.json() as Promise<ScorecardResponse>;
      })
      .then((payload) => {
        if (!controller.signal.aborted) {
          setScorecard(payload);
          setStatus("live");
        }
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) {
          setStatus("fallback");
        }
      });
    return () => controller.abort();
  }, []);

  return (
    <p className="note" role="status">
      {status === "live" && scorecard
        ? <>
            Live market bridge: {(scorecard.market_observations || 0).toLocaleString()} qualifying quote observations across {(scorecard.total || 0).toLocaleString()} basketball forecasts{scorecard.generated_at ? ` · checked ${date(scorecard.generated_at)}` : ""}. Quotes require an authorized provider clock, exact participants and a pre-tip capture. <Link href="/research/markets/?sport=basketball">Open the market archive →</Link>
          </>
        : status === "fallback"
          ? <>Live market scorecard unavailable; the retained market archive remains available. <Link href="/research/markets/?sport=basketball">Open the market archive →</Link></>
          : "Checking the live market bridge…"}
    </p>
  );
}
