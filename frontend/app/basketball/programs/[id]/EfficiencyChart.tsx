"use client";
import { useState } from "react";
import type { ScoutGame } from "../../../_lib/scouting-types";
import { date, fmt } from "../../../_lib/format";
export default function EfficiencyChart({ games }: { games: ScoutGame[] }) {
  const [selected, setSelected] = useState(games.length - 1);
  const g = games[Math.max(0, Math.min(selected, games.length - 1))];
  const values = games
    .flatMap((g) => [g.rates.off_eff, g.rates.def_eff])
    .filter((v) => v != null);
  if (!values.length)
    return (
      <p className="empty">No paired efficiency observations in this split.</p>
    );
  const min = Math.floor(Math.min(...values, 100) / 10) * 10 - 10,
    max = Math.ceil(Math.max(...values, 100) / 10) * 10 + 10;
  const x = (i: number) => 48 + i * (660 / Math.max(1, games.length - 1)),
    y = (v: number) => 220 - ((v - min) / (max - min)) * 190;
  function line(key: string) {
    let active = false;
    return games
      .map((g, i) => {
        const v = g.rates[key];
        if (v == null) {
          active = false;
          return "";
        }
        const part = `${active ? "L" : "M"}${x(i)},${y(v)}`;
        active = true;
        return part;
      })
      .join(" ");
  }
  return (
    <div className="efficiency-chart">
      <div className="chart-legend">
        <span>● Offense</span>
        <span>● Opponent offense</span>
        <small>Raw points / 100 possessions · game order</small>
      </div>
      <svg
        viewBox="0 0 740 250"
        aria-label="Game-by-game offensive and defensive efficiency"
      >
        <title>
          Unadjusted efficiency by game. Focus a point to inspect it.
        </title>
        {[min, (min + max) / 2, max].map((v) => (
          <g key={v}>
            <line x1="48" x2="715" y1={y(v)} y2={y(v)} stroke="var(--line)" />
            <text x="5" y={y(v) + 4}>
              {fmt(v, 0)}
            </text>
          </g>
        ))}
        <path
          d={line("off_eff")}
          fill="none"
          stroke="var(--ink)"
          strokeWidth="2"
        />
        <path
          d={line("def_eff")}
          fill="none"
          stroke="var(--orange)"
          strokeWidth="2"
          strokeDasharray="5 3"
        />
        {games.map((g, i) =>
          g.rates.off_eff == null ? null : (
            <circle
              key={g.id}
              cx={x(i)}
              cy={y(g.rates.off_eff)}
              r={i === selected ? 6 : 4}
              fill="var(--ink)"
              tabIndex={0}
              role="button"
              aria-label={`${date(g.starts_at)} versus ${g.opponent}: offense ${fmt(g.rates.off_eff)}, defense ${fmt(g.rates.def_eff)}`}
              onMouseEnter={() => setSelected(i)}
              onFocus={() => setSelected(i)}
              onClick={() => setSelected(i)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelected(i);
                }
              }}
            />
          ),
        )}
        <text x="48" y="245">
          Oldest
        </text>
        <text x="665" y="245">
          Newest
        </text>
      </svg>
      <p className="chart-inspection" aria-live="polite">
        {g
          ? `${date(g.starts_at)} · ${g.location} vs ${g.opponent} · ${g.result || "—"} ${g.score ?? "—"}–${g.allowed ?? "—"} · offense ${fmt(g.rates.off_eff)} / defense ${fmt(g.rates.def_eff)}`
          : "Select a game"}
      </p>
      <p className="note">
        Higher offense and lower opponent offense are better. Opponent strength
        and venue are not adjusted here. Missing paired boxes create gaps.
      </p>
    </div>
  );
}
