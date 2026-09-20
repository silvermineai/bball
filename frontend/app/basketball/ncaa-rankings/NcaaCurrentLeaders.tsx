"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { parseSportScope, scopeLabel, type SportScope } from "../../_lib/sport-scope";

export type IndividualPlayer = {
  player_id: number;
  division?: number;
  name: string;
  team_name?: string | null;
  conference?: string | null;
  class_year?: string | null;
  position?: string | null;
  games?: number | null;
  ppg?: number | null;
  rpg?: number | null;
  apg?: number | null;
  spg?: number | null;
  bpg?: number | null;
  mpg?: number | null;
  ppg_rank?: number | null;
  fgm?: number | null;
  fga?: number | null;
  fg_pct?: number | null;
  three_pct?: number | null;
  three_fgm?: number | null;
  three_fga?: number | null;
  ft_pct?: number | null;
  fta?: number | null;
  ast_to?: number | null;
  pts?: number | null;
  tov?: number | null;
  stl?: number | null;
  blk?: number | null;
};

const number = (value: number | null | undefined, digits = 1) => value == null ? "—" : value.toFixed(digits);
const percent = (value: number | null | undefined) => value == null ? "—" : `${value.toFixed(1)}%`;
const trueShooting = (player: IndividualPlayer) => {
  if (player.pts == null || player.fga == null || player.fga <= 0) return null;
  const denominator = 2 * (player.fga + 0.44 * (player.fta || 0));
  return denominator > 0 ? 100 * player.pts / denominator : null;
};

export type LeaderCategory = {
  label: string;
  field: keyof IndividualPlayer;
  suffix?: string;
  minimum?: (player: IndividualPlayer) => boolean;
};

export const leaderCategories: LeaderCategory[] = [
  { label: "Points per game", field: "ppg" },
  { label: "Rebounds per game", field: "rpg" },
  { label: "Assists per game", field: "apg" },
  { label: "Steals per game", field: "spg" },
  { label: "Blocks per game", field: "bpg" },
  { label: "Minutes per game", field: "mpg" },
  { label: "Field-goal percentage", field: "fg_pct", suffix: "%", minimum: (player) => (player.fga || 0) >= 75 },
  { label: "Three-point percentage", field: "three_pct", suffix: "%", minimum: (player) => (player.three_fga || 0) >= 25 },
  { label: "Free-throw percentage", field: "ft_pct", suffix: "%", minimum: (player) => (player.fta || 0) >= 30 },
  { label: "Assist / turnover", field: "ast_to", minimum: (player) => (player.tov || 0) >= 15 },
];

export function playersForDivision(players: IndividualPlayer[], division: "1" | "2" | "3") {
  return players.filter((player) => player.division === Number(division));
}

export function currentScoringLeaders(players: IndividualPlayer[], division: "1" | "2" | "3") {
  return playersForDivision(players, division)
    .filter((player) => player.games && player.ppg != null)
    .sort((a, b) => (b.ppg ?? -1) - (a.ppg ?? -1) || a.name.localeCompare(b.name))
    .slice(0, 20);
}

export function currentCategoryLeaders(players: IndividualPlayer[], division: "1" | "2" | "3") {
  const qualified = playersForDivision(players, division).filter((player) => (player.games || 0) >= 10);
  return leaderCategories.flatMap((category) => {
    const leader = qualified
      .filter((player) => {
        const value = player[category.field];
        return typeof value === "number" && Number.isFinite(value) && (!category.minimum || category.minimum(player));
      })
      .sort((left, right) => Number(right[category.field]) - Number(left[category.field]) || left.name.localeCompare(right.name))[0];
    return leader && typeof leader[category.field] === "number" ? [{ ...category, player: leader, value: leader[category.field] as number }] : [];
  });
}

function playerLabel(player: IndividualPlayer, scope: SportScope) {
  if (scope.division === "1") {
    return <Link href={`/basketball/ncaa-player/?id=${encodeURIComponent(player.player_id)}&season=2026`}>{player.name} →</Link>;
  }
  return <span>{player.name}</span>;
}

