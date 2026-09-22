"use client";

import { useEffect, useState } from "react";
import { date, fmt, signed } from "../../_lib/format";
import { comparisonTimingLabel } from "../../_lib/market-display";
import { gameMarketReadinessLabel } from "../../_lib/game-market-readiness";
import {
  loadLiveFootballGameMarketComparison,
  type LiveFootballGameMarketComparison,
} from "../../_lib/live-football-forecasts";

type Status = "checking" | "ready" | "unavailable";

function clock(value: string) {
  return date(value);
}

/**
 * Refresh one football notebook's market evidence without carrying the
 * bundled archive's unverified line into the active forecast edition.
 */
export default function LiveFootballBriefMarketTrail({ gameId }: { gameId: string }) {
  const [status, setStatus] = useState<Status>("checking");
  const [result, setResult] = useState<LiveFootballGameMarketComparison | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setStatus("checking");
    setResult(null);
    loadLiveFootballGameMarketComparison(controller.signal, gameId)
      .then((value) => {
        if (!controller.signal.aborted) {
          setResult(value);
          setStatus(value ? "ready" : "unavailable");
        }
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) {
          setStatus("unavailable");
        }
      });
    return () => controller.abort();
  }, [gameId]);

  return (
    <div className="paper-panel" aria-live="polite" style={{ marginTop: 18 }}>
      <div className="eyebrow">LIVE MARKET CHECK / EXACT FOOTBALL GAME</div>
      {status === "checking" ? <p className="note">Checking the current football forecast edition and its qualifying market observations…</p> : null}
      {status === "unavailable" ? <p className="note">No live market comparison is available for this exact game and current football forecast edition. No line or edge is inferred.</p> : null}
      {status === "ready" && result ? (
        result.comparisons.length ? (
          <>
            <p className="note">Current model edition <code>{result.modelId}</code>{result.forecastCreatedAt ? ` · forecast captured ${clock(result.forecastCreatedAt)}` : ""}{result.forecastStartsAt ? ` · scheduled ${clock(result.forecastStartsAt)}` : ""}. Only quotes matched to this game, model edition, participants and pre-kickoff clocks are shown.</p>
            <div className="table-scroll">
              <table className="data-table" aria-label="Live football market comparisons">
                <thead><tr><th>Market</th><th>Observed value</th><th>Model difference</th><th>Captured / updated</th></tr></thead>
                <tbody>{result.comparisons.map((quote) => (
                  <tr key={`${quote.market}-${quote.provider}-${quote.bookmaker}`}>
                    <th scope="row">{quote.market}</th>
                    <td>{quote.market === "h2h" ? quote.market_home_probability == null ? "—" : `${fmt(quote.market_home_probability * 100)}% home` : quote.line == null ? "—" : quote.market === "totals" ? `O/U ${fmt(quote.line)}` : `Home ${signed(quote.line)}`}</td>
                    <td>{quote.market === "h2h" ? `${signed(quote.model_difference * 100)} pp` : `${signed(quote.model_difference)} pts`}</td>
                    <td>{clock(quote.captured_at)}<small>Updated {clock(quote.updated_at)}</small><small>{result.forecastStartsAt ? comparisonTimingLabel(quote, result.forecastStartsAt) : "Kickoff clock unavailable"}</small></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </>
      ) : <p className="note"><strong>{gameMarketReadinessLabel(result.marketReadiness)}</strong>. {result.marketReadiness?.message || "The current football forecast edition is verified for this game, but no qualifying market quote is attached."} No line or edge is inferred.</p>
      ) : null}
    </div>
  );
}
