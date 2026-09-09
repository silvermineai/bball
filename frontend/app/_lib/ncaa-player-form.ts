export type NcaaFormGame = {
  stats: Record<string, number | null | undefined>;
};

export type NcaaRecentForm = {
  window_games: number;
  points_games: number;
  minutes_games: number;
  shooting_games: number;
  points_per_game: number | null;
  minutes_per_game: number | null;
  true_shooting: number | null;
  prior_points_per_game: number | null;
  points_delta: number | null;
};

function numberValue(stats: NcaaFormGame["stats"], key: string) {
  const value = stats[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function average(games: NcaaFormGame[], key: string) {
  const values = games
    .map((game) => numberValue(game.stats, key))
    .filter((value): value is number => value != null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function trueShooting(games: NcaaFormGame[]) {
  let points = 0;
  let attempts = 0;
  let sample = 0;
  for (const game of games) {
    const pts = numberValue(game.stats, "pts");
    const fga = numberValue(game.stats, "fga");
    const fta = numberValue(game.stats, "fta");
    const denominator = fga == null || fta == null ? null : fga + 0.475 * fta;
    if (pts == null || denominator == null || denominator <= 0) continue;
    points += pts;
    attempts += denominator;
    sample += 1;
  }
  return {
    value: sample && attempts > 0 ? points / (2 * attempts) : null,
    sample,
  };
}

/**
 * Summarize the newest source rows without treating a missing field as zero.
 * The card API orders its initial game window newest first; callers should
 * preserve that order when passing rows here.
 */
export function buildNcaaRecentForm(games: NcaaFormGame[], window = 5): NcaaRecentForm {
  const size = Number.isInteger(window) && window > 0 ? window : 5;
  const current = games.slice(0, size);
  const prior = games.slice(size, size * 2);
  const currentShooting = trueShooting(current);
  const currentPoints = average(current, "pts");
  const priorPoints = average(prior, "pts");
  return {
    window_games: current.length,
    points_games: current.filter((game) => numberValue(game.stats, "pts") != null).length,
    minutes_games: current.filter((game) => numberValue(game.stats, "mins") != null).length,
    shooting_games: currentShooting.sample,
    points_per_game: currentPoints,
    minutes_per_game: average(current, "mins"),
    true_shooting: currentShooting.value,
    prior_points_per_game: priorPoints,
    points_delta: currentPoints == null || priorPoints == null ? null : currentPoints - priorPoints,
  };
}
