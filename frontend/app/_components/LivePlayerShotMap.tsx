"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  summarizePlayerShotBands,
  summarizePlayerShotSides,
  type PlayerShotLocation,
} from "../_lib/player-shot-locations";
import PlayerShotLocationCourt from "./PlayerShotLocationCourt";

export type ShootingLeader = {
  player_id: string;
  team_id: string;
  player_name: string | null;
  team_name: string | null;
  value: number;
  stats: {
    attempts: number;
    coordinate_count?: number;
    located_count?: number;
  };
};

type ShootingLeadersResponse = {
  rows?: ShootingLeader[];
};

type ShotCoverageStats = {
  attempts?: number | null;
  located_count?: number | null;
};

type CoordinateShot = {
  contest_id?: string | null;
  x: number | null;
  y: number | null;
  zone?: string | null;
  type?: string | null;
  made?: boolean | number | null;
  points?: number | null;
};

type CoordinateTuple = [
  string | null,
  number | null,
  number | null,
  number | null,
  string | null,
  string | null,
  boolean | number | null,
  number | null,
];

type PlayerCardResponse = {
  shooting?: Array<{
    season: number;
    team_id: string;
    stats: {
      coordinates?: Array<CoordinateShot | CoordinateTuple>;
    };
  }>;
};

export function eligibleShotMapLeaders(rows: ShootingLeader[]) {
  return rows
    // coordinate_count includes retained rows with null/placeholder points;
    // only a positive located_count can produce a useful map.
    .filter((row) => /^\d{1,15}$/.test(row.player_id) && Boolean(row.player_name) && (row.stats.located_count || 0) > 0)
    .slice(0, 12);
}

/**
 * Keep coordinate coverage visible beside the map. A positive coordinate
 * count is not interchangeable with a complete shot sample: the denominator
 * is every retained attempt, including rows that cannot be plotted.
 */
export function shotMapCoverageLabel(stats: ShotCoverageStats) {
  const attempts = typeof stats.attempts === "number" && Number.isFinite(stats.attempts) && stats.attempts >= 0
    ? Math.trunc(stats.attempts)
    : null;
  const located = typeof stats.located_count === "number" && Number.isFinite(stats.located_count) && stats.located_count >= 0
    ? Math.trunc(stats.located_count)
    : null;
  if (attempts === null) return "Location coverage unavailable";
  if (located === null) return `— / ${attempts.toLocaleString()} located coordinates`;
  if (located > attempts) return "Location coverage invalid";
  const rate = attempts > 0 ? ` (${((located / attempts) * 100).toFixed(1)}%)` : "";
  return `${located.toLocaleString()} / ${attempts.toLocaleString()} located coordinates${rate}`;
}

/** Put the sample size and coordinate coverage in the chooser so a reader
 * can select a useful map before loading the individual player card. */
export function shotMapLeaderOptionLabel(row: Pick<ShootingLeader, "player_id" | "player_name" | "team_name" | "stats">) {
  const name = row.player_name || `Player ${row.player_id}`;
  const team = row.team_name || "Team unavailable";
  const attempts = typeof row.stats.attempts === "number" && Number.isFinite(row.stats.attempts) && row.stats.attempts >= 0
    ? `${Math.trunc(row.stats.attempts).toLocaleString()} FGA`
    : "FGA unavailable";
  return `${name} · ${team} · ${attempts} · ${shotMapCoverageLabel(row.stats)}`;
}

export function playerCardShotLocations(
  card: PlayerCardResponse,
  season: number,
  playerId: string,
  teamId?: string,
): PlayerShotLocation[] {
  return (card.shooting || [])
    .filter((row) => row.season === season && (!teamId || row.team_id === teamId))
    .flatMap((row) => (row.stats.coordinates || []).map((raw, index) => {
      const shot: CoordinateShot = Array.isArray(raw) ? {
        contest_id: raw[0],
        x: raw[1],
        y: raw[2],
        zone: raw[4],
        type: raw[5],
        made: raw[6],
        points: raw[7],
      } : raw;
      return {
        id: `${row.team_id}-${shot.contest_id || "attempt"}-${index}`,
        game: shot.contest_id || null,
        player: playerId,
        x: shot.x,
        y: shot.y,
        made: shot.made,
        points: shot.points ?? null,
        type: shot.type || shot.zone || null,
        location_status: shot.x == null || shot.y == null ? "missing" : "located",
        text: shot.zone || "",
      };
    }));
}

/**
 * Give the reader a fast, descriptive read of the selected map. These are
 * display bins over plotted coordinates, so they never imply handedness,
 * shot quality, or a future role.
 */
export function summarizeShotMapTendency(shots: readonly PlayerShotLocation[]) {
  const band = summarizePlayerShotBands(shots)
    .filter((row) => row.attempts > 0)
    .sort((a, b) => b.attempts - a.attempts || a.band.localeCompare(b.band))[0] || null;
  const side = summarizePlayerShotSides(shots)
    .filter((row) => row.attempts > 0)
    .sort((a, b) => b.attempts - a.attempts || a.side.localeCompare(b.side))[0] || null;
  return {
    band: band ? { label: band.band, share: band.share, attempts: band.attempts } : null,
    side: side ? { label: side.side, share: side.share, attempts: side.attempts } : null,
  };
}

