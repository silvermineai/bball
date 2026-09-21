export type MatchupPersonnelStats = {
  ppg: number | null;
  rpg: number | null;
  apg: number | null;
  spg: number | null;
  bpg: number | null;
  mpg: number | null;
  fg_pct: number | null;
  three_pct: number | null;
  ft_pct: number | null;
  field_goals: string | null;
  three_pointers: string | null;
  free_throws: string | null;
};

export type MatchupPersonnelStint = {
  team_id: string;
  team: string;
  games: number | null;
  minutes: number | null;
  stats: MatchupPersonnelStats;
  box_bpm: number | null;
  box_obpm: number | null;
  box_dbpm: number | null;
};

export type MatchupPersonnelPlayer = {
  team_id: string;
  athlete_id: string;
  name: string;
  position: string | null;
  class_year: string | null;
  height: string | null;
  status: "returning" | "incoming" | "new_to_dataset" | "ambiguous";
  recruiting: MatchupRecruitingEvidence | null;
  prior_games: number | null;
  prior_minutes: number | null;
  prior_stints: MatchupPersonnelStint[];
};

export type MatchupRecruitingEvidence = {
  season: number;
  rank: number | null;
  position_rank: number | null;
  grade: number | null;
  status: string | null;
  captured_at: string | null;
  source_sha256: string | null;
};

export type MatchupPersonnelSide = {
  team_id: string;
  team: string;
  listed_players: number;
  returning_players: number;
  incoming_players: number;
  new_to_dataset_players: number;
  ambiguous_players: number;
  players_with_prior_minutes: number;
  players_with_publisher_stats: number;
  players_with_box_bpm: number;
  players: MatchupPersonnelPlayer[];
};

export type MatchupPersonnel = {
  season: number;
  prior_season: number;
  game: {
    id: string;
    starts_at: string;
    completed: boolean;
    home_id: string;
    away_id: string;
    home_name: string | null;
    away_name: string | null;
  };
  coverage: {
    listed_players: number;
    players_with_prior_minutes: number;
    players_with_publisher_stats: number;
    players_with_box_bpm: number;
  };
  home: MatchupPersonnelSide;
  away: MatchupPersonnelSide;
  source_receipts: MatchupPersonnelSourceReceipt[];
  identity_policy: string;
};

export type MatchupPersonnelSourceReceipt = {
  dataset: string;
  season: number;
  fetched_at: string | null;
  sha256: string | null;
};

export type MatchupPersonnelTableRow = {
  key: string;
  athlete_id: string;
  player: string;
  position: string | null;
  status: MatchupPersonnelPlayer["status"];
  prior_team: string | null;
  minutes: number | null;
  mpg: number | null;
  ppg: number | null;
  rpg: number | null;
  apg: number | null;
  spg: number | null;
  bpg: number | null;
  fg_pct: number | null;
  three_pct: number | null;
  ft_pct: number | null;
  field_goals: string | null;
  three_pointers: string | null;
  free_throws: string | null;
  box_bpm: number | null;
  box_obpm: number | null;
  box_dbpm: number | null;
};

export type MatchupPersonnelLeader = {
  athlete_id: string;
  player: string;
  status: MatchupPersonnelPlayer["status"];
  minutes: number;
  share: number;
};

/** Link an exact matchup athlete ID to the player card's retained shot map. */
export function matchupPlayerFileHref(athleteId: string, season: number) {
  return `/basketball/ncaa-player/?id=${encodeURIComponent(athleteId)}&season=${encodeURIComponent(String(season))}#shot-profile`;
}

const statuses = new Set(["returning", "incoming", "new_to_dataset", "ambiguous"]);
const statKeys: Array<keyof MatchupPersonnelStats> = [
  "ppg", "rpg", "apg", "spg", "bpg", "mpg", "fg_pct", "three_pct", "ft_pct",
];
const displayKeys: Array<keyof MatchupPersonnelStats> = ["field_goals", "three_pointers", "free_throws"];

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function nullableNumber(value: unknown) {
  return value == null || (typeof value === "number" && Number.isFinite(value));
}

function nullableString(value: unknown) {
  return value == null || typeof value === "string";
}

function validStats(value: unknown): value is MatchupPersonnelStats {
  const stats = record(value);
  return !!stats
    && statKeys.every((key) => nullableNumber(stats[key]))
    && displayKeys.every((key) => nullableString(stats[key]));
}

function validStint(value: unknown): value is MatchupPersonnelStint {
  const stint = record(value);
  return !!stint
    && typeof stint.team_id === "string"
    && typeof stint.team === "string"
    && nullableNumber(stint.games)
    && nullableNumber(stint.minutes)
    && validStats(stint.stats)
    && nullableNumber(stint.box_bpm)
    && nullableNumber(stint.box_obpm)
    && nullableNumber(stint.box_dbpm);
}

