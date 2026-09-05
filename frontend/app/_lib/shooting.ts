export type Shot = {
  id: string;
  game: string;
  team: string;
  player: string | null;
  period: number | null;
  clock: string | null;
  points: number;
  made: boolean;
  type: string;
  x: number | null;
  y: number | null;
  location_status: string;
  text: string;
  team_match: boolean;
  player_match: boolean;
  inferred_value: boolean;
};
export type ShotGame = {
  id: string;
  date: string;
  home: string;
  away: string;
  team: string;
  matched: boolean;
  attempts: number;
  made: number;
};
export type ShotProfile = {
  id: string;
  name: string;
  kind: "team" | "player";
  season: number;
  teams: string[];
  games: ShotGame[];
  box_games: number;
  source_sha256: string;
};
export type ShotData = {
  profile: ShotProfile;
  shots: Shot[];
  edition: string;
  source: { fetched_at: string; url: string; sha256: string };
};
export type ShotOption = {
  id: string;
  name: string;
  teams: string[];
  all: { attempts: number };
  matched: { attempts?: number };
  box_games: number;
};
export type ShotCatalog = {
  season: number;
  generated_at: string;
  source: { fetched_at: string; url: string; sha256: string };
  coverage: Record<string, unknown>;
  teams: ShotOption[];
  players: ShotOption[];
};
export const shotTypes: Record<string, string> = {
  layup: "Layups",
  dunk: "Dunks",
  tip: "Tips",
  jumper: "Two-point jumpers",
  three: "Three-pointers",
  other: "Other two-pointers",
};
export function summarizeShots(shots: Shot[]) {
  const made = shots.filter((s) => s.made).length;
  const threesMade = shots.filter((s) => s.made && s.points === 3).length;
  return {
    attempts: shots.length,
    made,
    fg: shots.length ? made / shots.length : null,
    efg: shots.length ? (made + 0.5 * threesMade) / shots.length : null,
    points: shots.filter((s) => s.made).reduce((n, s) => n + s.points, 0),
    plotted: shots.filter(onHalfCourt).length,
  };
}
export function onHalfCourt(s: Shot) {
  return (
    s.x != null &&
    s.y != null &&
    s.location_status === "located" &&
    s.y <= 41.75
  );
}
