"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { date } from "../_lib/format";
import { fetchJson } from "../_lib/fetch-json";
import { marketCaptureStatusDetail, marketCaptureStatusLabel, type MarketCaptureStatus } from "../_lib/market-availability";

type ScorecardResponse = {
  generated_at?: string;
  total?: number;
  market_observations?: number;
  qualifying_market_observations?: number;
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
    summary_with_odds?: number;
    accepted_markets?: number;
    rejected_records?: number;
    market_status?: MarketCaptureStatus;
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

  const archiveNote = archive?.source === "partial"
      ? "One market archive is busy; the counts below are partial."
    : archive?.source === "unavailable"
      ? archive.unavailable_reason || "The market archive warehouse is temporarily unavailable."
      : "";
  const captureNote = archive?.research_receipts
    ? archive.research_latest_capture_at
      ? ` The latest connector capture ran ${date(archive.research_latest_capture_at)}.`
      : " A connector capture has run."
      : " No line capture is recorded yet.";
  const captureDiagnostic = archive?.research_capture?.summary_count != null
    ? ` The latest public capture checked ${archive.research_capture.summary_count.toLocaleString()} future summaries; ${(archive.research_capture.summary_with_pickcenter || 0).toLocaleString()} included complete market quotes${archive.research_capture.summary_with_odds != null ? `, and ${archive.research_capture.summary_with_odds.toLocaleString()} had a non-empty odds payload` : ""}${archive.research_capture.accepted_markets != null ? `; ${archive.research_capture.accepted_markets.toLocaleString()} markets passed validation` : ""}${archive.research_capture.rejected_records != null ? `; ${archive.research_capture.rejected_records.toLocaleString()} summaries were rejected` : ""}.`
    : "";
  const captureStatus = archive?.research_capture?.market_status;
  const captureStatusNote = captureStatus
    ? ` Capture status: ${marketCaptureStatusLabel(captureStatus)}. ${marketCaptureStatusDetail(captureStatus)}`
    : "";
  const marketCount = scorecard?.market_observations || 0;
  const qualifyingCount = scorecard?.qualifying_market_observations || 0;
  const marketAction = qualifyingCount
    ? <Link href="/research/scorecard/?sport=basketball">Open model scorecard →</Link>
    : <><span>{captureStatus === "no_quotes_published" ? "No published basketball quote is stored yet." : "No qualifying basketball quote is stored yet."}</span> <Link href="/research/markets/#csv-import">Open authorized line preflight →</Link></>;

  return (
    <p className="note" role="status">
      {status === "live" && scorecard
        ? <>
            Model-versus-line tracking: {qualifyingCount.toLocaleString()} qualifying quote observations across {(scorecard.total || 0).toLocaleString()} basketball forecasts. The scorecard retains {marketCount.toLocaleString()} accepted quote rows before its forecast-registration and freshness checks. The archive holds {(archive?.total || 0).toLocaleString()} retained rows, including {(archive?.pregame || 0).toLocaleString()} marked pregame, with {(archive?.provider_capabilities?.length || 0).toLocaleString()} applicable line feed{archive?.provider_capabilities?.length === 1 ? "" : "s"}{scorecard.generated_at ? ` · checked ${date(scorecard.generated_at)}` : ""}. {archiveNote ? `${archiveNote} ` : ""}{captureNote}{captureDiagnostic}{captureStatusNote} Quotes require an authorized clock, exact participants and a pre-tip capture. {marketAction}
          </>
        : status === "fallback"
          ? <>Live model scorecard unavailable; the retained market archive remains available. <Link href="/research/scorecard/?sport=basketball">Open model scorecard →</Link> <button className="text-link" type="button" onClick={() => setRetryNonce((value) => value + 1)}>Retry live check</button></>
          : "Checking the live market bridge…"}
    </p>
  );
}
