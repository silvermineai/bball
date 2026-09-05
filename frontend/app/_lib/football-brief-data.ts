import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { Game } from "./data";
import type { EfficiencyIndex, EfficiencyProfile } from "./football-efficiency";
import type { PlayerCatalog } from "./football-player-history";
import {
  historicalLeaders,
  type BriefPlayer,
  type FootballBriefEvidence,
} from "./football-brief";
const root = () => path.join(process.cwd(), "public/data/football");
const read = (file: string) => fs.readFileSync(path.join(root(), file), "utf8");
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
let loaded:
  | {
      index: EfficiencyIndex;
      catalog: PlayerCatalog;
      players: Map<number, BriefPlayer[]>;
    }
  | undefined;
function sources() {
  if (!loaded)
    loaded = {
      index: JSON.parse(read("efficiency.json")),
      catalog: JSON.parse(read("player-catalog.json")),
      players: new Map(),
    };
  return loaded;
}
const verified = new Map<string, EfficiencyProfile>();
export function getFootballBriefEvidence(game: Game): FootballBriefEvidence {
  const { index, catalog, players } = sources();
  const playerSeason = game.season - 1;
  const source = catalog.seasons.find((s) => s.season === playerSeason);
  if (!source)
    throw Error("Missing prior-season player catalog for football brief");
  if (!players.has(playerSeason)) {
    const text = read(source.file);
    if (hash(text) !== source.sha256)
      throw Error("Football brief player edition mismatch");
    const data = JSON.parse(text);
    if (
      data.season !== playerSeason ||
      data.players.length !== source.player_team_records
    )
      throw Error("Football brief player coverage mismatch");
    players.set(playerSeason, data.players);
  }
  const programs = [
    { id: game.away_id, name: game.away_name },
    { id: game.home_id, name: game.home_name },
  ];
  const seasons = [playerSeason, game.season].flatMap((year) => {
    const release = index.seasons.find((s) => s.season === year);
    if (!release) return [];
    return [
      {
        season: year,
        retrieved: release.source_fetched_at,
        teams: programs.map((program) => {
          const team = release.teams.find((t) => t.id === program.id);
          if (!team) return null;
          if (team.season !== year)
            throw Error("Football brief team season mismatch");
          if (!verified.has(team.profile_hash)) {
            const text = read(`efficiency/profiles/${team.profile_hash}.json`);
            const profile: EfficiencyProfile = JSON.parse(text);
            if (hash(text.trimEnd()) !== team.profile_hash)
              throw Error("Football brief efficiency edition mismatch");
            verified.set(team.profile_hash, profile);
          }
          const profile = verified.get(team.profile_hash)!;
          if (
            profile.id !== team.id ||
            profile.season !== year ||
            JSON.stringify(profile.samples) !== JSON.stringify(team.samples)
          )
            throw Error("Football brief efficiency edition mismatch");
          return team;
        }),
      },
    ];
  });
  return {
    efficiencyEdition: index.edition,
    playerEdition: catalog.edition,
    playerSeason,
    playerFile: source.file,
    playerSha256: source.sha256,
    metrics: index.metrics,
    seasons,
    programs: programs.map((p) => ({
      ...p,
      personnel: historicalLeaders(
        players.get(playerSeason)!,
        p.id,
        playerSeason,
      ),
    })),
    sources: [
      ...index.sources.filter((s) =>
        seasons.some((y) => y.season === s.season),
      ),
      ...source.sources,
    ],
  };
}
