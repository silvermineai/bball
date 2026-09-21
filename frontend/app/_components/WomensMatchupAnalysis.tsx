import {
  buildUpcomingGameAnalysis,
  type UpcomingGameAnalysis,
} from "../_lib/upcoming-game-analysis";
import type { WomensMatchupRow } from "../_lib/womens-matchups";

const title = (value: string) => value.charAt(0).toUpperCase() + value.slice(1).replaceAll("-", " ");
const percent = (value: number | null) => value == null ? "—" : `${(value * 100).toFixed(1)}%`;
const points = (value: number | null) => value == null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;

function readoutLabel(readout: UpcomingGameAnalysis) {
  if (readout.state === "unavailable") return "Forecast unavailable";
  if (readout.lean === "toss-up") return "Toss-up";
  return `${title(readout.lean)} ${readout.confidence}`;
}

export default function WomensMatchupAnalysis({
  row,
  modelId,
}: {
  row: WomensMatchupRow;
  modelId?: string | null;
}) {
  const readout = buildUpcomingGameAnalysis({
    gameId: row.game_id,
    homeId: row.home_id,
    awayId: row.away_id,
    modelId,
    prediction: row.prediction ? {
      homeWinProbability: row.prediction.home_win_probability,
      margin: row.prediction.predicted_margin,
      scoreHome: row.prediction.predicted_home_score,
      scoreAway: row.prediction.predicted_away_score,
      marginLow: row.prediction.margin_low,
      marginHigh: row.prediction.margin_high,
      estimateType: row.prediction.estimate_type,
    } : null,
    schedule: { date: row.date, venue: row.schedule?.venue },
    // The women’s edition exposes aggregate market coverage, not a verified
    // quote join for this exact row. Keep the row-level state unavailable.
    marketQuoteCount: null,
  });
  return (
    <div className="analysis-readiness womens-matchup-analysis" aria-label="Upcoming game analysis readout">
      <div className="analysis-readiness-heading">
        <strong>{readoutLabel(readout)}</strong>
        <span>{readout.state}</span>
      </div>
      <div className="analysis-badges">
        <span className={`analysis-badge ${readout.estimate === "primary" ? "is-ready" : ""}`}>{title(readout.estimate)} estimate</span>
        <span className="analysis-badge">Home win {percent(readout.homeWinProbability)}</span>
        <span className="analysis-badge">Margin {points(readout.margin)}</span>
        <span className="analysis-badge">Range {readout.rangeWidth == null ? "unavailable" : `${readout.rangeWidth.toFixed(1)} pts`}</span>
      </div>
      <dl className="womens-matchup-analysis-grid">
        <div><dt>Projected score</dt><dd>{readout.scoreAway == null || readout.scoreHome == null ? "—" : `${readout.scoreAway.toFixed(1)}–${readout.scoreHome.toFixed(1)}`}</dd></div>
        <div><dt>Margin interval</dt><dd>{readout.marginLow == null || readout.marginHigh == null ? "Unavailable" : `${points(readout.marginLow)} to ${points(readout.marginHigh)}`}</dd></div>
        <div><dt>Model edition</dt><dd><code>{modelId || "Unavailable"}</code></dd></div>
        <div><dt>Exact identity</dt><dd>{readout.identity.homeId && readout.identity.awayId ? `${readout.identity.awayId} at ${readout.identity.homeId}` : "Unavailable"}</dd></div>
      </dl>
      <small className="analysis-readiness-note">Evidence: {readout.evidence.join(" · ") || "No verified forecast evidence"}.</small>
      {readout.missing.length ? <small className="analysis-integrity is-review">Still unavailable: {readout.missing.join(" · ")}.</small> : null}
    </div>
  );
}