export default function LivePlayerShotMap({ season }: { season: number }) {
  const [leaders, setLeaders] = useState<ShootingLeader[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [card, setCard] = useState<PlayerCardResponse | null>(null);
  const [loadingLeaders, setLoadingLeaders] = useState(true);
  const [loadingCard, setLoadingCard] = useState(false);
  const [error, setError] = useState("");
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoadingLeaders(true);
    setError("");
    fetch(`/api/basketball/research/ncaa-shooting?season=${season}&metric=volume&minAttempts=200&page=0`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Player shot locations could not be loaded.");
        return response.json() as Promise<ShootingLeadersResponse>;
      })
      .then((payload) => {
        if (controller.signal.aborted) return;
        const next = eligibleShotMapLeaders(payload.rows || []);
        setLeaders(next);
        setSelectedId((current) => next.some((row) => row.player_id === current) ? current : (next[0]?.player_id || ""));
      })
      .catch((reason) => {
        if (reason.name !== "AbortError") setError(reason.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingLeaders(false);
      });
    return () => controller.abort();
  }, [retryNonce, season]);

  useEffect(() => {
    if (!selectedId) {
      setCard(null);
      return;
    }
    const controller = new AbortController();
    setCard(null);
    setLoadingCard(true);
    setError("");
    fetch(`/api/basketball/research/ncaa-player-card/${encodeURIComponent(selectedId)}?season=${season}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("This player’s shot locations could not be loaded.");
        return response.json() as Promise<PlayerCardResponse>;
      })
      .then((payload) => {
        if (!controller.signal.aborted) setCard(payload);
      })
      .catch((reason) => {
        if (reason.name !== "AbortError") setError(reason.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingCard(false);
      });
    return () => controller.abort();
  }, [selectedId, season]);

  const selected = leaders.find((row) => row.player_id === selectedId) || null;
  const shots = useMemo(
    () => card && selected ? playerCardShotLocations(card, season, selected.player_id, selected.team_id) : [],
    [card, season, selected],
  );
  const tendency = useMemo(() => summarizeShotMapTendency(shots), [shots]);
  const retry = () => setRetryNonce((value) => value + 1);

  return (
    <section className="dashboard-section dashboard-shot-lab" aria-labelledby="dashboard-shot-map">
      <div className="dashboard-section-heading">
        <div>
          <span className="eyebrow">04 / SHOT MAP</span>
          <h2 id="dashboard-shot-map">Where players like to shoot</h2>
        </div>
        <div className="button-row">
          {selected ? <Link href={`/basketball/ncaa-player/?id=${encodeURIComponent(selected.player_id)}&season=${season}`}>Open {selected.player_name}&apos;s full stats →</Link> : null}
          <Link href="/basketball/ncaa-shooting/">All shooting profiles →</Link>
        </div>
      </div>
      <div className="dashboard-shot-toolbar">
        <p className="dashboard-caption">Choose a high-volume shooter to see attempt concentration from recorded court coordinates. Unavailable locations stay in the totals and never become invented points on the floor.</p>
        <label className="dashboard-shot-select">
          <span>PLAYER</span>
          <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} disabled={loadingLeaders || !leaders.length}>
            {leaders.map((leader) => (
              <option value={leader.player_id} key={leader.player_id}>
                {shotMapLeaderOptionLabel(leader)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {selected ? <p className="note" role="status">Source profile: {shotMapCoverageLabel(selected.stats)}. The map plots only validated x/y coordinates; its all-attempt total retains unlocated attempts.</p> : null}
      {tendency.band || tendency.side ? (
        <div className="dashboard-shot-insight" aria-label="Selected player shot tendency summary">
          <div>
            <span>Most common distance band</span>
            <strong>{tendency.band?.label || "—"}</strong>
            <small>{tendency.band ? `${tendency.band.attempts.toLocaleString()} attempts · ${(tendency.band.share * 100).toFixed(1)}% of plotted` : "No plotted attempts"}</small>
          </div>
          <div>
            <span>Most common chart side</span>
            <strong>{tendency.side?.label || "—"}</strong>
            <small>{tendency.side ? `${tendency.side.attempts.toLocaleString()} attempts · ${(tendency.side.share * 100).toFixed(1)}% of plotted` : "No plotted attempts"}</small>
          </div>
          <p>Quick read from geometric coordinate bins. Chart side describes the drawing only; it does not establish handedness or shot quality.</p>
        </div>
      ) : null}
      {error ? (
        <div className="status-error" role="alert"><span>{error}</span><button className="button secondary" type="button" onClick={retry}>Retry shot map</button></div>
      ) : loadingLeaders || loadingCard ? (
        <p className="empty" role="status">Loading player shot coordinates…</p>
      ) : selected && shots.length ? (
        <PlayerShotLocationCourt
          shots={shots}
          playerName={selected.player_name || `Player ${selected.player_id}`}
          title={`${selected.player_name || "Player"} shot profile`}
          recordedAttempts={selected.stats.attempts}
          showEvents
          className="dashboard-shot-court"
        />
      ) : (
        <p className="empty">No plottable player coordinates are available for this season.</p>
      )}
    </section>
  );
}