function validPlayer(value: unknown, expectedRecruitingSeason: number): value is MatchupPersonnelPlayer {
  const player = record(value);
  return !!player
    && typeof player.team_id === "string"
    && typeof player.athlete_id === "string"
    && typeof player.name === "string"
    && nullableString(player.position)
    && nullableString(player.class_year)
    && nullableString(player.height)
    && typeof player.status === "string"
    && statuses.has(player.status)
    && (player.recruiting == null || validRecruitingEvidence(player.recruiting, expectedRecruitingSeason))
    && nullableNumber(player.prior_games)
    && nullableNumber(player.prior_minutes)
    && Array.isArray(player.prior_stints)
    && player.prior_stints.every(validStint);
}

function validRecruitingEvidence(value: unknown, expectedSeason: number): value is MatchupRecruitingEvidence {
  const evidence = record(value);
  const rank = (candidate: unknown) => candidate == null || (typeof candidate === "number" && Number.isInteger(candidate) && candidate > 0);
  return !!evidence
    && typeof evidence.season === "number"
    && Number.isInteger(evidence.season)
    && evidence.season === expectedSeason
    && rank(evidence.rank)
    && rank(evidence.position_rank)
    && (evidence.grade == null || (typeof evidence.grade === "number" && Number.isFinite(evidence.grade)))
    && (evidence.status == null || typeof evidence.status === "string")
    && (evidence.captured_at == null || (typeof evidence.captured_at === "string" && Number.isFinite(Date.parse(evidence.captured_at))))
    && (evidence.source_sha256 == null || (typeof evidence.source_sha256 === "string" && /^[a-f0-9]{64}$/i.test(evidence.source_sha256)));
}

function validSide(value: unknown, expectedId: string, expectedRecruitingSeason: number): value is MatchupPersonnelSide {
  const side = record(value);
  const countKeys = [
    "listed_players", "returning_players", "incoming_players", "new_to_dataset_players",
    "ambiguous_players", "players_with_prior_minutes", "players_with_publisher_stats", "players_with_box_bpm",
  ];
  if (!side
    || side.team_id !== expectedId
    || typeof side.team !== "string"
    || !countKeys.every((key) => typeof side[key] === "number" && Number.isInteger(side[key]) && Number(side[key]) >= 0)
    || !Array.isArray(side.players)
    || !side.players.every((player) => validPlayer(player, expectedRecruitingSeason) && player.team_id === expectedId)) return false;
  const players = side.players as MatchupPersonnelPlayer[];
  const hasStats = (player: MatchupPersonnelPlayer) => player.prior_stints.some((stint) =>
    Object.values(stint.stats).some((field) => field != null)
  );
  return side.listed_players === players.length
    && side.returning_players === players.filter((player) => player.status === "returning").length
    && side.incoming_players === players.filter((player) => player.status === "incoming").length
    && side.new_to_dataset_players === players.filter((player) => player.status === "new_to_dataset").length
    && side.ambiguous_players === players.filter((player) => player.status === "ambiguous").length
    && side.players_with_prior_minutes === players.filter((player) => player.prior_minutes != null).length
    && side.players_with_publisher_stats === players.filter(hasStats).length
    && side.players_with_box_bpm === players.filter((player) => player.prior_stints.some((stint) => stint.box_bpm != null)).length;
}

function validSourceReceipt(value: unknown): value is MatchupPersonnelSourceReceipt {
  const receipt = record(value);
  return !!receipt
    && typeof receipt.dataset === "string"
    && receipt.dataset.trim().length > 0
    && typeof receipt.season === "number"
    && Number.isInteger(receipt.season)
    && receipt.season >= 2025
    && (receipt.fetched_at == null || (typeof receipt.fetched_at === "string" && Number.isFinite(Date.parse(receipt.fetched_at))))
    && (receipt.sha256 == null || (typeof receipt.sha256 === "string" && /^[a-f0-9]{64}$/i.test(receipt.sha256)));
}

