import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import type { BBPlayer } from "../../_lib/basketball-types";
import { fmt } from "../../_lib/format";

type Metric =
  | "ppg"
  | "rpg"
  | "apg"
  | "spg"
  | "bpg"
  | "ts"
  | "efg";

const specs: { key: Metric; label: string; description: string; percent?: boolean }[] = [
  { key: "ppg", label: "Scoring", description: "Points per game" },
  { key: "rpg", label: "Rebounding", description: "Rebounds per game" },
  { key: "apg", label: "Playmaking", description: "Assists per game" },
  { key: "spg", label: "Steals", description: "Steals per game" },
  { key: "bpg", label: "Rim protection", description: "Blocks per game" },
  { key: "ts", label: "True shooting", description: "Scoring efficiency", percent: true },
  { key: "efg", label: "Shot efficiency", description: "Effective field-goal percentage", percent: true },
];

function leaders(players: BBPlayer[], key: Metric) {
  const rows = players
    .filter((p) => p.qualified && p[key] != null)
    .sort(
      (a, b) =>
        (b[key] as number) - (a[key] as number) ||
        a.name.localeCompare(b.name) ||
        a.team.localeCompare(b.team),
    )
    .slice(0, 10);
  let rank = 0;
  let previous: number | null = null;
  return rows.map((player, index) => {
    const value = player[key] as number;
    if (value !== previous) rank = index + 1;
    previous = value;
    return { player, value, rank };
  });
}

export const metadata = {
  title: "2025–26 college basketball national leaders",
  description:
    "Qualified men’s college basketball leaders in scoring, rebounding, playmaking, defense and shooting efficiency from the Silvermine player archive.",
  alternates: { canonical: "/basketball/leaders/" },
};

export default function Page() {
  const release = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "public/data/basketball/history/players-2026.json"),
      "utf8",
    ),
  ) as { season: number; players: BBPlayer[]; coverage: { qualified_entries: number } };
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">National leaders / {release.season - 1}–{String(release.season).slice(-2)}</div>
        <h1>
          The names behind
          <br />
          <em>the numbers.</em>
        </h1>
        <p>
          A qualified leaderboard for the latest published season. Each board
          requires at least 15 recorded games and 400 minutes before a player
          can appear.
        </p>
      </div>
      <div className="strip">
        <div>
          <strong>{release.coverage.qualified_entries.toLocaleString()}</strong>
          <span>Qualified player/program records</span>
        </div>
        <div>
          <strong>15</strong>
          <span>Minimum recorded games</span>
        </div>
        <div>
          <strong>400</strong>
          <span>Minimum minutes</span>
        </div>
        <div>
          <strong>{release.players.length.toLocaleString()}</strong>
          <span>Identified records in the season file</span>
        </div>
      </div>
      <p className="note">
        Ranks use the full qualified season before any search filters. Rates are
        descriptive production measures, not projections or award votes. The
        source includes some opponents outside Division I; coverage flags stay
        attached to the player archive.
      </p>
      <div className="leader-grid section">
        {specs.map((spec) => (
          <section className="paper-panel" key={spec.key}>
            <div className="eyebrow">{spec.description}</div>
            <h2>{spec.label}</h2>
            <div className="table-scroll">
              <table className="data-table leaders-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Player</th>
                    <th className="numeric">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {leaders(release.players, spec.key).map(({ player, value, rank }) => (
                    <tr key={`${spec.key}-${player.id}-${player.team_id}`}>
                      <td className="rank-number">{rank}</td>
                      <td>
                        <Link href={`/basketball/player/?id=${player.id}&season=${release.season}`}>
                          {player.name}
                        </Link>
                        <small>
                          <Link href={`/basketball/programs/${player.team_id}/`}>
                            {player.team}
                          </Link>
                        </small>
                      </td>
                      <td className="numeric">
                        {fmt(spec.percent ? value * 100 : value, 1)}
                        {spec.percent ? "%" : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
      <p className="note">
        Explore the complete <Link href="/basketball/players/">player archive</Link>{" "}
        to change the season, qualification rule or sort metric. Historical
        production does not establish current eligibility or availability.
      </p>
    </>
  );
}
