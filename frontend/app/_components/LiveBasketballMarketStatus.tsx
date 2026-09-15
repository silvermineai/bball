"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { date } from "../_lib/format";
import { fetchJson } from "../_lib/fetch-json";

type ScorecardResponse = {
  generated_at?: string;
  total?: number;
  market_observations?: number;
};

type MarketMetadata = {
  sport?: string;
  total?: number;
  pregame?: number;
  research_receipts?: number;
  research_latest_capture_at?: string | null;
  research_capture?: {
    provider?: string;
    captured_at?: string;
    season?: number;
    summary_count?: number;
    summary_with_pickcenter?: number;
  };
  provider_capabilities?: Array<{ provider?: string }>;
  source?: "partial" | "unavailable";
  unavailable_reason?: string;
  unavailable_sources?: string[];
};

export default function LiveBasketballMarketStatus() {
  const [scorecard, setScorecard] = useState<ScorecardResponse | null>(null);
  const [archive, setArchive] = useState<MarketMetadata | null>(null);
  const [status, setStatus] = useState<"checking" | "live" | "fallback">("checking");
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setStatus("checking");
    Promise.all([
      fetchJson<ScorecardResponse>("/api/research/scorecard?sport=basketball&limit=1", { signal: controller.signal }),
      fetchJson<MarketMetadata>("/api/research/markets?meta=1&sport=basketball", { signal: controller.signal }),
    ])
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
  }, [retryNonce]);

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
  const captureNote = archive?.research_receipts
    ? archive.research_latest_capture_at
      ? ` The latest connector capture ran ${date(archive.research_latest_capture_at)}.`
      : " A connector capture has run."
    : " No connector capture receipt is recorded yet.";
  const captureDiagnostic = archive?.research_capture?.summary_count != null
    ? ` The latest ESPN capture checked ${archive.research_capture.summary_count.toLocaleString()} future summaries; ${(
        archive.research_capture.summary_with_pickcenter || 0
      ).toLocaleString()} included pickcenter markets.`
    : "";

  return (
    <p className="note" role="status">
      {status === "live" && scorecard
        ? <>
            Live market bridge: {(scorecard.market_observations || 0).toLocaleString()} qualifying quote observations across {(scorecard.total || 0).toLocaleString()} basketball forecasts. The archive holds {(archive?.total || 0).toLocaleString()} retained rows, including {(archive?.pregame || 0).toLocaleString()} marked pregame, with {(archive?.provider_capabilities?.length || 0).toLocaleString()} applicable connector{archive?.provider_capabilities?.length === 1 ? "" : "s"}{providerLabel}{scorecard.generated_at ? ` · checked ${date(scorecard.generated_at)}` : ""}. {archiveNote ? `${archiveNote} ` : ""}{captureNote}{captureDiagnostic} Quotes require an authorized provider clock, exact participants and a pre-tip capture. <Link href="/research/markets/?sport=basketball">Open the market archive →</Link>
          </>
        : status === "fallback"
          ? <>Live market scorecard unavailable; the retained market archive remains available. <Link href="/research/markets/?sport=basketball">Open the market archive →</Link> <button className="text-link" type="button" onClick={() => setRetryNonce((value) => value + 1)}>Retry live check</button></>
          : "Checking the live market bridge…"}
    </p>
  );
}
