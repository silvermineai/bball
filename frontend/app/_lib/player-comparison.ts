import type { BBPlayer } from "./basketball-types";
import type {
  CareerCatalog,
  CareerCoverage,
  CareerData,
  CareerSource,
  CareerSummary,
  StatKey,
} from "./careers";

export type Selection = { season: number; id: string; team_id: string };
export type SeasonPlayers = {
  season: number;
  edition: string;
  players: BBPlayer[];
  coverage: CareerCoverage;
};
export type Comparison = {
  selection: Selection;
  player: BBPlayer;
  summary: CareerSummary;
  edition: string;
  coverage: CareerCoverage;
  sources: CareerSource[];
  peers: BBPlayer[];
};
export type Basis = "per40" | "perGame";
export const selectionKey = (s: Selection) =>
  `${s.season}:${s.id}:${s.team_id}`;
export const comparisonHref = (s: Selection) =>
  `/basketball/compare-players/?p=${selectionKey(s)}`;
export function readSelections(params: URLSearchParams, seasons: number[]) {
  const accepted: Selection[] = [];
  let rejected = 0;
  for (const value of params.getAll("p")) {
    const match = /^(\d{4}):([1-9]\d{0,14}):([1-9]\d{0,14})$/.exec(value);
    if (!match || !seasons.includes(+match[1])) {
      rejected++;
      continue;
    }
    const s = { season: +match[1], id: match[2], team_id: match[3] };
    if (accepted.some((p) => selectionKey(p) === value)) continue;
    if (accepted.length === 3) {
      rejected++;
      continue;
    }
    accepted.push(s);
  }
  return { selections: accepted, rejected };
}
export function comparisonParams(selections: Selection[], basis: Basis) {
  const params = new URLSearchParams();
  selections.forEach((s) => params.append("p", selectionKey(s)));
  params.set("basis", basis);
  return params.toString();
}
export function validateSeason(
  data: SeasonPlayers,
  season: number,
  catalog: CareerCatalog,
) {
  const coverage = catalog.seasons.find((s) => s.season === season);
  if (
    !coverage ||
    data.season !== season ||
    data.edition !== coverage.edition ||
    data.coverage.edition !== data.edition ||
    data.coverage.season !== season
  )
    throw Error(
      "The archive edition changed. Reload this page for matching records.",
    );
  return data;
}
export function joinComparison(
  s: Selection,
  index: SeasonPlayers,
  data: CareerData,
): Comparison {
  const player = index.players.find(
    (p) => p.id === s.id && p.team_id === s.team_id && p.season === s.season,
  );
  const profile = data.profiles.find(
    (p) => p.season === s.season && p.id === s.id,
  );
  const summary = profile?.teams.find((t) => t.team_id === s.team_id);
  if (!player || !profile || !summary || !summary.games)
    throw Error(
      "This player/program record is not in the selected season. Choose another record from search.",
    );
  if (
    index.season !== s.season ||
    data.id !== s.id ||
    data.season !== s.season ||
    data.edition !== index.edition ||
    profile.edition !== index.edition ||
    data.coverage.edition !== index.edition
  )
    throw Error(
      "The index and detailed statistics use different editions. Reload before comparing.",
    );
  // Check the shared figures as well as edition labels; never combine a different program's totals.
  for (const key of [
    "games",
    "mpg",
    "ppg",
    "rpg",
    "apg",
    "spg",
    "bpg",
    "topg",
    "efg",
    "ts",
    "three_pct",
  ] as const) {
    const a = player[key],
      b = summary[key];
    if (a === null || b === null ? a !== b : Math.abs(a - b) > 1e-8)
      throw Error(
        "The index and detailed statistics disagree. Reload before comparing.",
      );
  }
  if (
    summary.totals.min !== player.minutes ||
    summary.qualified !== player.qualified
  )
    throw Error("The workload records disagree. Reload before comparing.");
  return {
    selection: s,
    player,
    summary,
    edition: index.edition,
    coverage: index.coverage,
    sources: data.sources,
    peers: index.players,
  };
}
export const counting = [
  ["pts", "Points"],
  ["reb", "Rebounds"],
  ["ast", "Assists"],
  ["stl", "Steals"],
  ["blk", "Blocks"],
  ["tov", "Turnovers"],
  ["orb", "Offensive rebounds"],
  ["drb", "Defensive rebounds"],
  ["pf", "Personal fouls"],
] as const;
export type RateMetric =
  | "efg"
  | "ts"
  | "fg_pct"
  | "two_pct"
  | "three_pct"
  | "ft_pct"
  | "three_rate"
  | "ft_rate"
  | "ast_to";
