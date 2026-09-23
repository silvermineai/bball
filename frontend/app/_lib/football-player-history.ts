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

/**
 * Validate the identity boundary before a player release reaches the board.
 *
 * The release is intentionally JSON rather than a generated TypeScript
 * object, so a changed or partially written asset could otherwise render
 * duplicate player/team rows or silently turn malformed source values into
 * blanks.  Keep this check structural: it verifies what the archive claims
 * to contain without inventing values or joining by name.
 */
function validatePlayerRows(data: unknown, season: number) {
  if (!data || typeof data !== "object") {
    throw Error("The player index is not a valid object.");
  }
  const record = data as Record<string, unknown>;
  if (!Array.isArray(record.players)) {
    throw Error("The player index has no player rows.");
  }
  const identities = new Set<string>();
  for (const [index, value] of record.players.entries()) {
    if (!value || typeof value !== "object") {
      throw Error(`The player index contains an invalid row at ${index}.`);
    }
    const player = value as Record<string, unknown>;
    const id = player.id;
    const teamId = player.team_id;
    if (typeof id !== "string" || !/^[1-9]\d*$/.test(id)) {
      throw Error(`The player index contains an invalid athlete ID at row ${index}.`);
    }
    if (typeof teamId !== "string" || !teamId.trim()) {
      throw Error(`The player index contains an incomplete team identity at row ${index}.`);
    }
    const identity = `${id}:${teamId}`;
    if (identities.has(identity)) {
      throw Error(`The player index contains duplicate athlete/team identity ${identity}.`);
    }
    identities.add(identity);
    if (
      typeof player.name !== "string" ||
      !player.name.trim() ||
      typeof player.team !== "string" ||
      !player.team.trim() ||
      typeof player.division !== "string" ||
      !player.division.trim() ||
      player.season !== season ||
      !Array.isArray(player.categories) ||
      !player.categories.every((category) => typeof category === "string" && category.trim()) ||
      new Set(player.categories).size !== player.categories.length ||
      !player.production ||
      typeof player.production !== "object" ||
      Array.isArray(player.production)
    ) {
      throw Error(`The player index contains malformed identity fields at row ${index}.`);
    }
    const production = player.production as Record<string, unknown>;
    for (const category of player.categories as string[]) {
      const stats = production[category];
      if (!stats || typeof stats !== "object" || Array.isArray(stats)) {
        throw Error(`The player index is missing production for ${identity}:${category}.`);
      }
      for (const [key, stat] of Object.entries(stats as Record<string, unknown>)) {
        if (typeof stat === "number" && !Number.isFinite(stat)) {
          throw Error(`The player index contains a non-finite ${key} value for ${identity}.`);
        }
        if (key === "metrics") {
          if (!stat || typeof stat !== "object" || Array.isArray(stat)) {
            throw Error(`The player index contains malformed source metrics for ${identity}.`);
          }
          for (const [metric, value] of Object.entries(stat as Record<string, unknown>)) {
            if (typeof value !== "number" || !Number.isFinite(value)) {
              throw Error(`The player index contains a non-finite source metric ${metric} for ${identity}.`);
            }
          }
        }
      }
    }
  }
}

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
  if (data.season !== season || !Array.isArray(data.players) || data.players.length !== expected.player_team_records)
    throw Error("The player index disagrees with its coverage record.");
  validatePlayerRows(data, season);
  return data;
}
