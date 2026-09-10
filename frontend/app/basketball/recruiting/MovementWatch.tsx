"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { BBRosters } from "../../_lib/basketball-types";
import { useBasketballRelease } from "../../_components/useBasketballRelease";

type MovementStatus = "different_program" | "new_to_dataset";
type MovementPlayer = {
  id: string;
  name: string;
  team: string;
  team_id: string;
  previous_teams: string[];
  previous_games: number | null;
  previous_minutes: number | null;
  position: string | null;
  source_url: string | null;
  prior_production?: BBRosters["players"][number]["prior_production"];
};
type MovementResponse = {
  season: number;
  players_observed: number;
  status_counts: Record<string, number>;
  players: MovementPlayer[];
  source?: { dataset?: string | null; url?: string | null; fetched_at?: string | null; sha256?: string | null } | null;
};

export default function MovementWatch() {
  const [season, setSeason] = useState(2026);
  const [status, setStatus] = useState<MovementStatus>("different_program");
  const [data, setData] = useState<MovementResponse | null>(null);
  const [error, setError] = useState("");
  const { data: published } = useBasketballRelease<BBRosters>(season === 2026 ? "rosters-2026" : "rosters");

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError("");
    fetch(`/api/basketball/research/rosters?season=${season}&status=${status}&limit=40`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("The live movement snapshot is unavailable.");
        return response.json() as Promise<MovementResponse>;
      })
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "The live movement snapshot is unavailable.");
        }
      });
    return () => controller.abort();
  }, [season, status]);

  const players = useMemo(
    () => [...(data?.players ?? [])]
      .map((player) => ({
        ...player,
        // The live endpoint owns the current observation. Join only the
        // historical profile by exact athlete and team IDs.
        ...(() => {
          const profile = published?.players.find((candidate) => candidate.id === player.id && candidate.team_id === player.team_id);
          return {
            prior_production: profile?.prior_production ?? null,
            position: player.position ?? profile?.position ?? null,
            source_url: player.source_url ?? profile?.source_url ?? null,
          };
        })(),
      }))
      .sort((a, b) => (b.previous_minutes ?? -1) - (a.previous_minutes ?? -1))
      .slice(0, 10),
    [data, published],
  );
  const count = data?.status_counts[status] ?? 0;

  return (
    <section className="section paper-panel movement-watch" aria-labelledby="movement-watch-title">
      <div className="section-heading">
        <div>
          <div className="eyebrow">Player movement / exact source IDs</div>
          <h2 id="movement-watch-title">A short list for the first call.</h2>
        </div>
        <div className="button-row">
          <label className="control">
            <span>VIEW</span>
            <select value={season} onChange={(event) => setSeason(Number(event.target.value))}>
              <option value={2026}>2025–26 observed</option>
              <option value={2027}>2026–27 listed</option>
            </select>
          </label>
          <label className="control">
            <span>OBSERVATION</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as MovementStatus)}>
              <option value="different_program">Changed program</option>
              <option value="new_to_dataset">New to dataset</option>
            </select>
          </label>
        </div>
      </div>
      <p className="note">
        {data
          ? `${count.toLocaleString()} matching observations · ${data.players_observed.toLocaleString()} player IDs in the full source view.`
          : error || "Checking the live roster observation edition…"}
      </p>
      {data?.source && (
        <p className="note" style={{ marginTop: 8 }}>
          Live {data.source.dataset || "roster"} release
          {data.source.fetched_at ? ` · retrieved ${new Date(data.source.fetched_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC` : " · retrieval clock unavailable"}
          {data.source.sha256 ? ` · SHA-256 ${data.source.sha256.slice(0, 16)}…` : " · digest unavailable"}
        </p>
      )}
      {players.length > 0 ? (
        <div className="table-scroll" style={{ marginTop: 16 }}>
          <table className="data-table">
            <thead>
              <tr><th>Player</th><th>Listed program</th><th>Previous program</th><th>Pos.</th><th className="numeric">Prior minutes</th><th className="numeric">Prior games</th><th className="numeric">PPG</th><th className="numeric">TS%</th><th className="numeric">Box BPM</th><th /></tr>
            </thead>
            <tbody>
              {players.map((player) => (
                <tr key={`${player.id}-${player.team_id}`}>
                  <td><strong><Link href={`/basketball/player/?id=${encodeURIComponent(player.id)}&season=${data?.season ? data.season - 1 : 2025}`}>{player.name}</Link></strong><small>Source ID {player.id}</small></td>
                  <td>{player.team}</td>
                  <td>{player.previous_teams.length ? player.previous_teams.join(", ") : "Not recorded"}</td>
                  <td>{player.position || "—"}</td>
                  <td className="numeric">{player.previous_minutes == null ? "—" : player.previous_minutes.toLocaleString()}</td>
                  <td className="numeric">{player.previous_games == null ? "—" : player.previous_games.toLocaleString()}</td>
                  <td className="numeric">{player.prior_production?.ppg == null ? "—" : player.prior_production.ppg.toFixed(1)}</td>
                  <td className="numeric">{player.prior_production?.ts == null ? "—" : `${(player.prior_production.ts * 100).toFixed(1)}%`}</td>
                  <td className="numeric">{player.prior_production?.box_bpm == null ? "—" : player.prior_production.box_bpm.toFixed(1)}</td>
                  <td>{player.source_url ? <a href={player.source_url} target="_blank" rel="noreferrer" aria-label={`Open ${player.name} source`}>Source ↗</a> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : data ? <p className="empty" style={{ marginTop: 16 }}>No matching observations in this release.</p> : null}
      <div className="button-row" style={{ marginTop: 16 }}>
        <Link className="button secondary" href={`/basketball/recruiting/?view=observations&rosterSeason=${season}&rosterStatus=${status}`}>
          Open full observation lab ↗
        </Link>
        {data?.source?.url ? <a className="text-link" href={data.source.url} target="_blank" rel="noreferrer">Open source release ↗</a> : null}
      </div>
      <p className="section-note">
        Observed different-program rows describe exact-ID participation changes; listed 2026–27 rows are unconfirmed source listings. Neither establishes a portal transaction, commitment, eligibility or availability decision.
      </p>
    </section>
  );
}
