"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  findWomensPlayerProfile,
  finiteWomensProfileValue,
  womensBoxPerGameFields,
  womensBoxTotalFields,
  type WomensBoxPlayerRecord,
  type WomensSeasonPlayerRecord,
} from "../../_lib/womens-player-profile";
import { formatWomensPlayerStat, womensPlayerDetailGroups, womensPlayerFieldLabel } from "../../_lib/womens-player-detail";
import { WOMENS_SOURCE_SCOPE_LABEL, WOMENS_SOURCE_SCOPE_NOTE } from "../../_lib/womens-source-scope";
import { womensShotProfileSearchHref } from "../../_lib/womens-shot-summary";

type Edition = {
  observed_player_season: number;
  generated_at: string;
  players: WomensSeasonPlayerRecord[];
};

type BoxEdition = {
  generated_at: string;
  coverage: { players: number; rows: number; played_rows: number; dnp_rows: number };
  players: WomensBoxPlayerRecord[];
};

const number = (value: unknown, digits = 1) => {
  const numeric = finiteWomensProfileValue(value);
  return numeric == null ? "—" : numeric.toFixed(digits);
};

const percentage = (value: unknown) => {
  const numeric = finiteWomensProfileValue(value);
  return numeric == null ? "—" : `${numeric.toFixed(1)}%`;
};

const date = (value: string | undefined) => {
  if (!value) return "capture date unavailable";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "capture date unavailable" : parsed.toLocaleDateString("en-US", { timeZone: "UTC" });
};