export function parseMatchupPersonnel(
  value: unknown,
  expected: { gameId: string; season: number; homeId: string; awayId: string },
): MatchupPersonnel {
  const payload = record(value);
  const game = record(payload?.game);
  const coverage = record(payload?.coverage);
  const sourceReceipts = payload?.source_receipts == null
    ? []
    : Array.isArray(payload.source_receipts) && payload.source_receipts.every(validSourceReceipt)
      ? payload.source_receipts as MatchupPersonnelSourceReceipt[]
      : null;
  const coverageKeys = ["listed_players", "players_with_prior_minutes", "players_with_publisher_stats", "players_with_box_bpm"];
  if (!payload || !game || !coverage
    || payload.season !== expected.season
    || payload.prior_season !== expected.season - 1
    || game.id !== expected.gameId
    || game.home_id !== expected.homeId
    || game.away_id !== expected.awayId
    || typeof game.starts_at !== "string"
    || typeof game.completed !== "boolean"
    || !nullableString(game.home_name)
    || !nullableString(game.away_name)
    || typeof payload.identity_policy !== "string"
    || sourceReceipts == null
    || !validSide(payload.home, expected.homeId, expected.season)
    || !validSide(payload.away, expected.awayId, expected.season)
    || !coverageKeys.every((key) => typeof coverage[key] === "number" && Number.isInteger(coverage[key]) && Number(coverage[key]) >= 0)
    || coverage.listed_players !== payload.home.listed_players + payload.away.listed_players
    || coverage.players_with_prior_minutes !== payload.home.players_with_prior_minutes + payload.away.players_with_prior_minutes
    || coverage.players_with_publisher_stats !== payload.home.players_with_publisher_stats + payload.away.players_with_publisher_stats
    || coverage.players_with_box_bpm !== payload.home.players_with_box_bpm + payload.away.players_with_box_bpm) {
    throw new Error("The personnel response did not match the selected matchup.");
  }
  return { ...(payload as unknown as MatchupPersonnel), source_receipts: sourceReceipts };
}

export async function loadMatchupPersonnel(
  game: { id: string; season: number; home_id: string; away_id: string },
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ season: String(game.season), gameId: game.id });
  const response = await fetch(`/api/basketball/research/matchup-personnel?${query}`, { signal });
  if (!response.ok) throw new Error("Exact-game personnel evidence is unavailable.");
  return parseMatchupPersonnel(await response.json(), {
    gameId: game.id,
    season: game.season,
    homeId: game.home_id,
    awayId: game.away_id,
  });
}

export function matchupPersonnelRows(side: MatchupPersonnelSide): MatchupPersonnelTableRow[] {
  return side.players.flatMap((player) => {
    const stints: Array<MatchupPersonnelStint | null> = player.prior_stints.length ? player.prior_stints : [null];
    return stints.map((stint, index) => ({
      key: `${player.team_id}:${player.athlete_id}:${stint?.team_id || "none"}:${index}`,
      athlete_id: player.athlete_id,
      player: player.name,
      position: player.position,
      status: player.status,
      prior_team: stint?.team || null,
      minutes: stint?.minutes ?? null,
      mpg: stint?.stats.mpg ?? null,
      ppg: stint?.stats.ppg ?? null,
      rpg: stint?.stats.rpg ?? null,
      apg: stint?.stats.apg ?? null,
      spg: stint?.stats.spg ?? null,
      bpg: stint?.stats.bpg ?? null,
      fg_pct: stint?.stats.fg_pct ?? null,
      three_pct: stint?.stats.three_pct ?? null,
      ft_pct: stint?.stats.ft_pct ?? null,
      field_goals: stint?.stats.field_goals ?? null,
      three_pointers: stint?.stats.three_pointers ?? null,
      free_throws: stint?.stats.free_throws ?? null,
      box_bpm: stint?.box_bpm ?? null,
      box_obpm: stint?.box_obpm ?? null,
      box_dbpm: stint?.box_dbpm ?? null,
    }));
  });
}

/**
 * Surface the largest recorded prior-season workloads before the full table.
 * This is a historical workload cue, not a projected rotation or availability
 * claim; players without a finite positive minute total stay out of the list.
 */
export function matchupPersonnelLeaders(
  side: MatchupPersonnelSide,
  limit = 3,
): MatchupPersonnelLeader[] {
  const workloads = side.players.flatMap((player) => {
    const minutes = player.prior_minutes;
    return minutes != null && Number.isFinite(minutes) && minutes > 0
      ? [{ player, minutes }]
      : [];
  });
  const total = workloads.reduce((sum, row) => sum + row.minutes, 0);
  const count = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 3;
  if (!Number.isFinite(total) || total <= 0 || count === 0) return [];
  return workloads
    .sort((left, right) => right.minutes - left.minutes || left.player.name.localeCompare(right.player.name))
    .slice(0, count)
    .map(({ player, minutes }) => ({
      athlete_id: player.athlete_id,
      player: player.name,
      status: player.status,
      minutes,
      share: minutes / total,
    }));
}

export function personnelStatusLabel(status: MatchupPersonnelPlayer["status"]) {
  if (status === "returning") return "RET";
  if (status === "incoming") return "IN";
  if (status === "ambiguous") return "CHECK";
  return "NEW";
}
