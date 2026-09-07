import type { BBPlayer } from "./basketball-types";
import {
  peerMetrics,
  peerValue,
  selectionKey,
  type PeerMetric,
} from "./player-comparison";
export const boardMetrics = peerMetrics;
export type Weights = Record<PeerMetric, number>;
export const presets = {
  scoring: {
    label: "Scoring",
    description: "Scoring volume, true shooting and fewer turnovers.",
    weights: [50, 0, 0, 0, 0, 15, 35, 0],
  },
  balanced: {
    label: "Balanced",
    description:
      "A broad lineup view across production, defense, efficiency and control.",
    weights: [20, 15, 15, 10, 10, 10, 10, 10],
  },
  passing: {
    label: "Passing",
    description: "Assists, fewer turnovers and true shooting.",
    weights: [0, 0, 60, 0, 0, 25, 15, 0],
  },
  rebounding: {
    label: "Rebounding",
    description: "Rebounds, blocks and true shooting.",
    weights: [0, 65, 0, 0, 20, 0, 15, 0],
  },
  events: {
    label: "Steals & blocks",
    description:
      "Recorded defensive events; these do not measure total defense.",
    weights: [0, 0, 0, 60, 40, 0, 0, 0],
  },
} as const;
export function toWeights(values: readonly number[]): Weights {
  return Object.fromEntries(
    boardMetrics.map((m, i) => [m.key, values[i]]),
  ) as Weights;
}
export const defaultWeights = toWeights(presets.scoring.weights);
export type BoardRow = {
  player: BBPlayer;
  values: Record<PeerMetric, number | null>;
  percentiles: Record<PeerMetric, number | null>;
  contributions: Record<PeerMetric, number | null>;
  score: number | null;
  rank: number | null;
};
// Compare rates at ten decimal places so arithmetic noise does not split ties.
const comparableRate = (value: number) => +value.toFixed(10);
// Binary bounds retain tied midranks without an O(players²) scan.
function bound(values: number[], target: number, upper: boolean) {
  let low = 0,
    high = values.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (values[mid] < target || (upper && values[mid] === target))
      low = mid + 1;
    else high = mid;
  }
  return low;
}
export function buildBoard(
  players: BBPlayer[],
  season: number,
  weights: Weights,
) {
  if (
    boardMetrics.some(
      (m) =>
        !Number.isFinite(weights[m.key]) ||
        weights[m.key] < 0 ||
        weights[m.key] > 100,
    )
  )
    throw Error("Weights must be between 0 and 100.");
  const peers = players.filter((p) => p.season === season && p.qualified);
  const sum = boardMetrics.reduce((n, m) => n + weights[m.key], 0);
  const values = Object.fromEntries(
    boardMetrics.map((m) => [
      m.key,
      peers
        .map((p) => peerValue(p, m.key))
        .filter((v): v is number => v !== null && Number.isFinite(v))
        .map(comparableRate)
        .sort((a, b) => a - b),
    ]),
  ) as Record<PeerMetric, number[]>;
  const rows: BoardRow[] = peers.map((player) => {
    const raw = {} as BoardRow["values"],
      percentiles = {} as BoardRow["percentiles"],
      contributions = {} as BoardRow["contributions"];
    for (const m of boardMetrics) {
      const v = peerValue(player, m.key),
        pool = values[m.key];
      raw[m.key] = v !== null && Number.isFinite(v) ? v : null;
      const pct =
        raw[m.key] === null || pool.length < 30
          ? null
          : (100 *
              (bound(pool, comparableRate(v!), false) +
                bound(pool, comparableRate(v!), true))) /
            (2 * pool.length);
      percentiles[m.key] =
        pct === null ? null : m.key === "topg" ? 100 - pct : pct;
      contributions[m.key] =
        weights[m.key] === 0
          ? 0
          : pct === null || !sum
            ? null
            : (percentiles[m.key]! * weights[m.key]) / sum;
    }
    const parts = Object.values(contributions);
    return {
      player,
      values: raw,
      percentiles,
      contributions,
      score:
        !sum || parts.some((v) => v === null)
          ? null
          : parts.reduce<number>((n, v) => n + v!, 0),
      rank: null,
    };
  });
  rows.sort(
    (a, b) =>
      (b.score ?? -1) - (a.score ?? -1) ||
      selectionKey(a.player).localeCompare(selectionKey(b.player)),
  );
  let last: number | null = null,
    rank = 0;
  rows.forEach((r, i) => {
    if (r.score === null) return;
    // Ranks share ties at ten decimal places; exports retain unrounded scores.
    const comparable = +r.score.toFixed(10);
    if (comparable !== last) rank = i + 1;
    r.rank = rank;
    last = comparable;
  });
  return {
    rows,
    peers: peers.length,
    peerCounts: Object.fromEntries(
      boardMetrics.map((m) => [m.key, values[m.key].length]),
    ) as Record<PeerMetric, number>,
    sum,
  };
}
export function filterBoard(
  rows: BoardRow[],
  query: string,
  position: string,
  minimumMinutes: number,
) {
  const q = query.trim().toLowerCase();
  return rows.filter(
    (r) =>
      (r.player.name + " " + r.player.team).toLowerCase().includes(q) &&
      (!position || (r.player.position || "Unknown") === position) &&
      r.player.mpg >= minimumMinutes,
  );
}
export type BoardState = {
  season: number;
  weights: Weights;
  query: string;
  position: string;
  minimumMinutes: number;
  selected: string[];
  invalid: boolean;
};
export function readBoard(
  params: URLSearchParams,
  seasons: number[],
): BoardState {
  const year = params.get("season"),
    season =
      year === null ? Math.max(...seasons) : /^\d{4}$/.test(year) ? +year : 0;
  const input = params.get("w"),
    values = input?.split(",").map(Number);
  const validWeights =
    input === null ||
    (!!values &&
      /^\d+(,\d+){7}$/.test(input) &&
      values.every((v) => Number.isInteger(v) && v >= 0 && v <= 100));
  const minimum = params.get("min") || "0";
  const allSelected = params.getAll("pick");
  const accepted = [
    ...new Set(
      allSelected.filter((v) =>
        new RegExp(`^${season}:[1-9]\\d{0,14}:[1-9]\\d{0,14}$`).test(v),
      ),
    ),
  ].slice(0, 3);
  return {
    season,
    weights: validWeights && values ? toWeights(values) : defaultWeights,
    query: (params.get("q") || "").slice(0, 200),
    position: (params.get("pos") || "").slice(0, 80),
    minimumMinutes: ["0", "20", "30"].includes(minimum) ? +minimum : 0,
    selected: accepted,
    invalid:
      !seasons.includes(season) ||
      !validWeights ||
      !["0", "20", "30"].includes(minimum) ||
      allSelected.some((v) => !accepted.includes(v)),
  };
}
export function boardParams(state: BoardState) {
  const p = new URLSearchParams({
    season: String(state.season),
    w: boardMetrics.map((m) => state.weights[m.key]).join(","),
  });
  if (state.query) p.set("q", state.query);
  if (state.position) p.set("pos", state.position);
  if (state.minimumMinutes) p.set("min", String(state.minimumMinutes));
  state.selected.forEach((s) => p.append("pick", s));
  return p.toString();
}
function cell(value: unknown) {
  let s = value == null ? "" : String(value);
  if (typeof value === "string" && /^\s*[=+\-@]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
export function boardCsv(
  rows: BoardRow[],
  weights: Weights,
  edition: string,
  peerCounts: Record<PeerMetric, number>,
) {
  const header = [
    "season",
    "player_id",
    "team_id",
    "player",
    "program",
    "source_position",
    "games",
    "minutes",
    "priority_score",
    "season_rank",
    "edition",
    ...boardMetrics.flatMap((m) => [
      m.key + "_value",
      m.key + "_percentile",
      m.key + "_weight",
      m.key + "_contribution",
      m.key + "_peers",
    ]),
  ];
  const records = rows.map((r) => [
    r.player.season,
    r.player.id,
    r.player.team_id,
    r.player.name,
    r.player.team,
    r.player.position,
    r.player.games,
    r.player.minutes,
    r.score,
    r.rank,
    edition,
    ...boardMetrics.flatMap((m) => [
      r.values[m.key],
      r.percentiles[m.key],
      weights[m.key],
      r.contributions[m.key],
      peerCounts[m.key],
    ]),
  ]);
  return (
    [header, ...records].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n"
  );
}
