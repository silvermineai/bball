"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { date } from "../_lib/format";

type ScorecardResponse = {
  generated_at?: string;
  total?: number;
  market_observations?: number;
};

type MarketMetadata = {
  sport?: string;
  total?: number;
  pregame?: number;
  provider_capabilities?: Array<{ provider?: string }>;
  source?: "partial" | "unavailable";
  unavailable_reason?: string;
  unavailable_sources?: string[];
};

export default function LiveBasketballMarketStatus() {
  const [scorecard, setScorecard] = useState<ScorecardResponse | null>(null);
  const [archive, setArchive] = useState<MarketMetadata | null>(null);
  const [status, setStatus] = useState<"checking" | "live" | "fallback">("checking");

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch("/api/research/scorecard?sport=basketball&limit=1", { signal: controller.signal }),
      fetch("/api/research/markets?meta=1&sport=basketball", { signal: controller.signal }),
    ])
      .then(async ([scorecardResponse, archiveResponse]) => {
        if (!scorecardResponse.ok || !archiveResponse.ok) throw new Error("live market data unavailable");
        return Promise.all([
          scorecardResponse.json() as Promise<ScorecardResponse>,
          archiveResponse.json() as Promise<MarketMetadata>,
        ]);
      })
      .then(([scorecardPayload, archivePayload]) => {
        if (!controller.signal.aborted) {
          setScorecard(scorecardPayload);
          setArchive(archivePayload);
          setStatus(archivePayload.source === "unavailable" ? "fallback" : "live");
        }
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) {
          setStatus("fallback");
        }
      });
    return () => controller.abort();
  }, []);

  const providerNames = (archive?.provider_capabilities || [])
    .map((provider) => provider.provider)
    .filter((provider): provider is string => !!provider);
  const providerLabel = providerNames.length
    ? ` (${providerNames.join(", ")})`
    : "";

  const archiveNote = archive?.source === "partial"
    ? `One archive binding is busy (${(archive.unavailable_sources || []).join(", ") || "unknown source"}); the counts below are partial.`
    : archive?.source === "unavailable"
      ? archive.unavailable_reason || "The market archive warehouse is temporarily unavailable."
      : "";

  return (
    <p className="note" role="status">
      {status === "live" && scorecard
        ? <>
            Live market bridge: {(scorecard.market_observations || 0).toLocaleString()} qualifying quote observations across {(scorecard.total || 0).toLocaleString()} basketball forecasts. The archive holds {(archive?.total || 0).toLocaleString()} retained rows, including {(archive?.pregame || 0).toLocaleString()} marked pregame, with {(archive?.provider_capabilities?.length || 0).toLocaleString()} applicable connector{archive?.provider_capabilities?.length === 1 ? "" : "s"}{providerLabel}{scorecard.generated_at ? ` · checked ${date(scorecard.generated_at)}` : ""}. {archiveNote ? `${archiveNote} ` : ""}Quotes require an authorized provider clock, exact participants and a pre-tip capture. <Link href="/research/markets/?sport=basketball">Open the market archive →</Link>
          </>
        : status === "fallback"
          ? <>Live market scorecard unavailable; the retained market archive remains available. <Link href="/research/markets/?sport=basketball">Open the market archive →</Link></>
          : "Checking the live market bridge…"}
    </p>
  );
}
