"use client";

import { useEffect, useState } from "react";
import { date, fmt, signed } from "../../_lib/format";
import { comparisonTimingLabel } from "../../_lib/market-display";
import {
  loadLiveBasketballGameMarketComparison,
  type LiveGameMarketComparison,
} from "../../_lib/live-basketball-forecasts";

type Status = "checking" | "ready" | "unavailable";

function clock(value: string) {
  return date(value);
}

/** Refresh one brief's market evidence while preserving the exact model gate. */
export default function LiveBriefMarketTrail({ gameId }: { gameId: string }) {
  const [status, setStatus] = useState<Status>("checking");
  const [result, setResult] = useState<LiveGameMarketComparison | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setStatus("checking");
    setResult(null);
    loadLiveBasketballGameMarketComparison(controller.signal, gameId)
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
      <div className="eyebrow">LIVE MARKET CHECK / EXACT GAME</div>
      {status === "checking" ? <p className="note">Checking the current forecast edition and its qualifying market observations…</p> : null}
      {status === "unavailable" ? <p className="note">No live market comparison is available for this exact game and current forecast edition. No line or edge is inferred.</p> : null}
      {status === "ready" && result ? (
        result.comparisons.length ? (
          <>
            <p className="note">Current model edition <code>{result.modelId}</code>{result.forecastCreatedAt ? ` · forecast captured ${clock(result.forecastCreatedAt)}` : ""}{result.forecastStartsAt ? ` · scheduled ${clock(result.forecastStartsAt)}` : ""}. Only quotes matched to this game, model edition, participants and pre-tip clocks are shown.</p>
            <div className="table-scroll">
              <table className="data-table" aria-label="Live market comparisons">
                <thead><tr><th>Market</th><th>Observed value</th><th>Model difference</th><th>Captured / updated</th></tr></thead>
                <tbody>{result.comparisons.map((quote) => (
                  <tr key={`${quote.market}-${quote.provider}-${quote.bookmaker}`}>
                    <th scope="row">{quote.market}</th>
                    <td>{quote.market === "h2h" ? quote.market_home_probability == null ? "—" : `${fmt(quote.market_home_probability * 100)}% home` : quote.line == null ? "—" : quote.market === "totals" ? `O/U ${fmt(quote.line)}` : `Home ${signed(quote.line)}`}</td>
                    <td>{quote.market === "h2h" ? `${signed(quote.model_difference * 100)} pp` : `${signed(quote.model_difference)} pts`}</td>
                    <td>{clock(quote.captured_at)}<small>Updated {clock(quote.updated_at)}</small><small>{result.forecastStartsAt ? comparisonTimingLabel(quote, result.forecastStartsAt) : "Tip clock unavailable"}</small></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </>
        ) : <p className="note">The current forecast edition is verified for this game, but no qualifying market quote is attached. No line or edge is inferred.</p>
      ) : null}
    </div>
  );
}
