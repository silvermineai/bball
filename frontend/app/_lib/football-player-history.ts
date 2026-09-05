export type PlayerCatalog = {
  edition: string;
  latest_source_retrieved_at: string;
  seasons: {
    season: number;
    file: string;
    sha256: string;
    player_team_records: number;
    box_rows: number;
    box_games: number;
    completed_schedule_games: number;
    team_placeholder_box_rows: number;
    excluded_team_placeholder_entries: number;
    sources: {
      dataset: string;
      season: number;
      url: string;
      fetched_at: string;
      sha256: string;
    }[];
  }[];
};
export async function verifyPlayerIndex(
  bytes: ArrayBuffer,
  season: number,
  catalog: PlayerCatalog,
) {
  const expected = catalog.seasons.find((s) => s.season === season);
  if (!expected) throw Error("Choose a supported stat season.");
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest))
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
  if (hash !== expected.sha256)
    throw Error(
      "The player index and coverage catalog use different editions. Reload the page.",
    );
  const data = JSON.parse(new TextDecoder().decode(bytes));
  if (
    data.season !== season ||
    data.players.length !== expected.player_team_records
  )
    throw Error("The player index disagrees with its coverage record.");
  return data;
}
