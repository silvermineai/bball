import fs from "node:fs";
import path from "node:path";
import { basketballCalibrationSummary } from "../../_lib/basketball-calibration";

type CalibrationGame = {
  game?: {
    home_score?: number | null;
    away_score?: number | null;
  };
  raw_prediction?: {
    home_margin?: number | null;
  };
};

export type CalibrationBucket = {
  lower: number;
  upper: number;
  label: string;
  games: number;
  predicted: number;
  observed: number;
  gap: number;
  interval_coverage: number;
};

const bands = [
  { label: "0–49%", min: 0, max: 0.5 },
  { label: "50–59%", min: 0.5, max: 0.6 },
  { label: "60–69%", min: 0.6, max: 0.7 },
  { label: "70–79%", min: 0.7, max: 0.8 },
  { label: "80–89%", min: 0.8, max: 0.9 },
  { label: "90–100%", min: 0.9, max: 1.01 },
] as const;

export function buildCalibrationBuckets(
  games: CalibrationGame[],
  coefficients: [number, number],
  marginHalfWidth: number,
): CalibrationBucket[] {
  const [intercept, slope] = coefficients;
  return bands.map((band) => {
    const rows = games.flatMap((row) => {
      const margin = row.raw_prediction?.home_margin;
      const homeScore = row.game?.home_score;
      const awayScore = row.game?.away_score;
      if (![margin, homeScore, awayScore].every((value) => typeof value === "number" && Number.isFinite(value))) return [];
      const probability = 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, intercept + slope * (margin as number)))));
      return probability >= band.min && probability < band.max
        ? [{ probability, winner: (homeScore as number) > (awayScore as number) ? 1 : 0, covered: Math.abs((margin as number) - ((homeScore as number) - (awayScore as number))) <= marginHalfWidth ? 1 : 0 }]
        : [];
    });
    const average = (key: "probability" | "winner" | "covered") => rows.length ? rows.reduce((sum, row) => sum + row[key], 0) / rows.length : null;
    const predicted = average("probability");
    const observed = average("winner");
    return {
      lower: band.min,
      upper: band.max,
      label: band.label,
      games: rows.length,
      predicted: predicted == null ? 0 : predicted,
      observed: observed == null ? 0 : observed,
      gap: predicted == null || observed == null ? 0 : observed - predicted,
      interval_coverage: average("covered") ?? 0,
    };
  }).filter((bucket) => bucket.games > 0);
}

export function readPublishedCalibration(): CalibrationBucket[] {
  try {
    const root = path.join(process.cwd(), "public/data/basketball/evaluation");
    const summary = JSON.parse(fs.readFileSync(path.join(root, "summary.json"), "utf8")) as {
      calibration?: { weekly?: { logistic_coefficients?: number[]; margin_half_width?: number } };
    };
    const games = JSON.parse(fs.readFileSync(path.join(root, "calibration-games.json"), "utf8")) as { games?: CalibrationGame[] };
    const coefficients = summary.calibration?.weekly?.logistic_coefficients;
    const width = summary.calibration?.weekly?.margin_half_width;
    if (!coefficients || coefficients.length !== 2 || width == null) return [];
    return buildCalibrationBuckets(games.games || [], [coefficients[0], coefficients[1]], width);
  } catch {
    return [];
  }
}

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const pctOrDash = (value: number | null) => value == null ? "—" : pct(value);

export default function ForecastCalibrationTable({ buckets }: { buckets: CalibrationBucket[] }) {
  const summary = basketballCalibrationSummary(buckets);
  return (
    <section className="section paper-panel" aria-labelledby="forecast-calibration">
      <div className="section-heading">
        <div>
          <div className="eyebrow">Held-out calibration / probability bands</div>
          <h2 id="forecast-calibration">When the model says 70%, how often is it right?</h2>
        </div>
      </div>
      <p className="note">
        Each row groups the chronological replay by calibrated home-win probability. The observed rate is the share of home wins in that band; the gap is observed minus predicted. Range coverage is the share of games whose final margin landed inside the model&apos;s calibrated band.
      </p>
      {buckets.length ? (
        <>
        <div className="strip" style={{ marginBottom: 18 }} aria-label="Calibration summary">
          <div><strong>{pctOrDash(summary.expectedCalibrationError)}</strong><span>Expected calibration error</span><small>{summary.games.toLocaleString()} weighted held-out games</small></div>
          <div><strong>{pctOrDash(summary.maximumAbsoluteGap)}</strong><span>Largest bucket gap</span><small>Absolute observed minus predicted</small></div>
          <div><strong>{pctOrDash(summary.intervalCoverage)}</strong><span>Weighted range coverage</span><small>Published margin interval</small></div>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Home-win band</th><th className="numeric">Games</th><th className="numeric">Model rate</th><th className="numeric">Observed rate</th><th className="numeric">Gap</th><th className="numeric">Margin range coverage</th></tr></thead>
            <tbody>{buckets.map((bucket) => <tr key={bucket.label}>
              <th scope="row">{bucket.label}</th>
              <td className="numeric">{bucket.games.toLocaleString()}</td>
              <td className="numeric">{pct(bucket.predicted)}</td>
              <td className="numeric"><strong>{pct(bucket.observed)}</strong></td>
              <td className={`numeric ${bucket.gap > 0.03 ? "movement-up" : bucket.gap < -0.03 ? "movement-down" : ""}`}>{bucket.gap > 0 ? "+" : ""}{(bucket.gap * 100).toFixed(1)} pts</td>
              <td className="numeric">{pct(bucket.interval_coverage)}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <p className="note" style={{ marginTop: 12 }}>Expected calibration error is the game-weighted mean absolute gap between predicted and observed home-win rates. It is descriptive for this held-out edition; it does not retune the live forecast.</p>
        </>
      ) : <p className="empty">The calibration replay is unavailable in this edition.</p>}
    </section>
  );
}