export const shooting: {
  key: RateMetric;
  label: string;
  formula: string;
  percent: boolean;
}[] = [
  {
    key: "efg",
    label: "Effective FG",
    formula: "(FGM + 0.5 × 3PM) / FGA",
    percent: true,
  },
  {
    key: "ts",
    label: "True shooting",
    formula: "PTS / [2 × (FGA + 0.475 × FTA)]",
    percent: true,
  },
  { key: "fg_pct", label: "Field goals", formula: "FGM / FGA", percent: true },
  {
    key: "two_pct",
    label: "Two-pointers",
    formula: "(FGM − 3PM) / (FGA − 3PA)",
    percent: true,
  },
  {
    key: "three_pct",
    label: "Three-pointers",
    formula: "3PM / 3PA",
    percent: true,
  },
  { key: "ft_pct", label: "Free throws", formula: "FTM / FTA", percent: true },
  {
    key: "three_rate",
    label: "Three-point attempt share",
    formula: "3PA / FGA",
    percent: true,
  },
  {
    key: "ft_rate",
    label: "Free-throw attempt rate",
    formula: "FTA / FGA",
    percent: true,
  },
  {
    key: "ast_to",
    label: "Assist / turnover",
    formula: "AST / TO",
    percent: false,
  },
];
const ratio = (a: number | null, b: number | null) =>
  a === null || b === null || b <= 0 ? null : a / b;
export function countValue(s: CareerSummary, field: StatKey, basis: Basis) {
  return ratio(s.totals[field], basis === "per40" ? s.totals.min : s.games) ===
    null
    ? null
    : ratio(s.totals[field], basis === "per40" ? s.totals.min : s.games)! *
        (basis === "per40" ? 40 : 1);
}
export function rateValue(s: CareerSummary, metric: RateMetric) {
  const t = s.totals;
  if (metric === "fg_pct") return ratio(t.fgm, t.fga);
  if (metric === "ft_rate") return ratio(t.fta, t.fga);
  if (metric === "ast_to") return ratio(t.ast, t.tov);
  if (metric === "two_pct")
    return [t.fgm, t.tpm, t.fga, t.tpa].some((v) => v === null)
      ? null
      : ratio(t.fgm! - t.tpm!, t.fga! - t.tpa!);
  return s[metric] ?? null;
}
export const peerMetrics = [
  { key: "ppg", label: "Scoring", unit: "PTS / 40" },
  { key: "rpg", label: "Rebounding", unit: "REB / 40" },
  { key: "apg", label: "Assisting", unit: "AST / 40" },
  { key: "spg", label: "Steals", unit: "STL / 40" },
  { key: "bpg", label: "Blocks", unit: "BLK / 40" },
  { key: "topg", label: "Turnovers", unit: "TO / 40" },
  { key: "ts", label: "True shooting", unit: "TS%" },
  { key: "efg", label: "Effective shooting", unit: "eFG%" },
] as const;
export type PeerMetric = (typeof peerMetrics)[number]["key"];
export function peerValue(p: BBPlayer, key: PeerMetric) {
  return key === "ts" || key === "efg"
    ? p[key]
    : p[key] === null || p.minutes <= 0
      ? null
      : (p[key]! * p.games * 40) / p.minutes;
}
export function percentile(
  player: BBPlayer,
  players: BBPlayer[],
  key: PeerMetric,
) {
  const value = peerValue(player, key);
  const values = players
    .filter((p) => p.season === player.season && p.qualified)
    .map((p) => peerValue(p, key))
    .filter((v): v is number => v !== null && Number.isFinite(v));
  if (!player.qualified || value === null || values.length < 30)
    return { value: null, n: values.length };
  const tolerance = 1e-9 * Math.max(1, Math.abs(value));
  const lower = values.filter((v) => v < value - tolerance).length;
  const tied = values.filter((v) => Math.abs(v - value) <= tolerance).length;
  return {
    value: (100 * (lower + tied / 2)) / values.length,
    n: values.length,
  };
}
function csvCell(value: unknown) {
  let text = value === null || value === undefined ? "" : String(value);
  if (typeof value === "string" && /^[\s]*[=+\-@]/.test(text))
    text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function comparisonCsv(records: Comparison[], basis: Basis) {
  const rows: unknown[][] = [
    [
      "season",
      "player_id",
      "team_id",
      "player",
      "program",
      "games",
      "minutes",
      "incomplete_box_games",
      "qualified",
      "metric",
      "unit",
      "value",
      "edition",
    ],
  ];
  for (const r of records) {
    const base = [
      r.selection.season,
      r.selection.id,
      r.selection.team_id,
      r.player.name,
      r.player.team,
      r.summary.games,
      r.summary.totals.min,
      r.summary.incomplete_box_games,
      r.summary.qualified,
    ];
    counting.forEach(([field]) =>
      rows.push([
        ...base,
        field,
        basis === "per40" ? "per_40_minutes" : "per_game",
        countValue(r.summary, field, basis),
        r.edition,
      ]),
    );
    shooting.forEach((m) =>
      rows.push([
        ...base,
        m.key,
        "ratio",
        rateValue(r.summary, m.key),
        r.edition,
      ]),
    );
    for (const [field, total] of Object.entries(r.summary.totals)) {
      rows.push([...base, field, "total", total, r.edition]);
      rows.push([
        ...base,
        field,
        "recorded_games",
        r.summary.samples[field as StatKey],
        r.edition,
      ]);
    }
    peerMetrics.forEach((m) => {
      const p = percentile(r.player, r.peers, m.key);
      rows.push([...base, m.key, "same_season_percentile", p.value, r.edition]);
      rows.push([...base, m.key, "qualified_peer_count", p.n, r.edition]);
    });
  }
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
