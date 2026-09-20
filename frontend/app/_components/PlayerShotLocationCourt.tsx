"use client";

import { useMemo, useState } from "react";
import { fmt } from "../_lib/format";
import {
  buildPlayerCourtZones,
  classifyPlayerShotLocation,
  isPlottablePlayerShot,
  PLAYER_COURT,
  summarizePlayerShotBands,
  summarizePlayerShotSides,
  matchesPlayerShotOutcome,
  toPlayerCourtPoint,
  type PlayerShotOutcomeFilter,
  type PlayerShotLocation,
} from "../_lib/player-shot-locations";

export type PlayerShotLocationCourtProps = {
  shots: readonly PlayerShotLocation[];
  playerName?: string;
  title?: string;
  compact?: boolean;
  showEvents?: boolean;
  /** Initial marker filter; the density heatmap always remains all plotted attempts. */
  eventFilter?: PlayerShotOutcomeFilter;
  className?: string;
};

const zoneFill = (attempts: number, maximum: number) => {
  if (!attempts || !maximum) return "transparent";
  const opacity = 0.1 + 0.62 * Math.sqrt(attempts / maximum);
  return `rgba(206, 97, 47, ${opacity.toFixed(3)})`;
};

export default function PlayerShotLocationCourt({
  shots,
  playerName = "Player",
  title = "Shot location profile",
  compact = false,
  showEvents = false,
  eventFilter: initialEventFilter = "all",
  className = "",
}: PlayerShotLocationCourtProps) {
  const [eventFilter, setEventFilter] = useState<PlayerShotOutcomeFilter>(initialEventFilter);
  const zones = useMemo(() => buildPlayerCourtZones(shots), [shots]);
  const bands = useMemo(() => summarizePlayerShotBands(shots), [shots]);
  const sides = useMemo(() => summarizePlayerShotSides(shots), [shots]);
  const plotted = useMemo(() => shots.filter(isPlottablePlayerShot), [shots]);
  const eventMarkers = useMemo(
    () => plotted.filter((shot) => matchesPlayerShotOutcome(shot, eventFilter)),
    [eventFilter, plotted],
  );
  const missing = shots.filter((shot) => classifyPlayerShotLocation(shot) === "missing").length;
  const beyondHalfCourt = shots.filter((shot) => classifyPlayerShotLocation(shot) === "beyond_half_court").length;
  const maximumAttempts = Math.max(0, ...zones.map((zone) => zone.attempts));
  const totalAttempts = shots.length;
  const made = plotted.filter((shot) => shot.made).length;
  const id = `player-shot-location-${playerName.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "profile"}`;

  return (
    <section className={`min-w-0 rounded-md border border-line bg-white p-4 shadow-sm ${className}`} aria-labelledby={`${id}-title`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow text-court">PLAYER SHOOTING MAP</p>
          <h2 id={`${id}-title`} className="text-xl font-semibold text-ink">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-graphite">{playerName} · attempt concentration from recorded court coordinates</p>
        </div>
        <div className="shrink-0 text-right font-stat text-[10px] uppercase tracking-[0.14em] text-graphite">
          <strong className="block text-lg tracking-normal text-ink">{plotted.length.toLocaleString()}</strong>
          plotted
        </div>
      </div>

      <div className={compact ? "" : "grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(220px,.8fr)]"}>
        <div>
          <svg
            viewBox={`0 0 ${PLAYER_COURT.svgWidth} ${PLAYER_COURT.svgHeight}`}
            className="block aspect-[500/470] w-full rounded border border-line bg-[#fbfbf6]"
            role="img"
            aria-labelledby={`${id}-title ${id}-description`}
          >
            <title>{`${playerName} shot location concentration`}</title>
            <desc id={`${id}-description`}>
              Warmer cells contain a larger share of this player&apos;s recorded attempts. {showEvents ? `Event markers show ${eventFilter === "all" ? "all recorded outcomes" : eventFilter === "made" ? "made attempts" : "missed attempts"}.` : "Individual attempt markers are hidden."}
            </desc>
            <CourtLines />
            <g aria-label="Attempt density by coordinate cell">
              {zones.map((zone) => (
                <g key={zone.key}>
                  <rect
                    x={zone.x}
                    y={zone.y}
                    width={zone.width}
                    height={zone.height}
                    fill={zoneFill(zone.attempts, maximumAttempts)}
                    stroke={zone.attempts ? "rgba(206, 97, 47, .2)" : "transparent"}
                    strokeWidth="1"
                  >
                    <title>
                      {`${zone.attempts.toLocaleString()} attempts · ${zone.makes.toLocaleString()} makes${zone.makeRate == null ? "" : ` · ${(zone.makeRate * 100).toFixed(1)}% made`} · ${(zone.share * 100).toFixed(1)}% of plotted attempts`}
                    </title>
                  </rect>
                  {!compact && zone.attempts > 0 ? (
                    <text x={zone.x + zone.width / 2} y={zone.y + zone.height / 2 + 3} textAnchor="middle" fontSize="10" fontFamily="IBM Plex Mono, monospace" fill="#182b26" pointerEvents="none">
                      {zone.attempts}
                    </text>
                  ) : null}
                </g>
              ))}
            </g>
            {showEvents ? (
              <g aria-label="Individual recorded attempts">
                {eventMarkers.map((shot, index) => {
                  const point = toPlayerCourtPoint(shot);
                  if (!point) return null;
                  return (
                    <circle
                      key={`${shot.game}-${shot.id}-${index}`}
                      cx={point.x}
                      cy={point.y}
                      r="2.4"
                      fill={shot.made ? "#1f8a62" : "#c94d3f"}
                      fillOpacity=".72"
                      stroke="#fff"
                      strokeWidth=".7"
                    >
                      <title>{`${shot.made ? "Made" : "Missed"} ${shot.points}-point attempt${shot.text ? ` · ${shot.text}` : ""}`}</title>
                    </circle>
                  );
                })}
              </g>
            ) : null}
          </svg>
          <p className="mt-2 text-xs leading-5 text-graphite">
            Warmer cells mean more attempts. The heatmap always uses all plotted attempts; the marker filter changes only the made/missed event dots. Counts and shooting rates use plotted coordinates only; unavailable locations remain in the attempt total below.
          </p>
        </div>

        <div className="min-w-0">
          <div className="grid grid-cols-3 border-y border-line py-3 font-stat text-[10px] uppercase tracking-[0.12em] text-graphite">
            <div><span className="block">All attempts</span><strong className="mt-1 block text-lg tracking-normal text-ink">{totalAttempts.toLocaleString()}</strong></div>
            <div><span className="block">Plotted</span><strong className="mt-1 block text-lg tracking-normal text-ink">{plotted.length.toLocaleString()}</strong></div>
            <div><span className="block">Plotted FG%</span><strong className="mt-1 block text-lg tracking-normal text-ink">{plotted.length ? `${fmt((made / plotted.length) * 100, 1)}%` : "—"}</strong></div>
          </div>
          <div className="mt-4">
            <p className="eyebrow text-court">GEOMETRIC BANDS</p>
            <p className="mt-1 text-xs leading-5 text-graphite">Display bins from the coordinates; they do not replace source event labels.</p>
            <div className="mt-2 divide-y divide-line border-y border-line">
              {bands.map((band) => (
                <div key={band.band} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span>{band.band}</span>
                  <span className="font-stat text-xs text-graphite">{band.attempts.toLocaleString()} · {band.makeRate == null ? "—" : `${(band.makeRate * 100).toFixed(1)}%`}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4">
            <p className="eyebrow text-court">COURT-SIDE TENDENCY</p>
            <p className="mt-1 text-xs leading-5 text-graphite">Chart left, middle and right are divided at the painted-lane edges (x = ±8 ft).</p>
            <div className="mt-2 divide-y divide-line border-y border-line">
              {sides.map((side) => (
                <div key={side.side} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span>{side.side}</span>
                  <span className="text-right font-stat text-xs text-graphite">
                    {side.attempts.toLocaleString()} · {(side.share * 100).toFixed(1)}% plotted · {side.makeRate == null ? "—" : `${(side.makeRate * 100).toFixed(1)}% FG`}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-3 text-xs leading-5 text-graphite">
            {missing.toLocaleString()} attempt{missing === 1 ? "" : "s"} lack a usable coordinate
            {beyondHalfCourt ? `; ${beyondHalfCourt.toLocaleString()} beyond the half-court drawing` : ""}. They are retained in All attempts and omitted from the map.
          </p>
        </div>
      </div>
      {showEvents ? (
        <label className="mt-3 inline-flex items-center gap-2 text-xs font-stat uppercase tracking-[0.12em] text-graphite">
          <span>Attempt markers</span>
          <select
            aria-label="Attempt marker outcome"
            className="rounded border border-line bg-white px-2 py-1 text-xs normal-case tracking-normal text-ink"
            value={eventFilter}
            onChange={(event) => setEventFilter(event.target.value as PlayerShotOutcomeFilter)}
          >
            <option value="all">All outcomes</option>
            <option value="made">Made only</option>
            <option value="missed">Missed only</option>
          </select>
        </label>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-graphite" aria-label="Shot map legend">
        <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-[#ce612f]" aria-hidden="true" /> More attempts</span>
        {showEvents ? <><span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-make" aria-hidden="true" /> {eventFilter === "made" ? "Made markers" : eventFilter === "missed" ? "Made hidden" : "Made"}</span><span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-miss" aria-hidden="true" /> {eventFilter === "missed" ? "Missed markers" : eventFilter === "made" ? "Missed hidden" : "Missed"}</span></> : null}
      </div>
    </section>
  );
}

function CourtLines() {
  return (
    <g fill="none" stroke="#9aa49a" strokeWidth="2">
      <rect x="1" y="1" width="498" height="468" strokeWidth="3" />
      <path d="M170 0 V190 H330 V0 M190 190 A60 60 0 0 0 310 190 M190 190 A60 60 0 0 1 310 190" />
      <path d="M33.6 0 V99.7 A221.46 221.46 0 0 0 466.4 99.7 V0" />
      <path d="M220 40 H280" stroke="#6f7d72" strokeWidth="4" strokeLinecap="round" />
      <circle cx="250" cy="52.5" r="7.5" stroke="#c0843e" strokeWidth="3" />
      <path d="M190 469 A60 60 0 0 1 310 469" stroke="#6f7d72" strokeDasharray="6 8" />
      <line x1="250" y1="0" x2="250" y2="470" stroke="#6f7d72" strokeDasharray="4 10" opacity=".2" />
    </g>
  );
}

export { CourtLines };