export default function NcaaCurrentLeaders({ players }: { players: IndividualPlayer[] }) {
  const [scope, setScope] = useState<SportScope | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setScope(parseSportScope({
      gender: params.get("gender") || undefined,
      division: params.get("division") || undefined,
    }));
  }, []);

  if (!scope) return <p className="empty" role="status">Reading the requested ranking scope…</p>;
  if (scope.gender === "women") return <section className="scope-unavailable" aria-labelledby="ranking-scope-title"><div className="eyebrow">SCOPE NOT PUBLISHED</div><h2 id="ranking-scope-title">{scopeLabel(scope)}</h2><p>Women&apos;s basketball rows are not imported into this ranking edition. No men&apos;s rows are substituted.</p><Link className="button" href="/basketball/ncaa/?division=1">Open the published men&apos;s archive</Link></section>;

  const division = scope.division;
  const leaders = currentScoringLeaders(players, division);
  const categoryLeaders = currentCategoryLeaders(players, division);
  return <>
    <section className="paper-panel" aria-labelledby="category-leaders" style={{ marginBottom: 24 }}>
      <div className="section-heading" style={{ marginBottom: 12 }}><div><div className="eyebrow">Current season / {scopeLabel(scope)}</div><h2 id="category-leaders">National category leaders</h2></div><span className="note">Rate leaders use simple attempt and game minimums</span></div>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Category</th><th>Leader</th><th>Program</th><th className="numeric">Value</th><th className="numeric">GP</th><th className="numeric">Rank</th></tr></thead><tbody>{categoryLeaders.map((entry) => { const rank = entry.player[`${String(entry.field)}_rank` as keyof IndividualPlayer]; return <tr key={entry.field}><th scope="row">{entry.label}</th><td>{playerLabel(entry.player, scope)}<small>{entry.player.position || "Position unavailable"}</small>{division !== "1" && <small>Published leader row · Archive ID {entry.player.player_id}</small>}</td><td><strong>{entry.player.team_name || "—"}</strong><small>{entry.player.conference || "Conference unavailable"}</small></td><td className="numeric"><strong>{number(entry.value)}{entry.suffix || ""}</strong></td><td className="numeric">{number(entry.player.games, 0)}</td><td className="numeric">{typeof rank === "number" ? number(rank, 0) : "—"}</td></tr>; })}</tbody></table></div>
      {!categoryLeaders.length && <p className="empty">No qualifying {scopeLabel(scope)} category rows are published for this edition.</p>}
    </section>
    <section className="paper-panel" aria-labelledby="scoring-leaders" style={{ marginBottom: 24 }}>
      <div className="section-heading" style={{ marginBottom: 12 }}><div><div className="eyebrow">Current season / {scopeLabel(scope)}</div><h2 id="scoring-leaders">Player leaders, with the full stat line</h2></div><span className="note">Top 20 by points per game · minimum one game</span></div>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Rank</th><th>Player</th><th>Program</th><th>Class / pos.</th><th className="numeric">GP</th><th className="numeric">MPG</th><th className="numeric">PPG</th><th className="numeric">RPG</th><th className="numeric">APG</th><th className="numeric">TS%</th></tr></thead><tbody>{leaders.map((player, index) => <tr key={player.player_id}><td className="numeric"><strong>#{division === "1" ? player.ppg_rank || index + 1 : index + 1}</strong></td><td>{playerLabel(player, scope)}<small>Archive ID {player.player_id}</small></td><td><strong>{player.team_name || "—"}</strong><small>{player.conference || "Conference unavailable"}</small></td><td>{[player.class_year, player.position].filter(Boolean).join(" · ") || "—"}</td><td className="numeric">{number(player.games, 0)}</td><td className="numeric">{number(player.mpg)}</td><td className="numeric"><strong>{number(player.ppg)}</strong></td><td className="numeric">{number(player.rpg)}</td><td className="numeric">{number(player.apg)}</td><td className="numeric">{percent(trueShooting(player))}</td></tr>)}</tbody></table></div>
      {!leaders.length && <p className="empty">No {scopeLabel(scope)} scoring rows are published for this edition.</p>}
      <p className="note" style={{ marginTop: 12 }}>These are recorded season totals and rates from the published NCAA individual edition. Division II and III rows remain in their own cohorts; they are not compared with Division I ranks.</p>
    </section>
  </>;
}