export default function WomensPlayerProfile() {
  const params = useSearchParams();
  const id = params.get("id") || "";
  const [edition, setEdition] = useState<Edition | null>(null);
  const [boxEdition, setBoxEdition] = useState<BoxEdition | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setEdition(null);
    setBoxEdition(null);
    setError("");
    Promise.all([
      fetch("/data/basketball/womens-edition.json", { signal: controller.signal }),
      fetch("/data/basketball/womens-box-player-stats.json", { signal: controller.signal }),
    ])
      .then(async ([seasonResponse, boxResponse]) => {
        if (!seasonResponse.ok || !boxResponse.ok) throw new Error("The women’s player releases could not be loaded.");
        return [await seasonResponse.json() as Edition, await boxResponse.json() as BoxEdition] as const;
      })
      .then(([seasonValue, boxValue]) => {
        if (!controller.signal.aborted) {
          setEdition(seasonValue);
          setBoxEdition(boxValue);
        }
      })
      .catch((reason: Error) => {
        if (reason.name !== "AbortError") setError(reason.message);
      });
    return () => controller.abort();
  }, [id]);

  const profile = useMemo(
    () => edition && boxEdition ? findWomensPlayerProfile(id, edition.players, boxEdition.players) : null,
    [boxEdition, edition, id],
  );
  if (!id) return <div className="page-title"><div className="eyebrow">Women&apos;s basketball / player file</div><h1>Open a player&apos;s production file.</h1><p>Choose a player from the women&apos;s player table to inspect exact-ID season and game-box evidence.</p><Link className="button" href="/basketball/players/?sport=basketball&gender=women">Find a player ↗</Link></div>;
  if (error) return <p className="empty" role="alert">{error}</p>;
  if (!edition || !boxEdition) return <p className="empty" role="status">Loading women&apos;s player evidence…</p>;
  if (!profile) return <><Link className="eyebrow" href="/basketball/players/?sport=basketball&gender=women">← Women&apos;s player table</Link><p className="empty">No retained player row matches exact ID {id}.</p></>;

  const seasonStats = profile.season?.stats || {};
  const box = profile.box;
  return <>
    <Link className="eyebrow" href="/basketball/players/?sport=basketball&gender=women">← Women&apos;s player table</Link>
    <div className="page-title">
      <div className="hero-actions"><Link className="hero-link" href={womensShotProfileSearchHref(profile.name)}>Search women&apos;s shot-coordinate archive ↗</Link></div>
      <p className="note">The shot archive opens as a name search because its source profile IDs are separate from this player ID. Review the returned team label and identity status before treating a shot profile as the same athlete.</p>
      <div className="eyebrow">Women&apos;s player file / exact athlete ID {profile.player_id}</div>
      <h1>{profile.name}</h1>
      <p>{profile.team}{profile.position ? ` · ${profile.position}` : ""}. This profile keeps season-release and game-box evidence together by exact publisher athlete ID. {WOMENS_SOURCE_SCOPE_NOTE}</p>
    </div>
    <section className="section paper-panel" aria-label="Women's player production summary">
      <div className="section-heading"><div><div className="eyebrow">Observed production / {edition.observed_player_season}</div><h2>One simple read on the player.</h2></div><span className="note">{WOMENS_SOURCE_SCOPE_LABEL}</span></div>
      <div className="strip">
        <div><strong>{number(box?.games_played ?? seasonStats.gamesPlayed, 0)}</strong><span>Games with recorded playing time</span></div>
        <div><strong>{number(box?.per_game.points ?? seasonStats.avgPoints)}</strong><span>Points / game</span></div>
        <div><strong>{number(box?.per_game.rebounds ?? seasonStats.avgRebounds)}</strong><span>Rebounds / game</span></div>
        <div><strong>{number(box?.per_game.assists ?? seasonStats.avgAssists)}</strong><span>Assists / game</span></div>
        <div><strong>{number(box?.per_game.minutes ?? seasonStats.avgMinutes)}</strong><span>Minutes / game</span></div>
        <div><strong>{percentage(box?.shooting.field_goal_pct ?? seasonStats.fieldGoalPct)}</strong><span>Field-goal %</span></div>
        <div><strong>{percentage(box?.shooting.three_point_pct ?? seasonStats.threePointFieldGoalPct)}</strong><span>3-point %</span></div>
        <div><strong>{percentage(box?.shooting.free_throw_pct ?? seasonStats.freeThrowPct)}</strong><span>Free-throw %</span></div>
      </div>
      <p className="note">Captured {date(edition.generated_at)}. A dash means the retained release has no finite value for that field; it is never treated as zero.</p>
    </section>
    <section className="section two-col">
      <div className="paper-panel"><div className="eyebrow">Game-box totals</div><h2>What was recorded.</h2>{box ? <><p className="note">{box.box_rows.toLocaleString()} source rows · {box.games_played.toLocaleString()} played · {box.dnp_rows.toLocaleString()} reported DNP · {box.starts.toLocaleString()} starts.</p><div className="table-scroll"><table className="data-table"><thead><tr><th>Field</th><th className="numeric">Total</th></tr></thead><tbody>{womensBoxTotalFields.map(([key, label]) => <tr key={key}><th scope="row">{label}</th><td className="numeric">{number(box.totals[key], 2)}</td></tr>)}</tbody></table></div></> : <p className="empty">No game-box aggregate is available for this exact athlete ID.</p>}</div>
      <div className="paper-panel"><div className="eyebrow">Per-game profile</div><h2>How the workload was used.</h2>{box ? <><p className="note">Arithmetic aggregate of played source rows. Reported DNP rows are excluded from these averages.</p><div className="table-scroll"><table className="data-table"><thead><tr><th>Field</th><th className="numeric">Per game</th></tr></thead><tbody>{womensBoxPerGameFields.map(([key, label]) => <tr key={key}><th scope="row">{label}</th><td className="numeric">{number(box.per_game[key], 2)}</td></tr>)}</tbody></table></div><p className="note">Observed teams: {(box.teams || [{ team_id: box.team_id, team: box.team }]).map((team) => `${team.team} (${team.team_id})`).join(" · ")}</p></> : <p className="empty">No game-box average is available for this exact athlete ID.</p>}</div>
    </section>
    <section className="section paper-panel" aria-label="Season release fields">
      <div className="section-heading"><div><div className="eyebrow">Season release / retained fields</div><h2>Open the full stat line.</h2></div><span className="note">{Object.keys(seasonStats).length} numeric fields</span></div>
      {profile.season ? <>{womensPlayerDetailGroups.map((group) => <div key={group.label} style={{ marginTop: 18 }}><h3>{group.label}</h3><div className="raw-stat-grid">{group.fields.map(([key, label, kind]) => <div key={key}><dt>{label}</dt><dd>{formatWomensPlayerStat(seasonStats, key, kind)}</dd></div>)}</div></div>)}{Object.keys(seasonStats).filter((key) => !womensPlayerDetailGroups.flatMap((group) => group.fields.map(([field]) => field)).includes(key)).length ? <p className="note">Other retained fields: {Object.keys(seasonStats).filter((key) => !womensPlayerDetailGroups.flatMap((group) => group.fields.map(([field]) => field)).includes(key)).map(womensPlayerFieldLabel).join(" · ")}</p> : null}</> : <p className="empty">The player is present in the game-box release but not the 1,000-row season release.</p>}
    </section>
    <section className="section paper-panel"><h2>Read the evidence carefully.</h2><p>This is a current observed production file for one exact athlete ID. It does not infer eligibility, injury, transfer status, role, or future performance. The season release and game-box archive are separate views; missing values remain unavailable.</p></section>
  </>;
}
