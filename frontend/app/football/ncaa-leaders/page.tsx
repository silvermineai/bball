import Link from "next/link";
import fs from "node:fs";
import path from "node:path";

type Leader = {
  name: string;
  team: string;
  team_id: string;
  position: string | null;
  records: number;
  games: number;
  primary: number;
  rank: number;
  metrics: Record<string, number>;
};

type Category = {
  key: string;
  label: string;
  primary: string;
  primary_label: string;
  leaders: Leader[];
};

type Release = {
  season: number;
  generated_at: string;
  source_dataset: string;
  identity_note: string;
  source: { url?: string; fetched_at?: string; sha256?: string };
  categories: Category[];
};

const metricLabels: Record<string, string> = {
  pass_yards: "Yards",
  pass_attempts: "Attempts",
  completions: "Completions",
  pass_tds: "TD",
  interceptions: "INT",
  rush_yds_gained: "Yards",
  rush_attempts: "Attempts",
  rush_tds: "TD",
  rush_long: "Long",
  receiving_yards: "Yards",
  rec: "Receptions",
  rec_td: "TD",
  long_rec: "Long",
  tackles: "Tackles",
  solo_tack: "Solo",
  asst_tack: "Assist",
  sacks: "Sacks",
  fgm: "Made",
  fga: "Attempts",
  punt_ret_yds: "Yards",
  punt_ret: "Returns",
  punt_ret_tds: "TD",
  long_pr: "Long",
};

function getRelease(): Release {
  return JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "public/data/football/ncaa-player-leaders.json"),
      "utf8",
    ),
  );
}

function format(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export const metadata = {
  title: "NCAA football player leaders",
  description:
    "Source-native NCAA football player and unit leaderboards built from game-level player statistics.",
  alternates: { canonical: "/football/ncaa-leaders/" },
};

export default function Page() {
  const release = getRelease();
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">NCAA source archive / {release.season}</div>
        <h1>
          The names behind
          <br />
          <em>the box score.</em>
        </h1>
        <p>
          Source-native leaderboards built from the complete {release.season} NCAA
          player-game release. Each table aggregates one source name, team ID
          and category within the season, so the board is useful for triage
          without pretending the release provides a verified athlete identity.
        </p>
        <div className="hero-actions">
          <Link className="button" href="/football/players/">
            Open identified player rankings ↗
          </Link>
          <Link className="button secondary" href="/football/source-stats/?dataset=ncaa_player_stats&season=2025">
            Search raw NCAA rows ↗
          </Link>
        </div>
      </div>
      <div className="strip">
        <div>
          <strong>{release.categories.length}</strong>
          <span>Source categories</span>
        </div>
        <div>
          <strong>{release.categories.reduce((sum, category) => sum + category.leaders.length, 0)}</strong>
          <span>Published leader rows</span>
        </div>
        <div>
          <strong>{release.season}</strong>
          <span>Latest complete source season</span>
        </div>
        <div>
          <strong>{release.source.sha256?.slice(0, 12) || "—"}</strong>
          <span>Receipt hash prefix</span>
        </div>
      </div>
      <p className="note">
        {release.identity_note} Team names come from the source release when
        available; otherwise the team ID stays visible. Values are summed
        counting fields from the source rows, and records/games show the
        denominator behind each total.
      </p>
      <div className="article-grid">
        {release.categories.map((category) => (
          <section className="paper-panel" key={category.key}>
            <div className="section-heading">
              <div>
                <div className="eyebrow">{category.label}</div>
                <h2>{category.primary_label}</h2>
              </div>
              <Link href={"/football/source-stats/?dataset=ncaa_player_stats&season=" + release.season}>
                Raw rows ↗
              </Link>
            </div>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Source name / team</th>
                    <th className="numeric">{category.primary_label}</th>
                    <th className="numeric">Games</th>
                    <th>Other retained fields</th>
                  </tr>
                </thead>
                <tbody>
                  {category.leaders.map((leader) => (
                    <tr key={category.key + "-" + leader.rank + "-" + leader.name + "-" + leader.team_id}>
                      <td className="rank-number">{leader.rank}</td>
                      <th scope="row">
                        <strong>{leader.name}</strong>
                        <small>{leader.team} · {leader.position || "Position unavailable"}</small>
                        <small>Team ID {leader.team_id}</small>
                      </th>
                      <td className="numeric"><strong>{format(leader.primary)}</strong></td>
                      <td className="numeric">{leader.games}<small>{leader.records} source rows</small></td>
                      <td>
                        {Object.entries(leader.metrics)
                          .filter(([key]) => key !== category.primary)
                          .map(([key, value]) => (metricLabels[key] || key) + ": " + format(value))
                          .join(" · ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
      <section className="section paper-panel">
        <div className="eyebrow">Source boundary</div>
        <h2>Use the name as a lead, then open the rows.</h2>
        <p>
          The NCAA-derived release has contest and team context but no stable
          athlete ID. Repeated names are not merged across teams or seasons,
          and these aggregates do not alter the identified player rankings or
          forecast model. Verify a personnel question in the raw source rows
          before treating a leader as one continuous athlete.
        </p>
        {release.source.url && (
          <p>
            <a href={release.source.url} target="_blank" rel="noreferrer">
              Open the attributed source release ↗
            </a>
            {release.source.fetched_at ? " · retrieved " + release.source.fetched_at : ""}
          </p>
        )}
      </section>
    </>
  );
}
