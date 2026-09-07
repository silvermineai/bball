"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { fmt } from "../../_lib/format";
type Data = {
  player: { id: string; name: string; position: string | null };
  season: number;
  total: number;
  rows: {
    game_id: string;
    starts_at: string | null;
    home_name: string | null;
    away_name: string | null;
    team_id: string;
    stats: Record<string, number | string | null>;
  }[];
  rosters: {
    season: number;
    team_id: string;
    profile: Record<string, string>;
  }[];
  seasonStats: {
    team_id: string;
    stats: Record<
      string,
      Record<
        string,
        {
          value: number | null;
          display: string;
          label: string;
          description: string;
        }
      >
    >;
  }[];
  participation: {
    season: number;
    team_id: string;
    games: number;
    minutes: number;
  }[];
};
export default function LegacyRecords() {
  const params = useSearchParams(),
    id = params.get("id"),
    requestedSeason = params.get("season");
  const publisherSeasons = [2026, 2025, 2024];
  const initialSeason =
    requestedSeason && publisherSeasons.includes(Number(requestedSeason))
      ? requestedSeason
      : "2026";
  const [season, setSeason] = useState(initialSeason);
  const page = 0;
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    setSeason(initialSeason);
  }, [initialSeason]);
  useEffect(() => {
    if (!id) return;
    const c = new AbortController();
    setData(null);
    setError("");
    fetch(
      `/api/basketball/research/players/${encodeURIComponent(id)}?season=${season}&page=${page}`,
      { signal: c.signal },
    )
      .then((r) => {
        if (!r.ok)
          throw Error(
            r.status === 404
              ? "No imported records found for this player."
              : "The player record is temporarily unavailable.",
          );
        return r.json();
      })
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => c.abort();
  }, [id, page, season]);
  return (
    <>
      <h2>{data?.player.name || "Publisher stats and roster observations."}</h2>
      <div className="toolbar">
        <label className="control">
          <span>PUBLISHER STAT SEASON</span>
          <select value={season} onChange={(e) => setSeason(e.target.value)}>
            {publisherSeasons.map((year) => (
              <option key={year} value={year}>
                {year - 1}–{String(year).slice(-2)}
              </option>
            ))}
          </select>
        </label>
        <p className="note">
          Published source aggregates for the selected season and previously
          imported roster listings. These may differ from independently
          calculated game-log totals.
        </p>
      </div>
      {!id ? (
        <p className="empty">Choose a player from the index or roster board.</p>
      ) : error ? (
        <p role="alert" className="status-error">
          {error}
        </p>
      ) : !data ? (
        <p className="empty" role="status">
          Loading published source records…
        </p>
      ) : (
        <>
          <section className="paper-panel">
            <h2>Roster observations.</h2>
            {data.rosters.length ? (
              data.rosters.map((r) => (
                <p key={`${r.season}-${r.team_id}`}>
                  <strong>
                    {r.season - 1}–{String(r.season).slice(-2)}
                  </strong>{" "}
                  · {r.profile.team_display_name} ·{" "}
                  {r.profile.position_abbreviation || "Position unavailable"}
                  <br />
                  {[
                    r.profile.height,
                    r.profile.weight,
                    r.profile.experience_display_value,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  <br />
                  <small>
                    {r.season === 2027
                      ? "Unconfirmed future-season source listing."
                      : "Source season label; roster records may change after the season."}
                  </small>
                </p>
              ))
            ) : (
              <p>No roster profile is present in the imported releases.</p>
            )}
          </section>
          <section className="section">
            <div className="section-heading">
              <h2>
                Published {Number(season) - 1}–{season.slice(-2)} statistics.
              </h2>
            </div>
            {!data.seasonStats.length && (
              <p className="empty">
                No published season aggregates in this import.
              </p>
            )}
            {data.seasonStats.map((s) => (
              <div key={s.team_id}>
                {Object.entries(s.stats).map(([category, stats]) => (
                  <details key={category}>
                    <summary>
                      {category} · team ID {s.team_id}
                    </summary>
                    <dl className="raw-stat-grid">
                      {Object.entries(stats).map(([key, v]) => (
                        <div key={key}>
                          <dt title={v.description}>{v.label || key}</dt>
                          <dd>{v.display || fmt(v.value)}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                ))}
              </div>
            ))}
          </section>
          <p className="note">
            Source: SportsDataverse bulk releases (CC BY 4.0). NBA-style,
            publisher-computed metrics in the season table retain their source
            labels; they may use formulas that differ from our displayed college
            estimates.
          </p>
        </>
      )}
    </>
  );
}
