import type { ShotOption } from "../_lib/shooting";
import type { ScoutPlayer } from "../_lib/scouting-types";

export type NotebookShotPrepRow = {
  player: ScoutPlayer;
  profile: ShotOption;
  mapHref: string;
  evidence: string;
  question: string;
};

const finiteNonNegative = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

/**
 * Join historical workload to the retained NCAA shot catalog only by the
 * canonical player and team IDs. This is display context for film review; it
 * never turns an archived shooter into a current rotation or forecast input.
 * Rows with missing or impossible denominators are withheld.
 */
export function buildNotebookShotPrep(
  teamId: string,
  players: ScoutPlayer[],
  profiles: ShotOption[],
  shotSeason: number,
): NotebookShotPrepRow[] {
  const byPlayer = new Map(
    profiles
      .filter((profile) => profile.id.trim() && profile.teams.includes(teamId))
      .map((profile) => [profile.id, profile] as const),
  );

  return players.flatMap((player) => {
    const profile = byPlayer.get(player.id);
    const allAttempts = profile?.all.attempts;
    const matchedAttempts = profile?.matched.attempts;
    const located = profile?.matched.located;
    if (
      !profile ||
      !Number.isInteger(profile.box_games) ||
      profile.box_games < 1 ||
      !finiteNonNegative(allAttempts) ||
      !finiteNonNegative(matchedAttempts) ||
      !finiteNonNegative(located) ||
      allAttempts < matchedAttempts ||
      matchedAttempts < located ||
      matchedAttempts === 0
    ) {
      return [];
    }
    const threeAttempts = profile.all.threes;
    const threeShare =
      finiteNonNegative(threeAttempts) && allAttempts > 0
        ? threeAttempts / allAttempts
        : null;
    const coordinateShare = located / matchedAttempts;
    const mapHref = `/basketball/shooting/?player=${encodeURIComponent(player.id)}&team=${encodeURIComponent(teamId)}&season=${encodeURIComponent(String(shotSeason))}`;
    const evidence = `${matchedAttempts.toLocaleString()} matched attempts · ${located.toLocaleString()} with retained coordinates · ${profile.box_games.toLocaleString()} games`;
    const question =
      coordinateShare < 0.5
        ? `Only ${(coordinateShare * 100).toFixed(0)}% of the matched attempts have coordinates. What does the located sample show, and which unlocated looks still need film?`
        : threeShare != null && threeShare >= 0.5
          ? `${(threeShare * 100).toFixed(0)}% of recorded attempts are threes. How will the defense change the closeout without giving up the next action?`
          : `Where does the located sample cluster, and which coverage or transition rule should the staff test against those looks?`;
    return [{ player, profile, mapHref, evidence, question }];
  });
}
