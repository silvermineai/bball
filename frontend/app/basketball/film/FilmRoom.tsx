"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export type FilmTeam = { id: number; name: string; shortName: string; conference: string | null };
export type FilmVideo = {
  videoId: string;
  title: string;
  published: string;
  channel: string;
  thumbnail: string;
  teamIds: number[];
  basketball?: boolean;
};

type Props = { videos: FilmVideo[]; teams: FilmTeam[] };

const searchLinks = (team: FilmTeam) => [
  { label: `${team.shortName} highlights`, query: `${team.name} basketball highlights 2025-26` },
  { label: "Full games", query: `${team.name} mens basketball full game 2025 2026` },
  { label: "March Madness", query: `${team.name} march madness 2026 basketball` },
  { label: "Press conferences", query: `${team.name} basketball press conference` },
];

const publishedDate = (value: string) => {
  if (!value) return "Date unknown";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
};

export default function FilmRoom({ videos, teams }: Props) {
  const [teamId, setTeamId] = useState("");
  const [hoopsOnly, setHoopsOnly] = useState(true);
  const [playing, setPlaying] = useState<string | null>(null);
  const team = teams.find((entry) => String(entry.id) === teamId) ?? null;
  const filtered = useMemo(() => {
    let rows = videos;
    if (team) rows = rows.filter((video) => video.teamIds.includes(team.id));
    if (hoopsOnly && !team) rows = rows.filter((video) => video.basketball);
    return rows;
  }, [videos, team, hoopsOnly]);
  const channels = new Set(filtered.map((video) => video.channel)).size;

  return (
    <>
      <div className="page-title">
        <div className="eyebrow">Basketball / Film assignment</div>
        <h1>Put the numbers<br /><em>on screen.</em></h1>
        <p>
          Review recent clips from official conference and NCAA channels, then use the
          stat file to decide what to ask of the film. A clip is a starting point for
          coaching judgment, not proof of a trend.
        </p>
      </div>

      <section className="section paper-panel" style={{ marginTop: 0 }}>
        <div className="section-heading">
          <div>
            <div className="eyebrow">The projector</div>
            <h2>{team ? `${team.shortName} film queue` : "Official channels"}</h2>
          </div>
          <span className="note">{filtered.length} clips · {channels} channels</span>
        </div>
        <div className="film-controls">
          <label>
            <span className="eyebrow">Focus on a program</span>
            <select value={teamId} onChange={(event) => { setTeamId(event.target.value); setPlaying(null); }}>
              <option value="">All programs</option>
              {teams.filter((entry) => videos.some((video) => video.teamIds.includes(entry.id))).map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.name}</option>
              ))}
            </select>
          </label>
          {!team && (
            <label className="film-check">
              <input type="checkbox" checked={hoopsOnly} onChange={(event) => setHoopsOnly(event.target.checked)} />
              Basketball clips only
            </label>
          )}
          {team && <button className="button secondary" type="button" onClick={() => { setTeamId(""); setPlaying(null); }}>Clear focus</button>}
        </div>
      </section>

      {team && (
        <section className="section">
          <div className="section-heading">
            <div>
              <div className="eyebrow">Deep cuts / Search prompts</div>
              <h2>Extend the assignment.</h2>
            </div>
            <Link href={`/basketball/programs/${team.id}/`}>Open program dossier →</Link>
          </div>
          <div className="film-search-grid">
            {searchLinks(team).map((link) => (
              <a className="paper-panel film-search-card" key={link.label} href={`https://www.youtube.com/results?search_query=${encodeURIComponent(link.query)}`} target="_blank" rel="noreferrer">
                <span className="eyebrow">YouTube search ↗</span>
                <strong>{link.label}</strong>
                <span className="note">{link.query}</span>
              </a>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">{team ? `Matched to ${team.shortName}` : "Latest published clips"}</div>
            <h2>{filtered.length ? "Watch, pause, ask better questions." : "No clips in this queue."}</h2>
          </div>
          <span className="note">Feeds refresh with each data pull.</span>
        </div>
        {filtered.length === 0 ? (
          <p className="note">The current official feeds have no linked film for this selection. Use the search prompts above to find more footage.</p>
        ) : (
          <div className="film-grid">
            {filtered.map((video) => (
              <figure className="film-card" key={video.videoId}>
                {playing === video.videoId ? (
                  <iframe className="film-frame" src={`https://www.youtube-nocookie.com/embed/${video.videoId}?autoplay=1`} title={video.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                ) : (
                  <button className="film-thumb" type="button" onClick={() => setPlaying(video.videoId)} aria-label={`Play ${video.title}`}>
                    {video.thumbnail ? <img src={video.thumbnail} alt="" loading="lazy" /> : <span />}
                    <span className="film-play">▶</span>
                  </button>
                )}
                <figcaption>
                  <strong>{video.title}</strong>
                  <span className="eyebrow">{video.channel} · {publishedDate(video.published)}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </section>

      <p className="note section film-source-note">
        Source: public videos from official NCAA and conference channels. Silvermine matches a clip to a program only when the source metadata contains that program’s identifier; an unlinked clip remains searchable but is not treated as team evidence.
      </p>
    </>
  );
}
