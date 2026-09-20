"use client";

import { useEffect, useMemo, useState } from "react";
import { CourtLines } from "./PlayerShotLocationCourt";
import { PLAYER_COURT } from "../_lib/player-shot-locations";

type Cell = { column: number; row: number; attempts: number; makes: number };
type Profile = {
  profile_id: string;
  name: string;
  team: string;
  identity_status: "stable" | "ambiguous";
  attempts: number;
  makes: number;
  located_attempts: number;
  cells: Cell[];
};
type Publication = {
  coverage: { source_attempts: number; profiles: number; located_attempts: number; ambiguous_profiles: number };
  profiles: Profile[];
};

const columns = 10;
const rows = 9;
const cellWidth = PLAYER_COURT.svgWidth / columns;
const cellHeight = PLAYER_COURT.svgHeight / rows;

const fill = (attempts: number, maximum: number) => {
  if (!attempts || !maximum) return "transparent";
  return `rgba(206, 97, 47, ${(0.12 + 0.68 * Math.sqrt(attempts / maximum)).toFixed(3)})`;
};

export default function WomensShotProfileCourt() {
  const [publication, setPublication] = useState<Publication | null>(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    fetch("/data/basketball/womens-shots.json")
      .then((response) => response.ok ? response.json() : null)
      .then((value: Publication | null) => {
        setPublication(value);
        setSelectedId(value?.profiles[0]?.profile_id || null);
      })
      .catch(() => setPublication(null));
  }, []);

  const matches = useMemo(() => {
    if (!publication) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return publication.profiles.slice(0, 12);
    return publication.profiles.filter((profile) => `${profile.name} ${profile.team} ${profile.profile_id}`.toLowerCase().includes(needle)).slice(0, 20);
  }, [publication, query]);
  const selected = publication?.profiles.find((profile) => profile.profile_id === selectedId) || matches[0] || null;
  const maximum = Math.max(0, ...(selected?.cells.map((cell) => cell.attempts) || []));
  const cellMap = new Map((selected?.cells || []).map((cell) => [`${cell.column}-${cell.row}`, cell]));

  return <section className="field-card" aria-labelledby="wbb-shot-map-title">
    <div className="eyebrow">PLAYER SHOT MAP · 2026 SOURCE COORDINATES</div>
    <h2 id="wbb-shot-map-title">Where each player likes to shoot</h2>
    <p className="muted">Search the retained shot identities, then inspect attempt concentration on the court. The map uses the supplied court feet coordinates; it does not guess a join to the season player table.</p>
    {!publication ? <p className="muted">Loading shot-coordinate profiles…</p> : <>
      <div className="wbb-shot-map-controls">
        <label htmlFor="wbb-shot-search">Find a player</label>
        <input id="wbb-shot-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, team, or source ID" />
        <div className="wbb-shot-search-results" role="listbox" aria-label="Shot profile matches">
          {matches.map((profile) => <button className={profile.profile_id === selected?.profile_id ? "active" : ""} key={profile.profile_id} type="button" onClick={() => setSelectedId(profile.profile_id)} role="option" aria-selected={profile.profile_id === selected?.profile_id}>
            <span>{profile.name}<small>{profile.team} · {profile.attempts.toLocaleString()} attempts</small></span>
          </button>)}
          {!matches.length ? <span className="muted">No source profile matches.</span> : null}
        </div>
      </div>
      {selected ? <div className="wbb-shot-map-layout">
        <div>
          <svg viewBox={`0 0 ${PLAYER_COURT.svgWidth} ${PLAYER_COURT.svgHeight}`} className="wbb-shot-map-court" role="img" aria-labelledby="wbb-shot-map-title wbb-shot-map-description">
            <desc id="wbb-shot-map-description">Warmer cells contain more attempts from {selected.name}.</desc>
            <CourtLines />
            {Array.from({ length: columns * rows }, (_, index) => {
              const column = index % columns;
              const row = Math.floor(index / columns);
              const cell = cellMap.get(`${column}-${row}`);
              return <rect key={`${column}-${row}`} x={column * cellWidth} y={row * cellHeight} width={cellWidth} height={cellHeight} fill={fill(cell?.attempts || 0, maximum)} stroke={cell?.attempts ? "rgba(206, 97, 47, .22)" : "transparent"} strokeWidth="1"><title>{cell ? `${cell.attempts.toLocaleString()} attempts · ${cell.makes.toLocaleString()} makes` : "No recorded attempts"}</title></rect>;
            })}
          </svg>
          <p className="muted">Warmer cells indicate more attempts. The drawing shows one half court; every source attempt remains in the totals.</p>
        </div>
        <div className="wbb-shot-map-summary">
          <div className="wbb-shot-map-player"><strong>{selected.name}</strong><span>{selected.team}</span><small>Source shooter ID · {selected.profile_id}</small>{selected.identity_status === "ambiguous" ? <small className="status-warn">Identity fields vary in the release; review before joining.</small> : null}</div>
          <dl>
            <div><dt>Attempts</dt><dd>{selected.attempts.toLocaleString()}</dd></div>
            <div><dt>Made</dt><dd>{selected.makes.toLocaleString()} · {selected.attempts ? `${((selected.makes / selected.attempts) * 100).toFixed(1)}%` : "—"}</dd></div>
            <div><dt>Located</dt><dd>{selected.located_attempts.toLocaleString()} · {selected.attempts ? `${((selected.located_attempts / selected.attempts) * 100).toFixed(1)}%` : "—"}</dd></div>
          </dl>
        </div>
      </div> : null}
      <p className="muted">{publication.coverage.profiles.toLocaleString()} source shooter profiles · {publication.coverage.source_attempts.toLocaleString()} attempts · {publication.coverage.ambiguous_profiles.toLocaleString()} profiles flagged for identity review.</p>
    </>}
  </section>;
}
