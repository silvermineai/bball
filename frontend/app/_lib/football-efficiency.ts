export type EfficiencyMetric = {
  key: string;
  label: string;
  numerator: string;
  denominator: string;
  format: string;
  definition: string;
};
export type Rate = {
  value: number | null;
  numerator: number;
  denominator: number;
  games: number;
};
export type Sample = {
  games: number;
  paired_games: number;
  scheduled_finals: number;
  missing_games: { id: string; kickoff: string; opponent: string }[];
  offense: Record<string, Rate>;
  defense: Record<string, Rate>;
};
export type EfficiencyTeam = {
  id: string;
  name: string;
  season: number;
  division: string;
  conference: string;
  profile_hash: string;
  samples: Record<"all" | "fbs", Sample>;
};
export type EfficiencySource = {
  dataset: string;
  season: number;
  url: string;
  fetched_at: string;
  sha256: string;
};
export type EfficiencyIndex = {
  edition: string;
  definitions_url: string;
  metrics: EfficiencyMetric[];
  sources: EfficiencySource[];
  seasons: {
    season: number;
    records: number;
    games: number;
    paired_games: number;
    source_fetched_at: string;
    teams: EfficiencyTeam[];
  }[];
};
export type EfficiencyGame = {
  game_id: string;
  kickoff: string;
  season_type: string;
  opponent: string;
  opponent_id: string;
  opponent_division: string;
  venue: string;
  team_score: number | null;
  opponent_score: number | null;
  included: boolean;
  raw: Record<string, string>;
  opponent_raw: Record<string, string> | null;
  offense: Record<string, Rate>;
  defense: Record<string, Rate>;
};
export type EfficiencyProfile = Omit<EfficiencyTeam, "profile_hash"> & {
  games: EfficiencyGame[];
  sources: EfficiencySource[];
};
export function rateText(rate: Rate | undefined, metric: EfficiencyMetric) {
  const value = rate?.value;
  return value == null
    ? "—"
    : metric.format === "percent"
      ? (value * 100).toFixed(1) + "%"
      : value.toFixed(metric.key.includes("epa") ? 3 : 2);
}
export function sortTeams(
  teams: EfficiencyTeam[],
  scope: "all" | "fbs",
  side: "offense" | "defense",
  metric: string,
  direction: "asc" | "desc",
) {
  return [...teams].sort((a, b) => {
    const x = a.samples[scope][side][metric]?.value,
      y = b.samples[scope][side][metric]?.value;
    if (x == null && y != null) return 1;
    if (y == null && x != null) return -1;
    return x != null && y != null && x !== y
      ? (x - y) * (direction === "asc" ? 1 : -1)
      : a.name.localeCompare(b.name);
  });
}
export async function readProfile(
  team: EfficiencyTeam,
  signal: AbortSignal,
): Promise<EfficiencyProfile> {
  const response = await fetch(
    `/data/football/efficiency/profiles/${team.profile_hash}.json`,
    { signal },
  );
  if (!response.ok)
    throw Error("The game evidence could not be loaded. Try again.");
  const text = await response.text();
  const hash = Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(text.trimEnd()),
      ),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  if (hash !== team.profile_hash)
    throw Error(
      "This evidence file does not match the selected edition. Reload the page.",
    );
  const data = JSON.parse(text) as EfficiencyProfile;
  if (data.id !== team.id || data.season !== team.season)
    throw Error("This evidence belongs to a different team or season.");
  return data;
}
