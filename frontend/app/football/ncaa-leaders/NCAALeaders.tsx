import Link from "next/link";

type Leader = {
  name: string;
  team: string;
  team_id: string;
  position: string | null;
  records: number;
  games: number;
  primary: number;
  primary_per_game?: number | null;
  rank: number;
  metrics: Record<string, number>;
};

type Category = {
  key: string;
  label: string;
  primary: string;
  primary_label: string;
  rank_basis?: string;
  rate_basis?: string;
  leaders: Leader[];
};

export type Release = {
  season: number;
  generated_at: string;
  source_dataset: string;
  identity_note: string;
  source: { url?: string; fetched_at?: string; sha256?: string };
  division_coverage?: {
    status: "available" | "unavailable";
    supported_divisions: string[];
    player_rows: number;
    rows_with_explicit_division: number;
    source_team_keys: number;
    team_keys_reused_across_games: number;
    matching_team_directory_keys: number;
    reason: string;
  };
  source_category_coverage?: Array<{
    category: string;
    rows: number;
    rows_with_source_name: number;
    rows_with_position_or_number: number;
    rows_with_stat_fields: number;
    rows_with_explicit_division: number;
    rows_with_stable_athlete_id: number;
    team_placeholder_rows: number;
    fields: string[];
    identity_status: "source_name_and_team_only" | "mixed_identity_fields";
  }>;
  categories: Category[];
  available_seasons?: number[];
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

function format(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export default function NCAALeaders({ release }: { release: Release }) {
  const divisionCoverage = release.division_coverage;
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">Player archive / {release.season}</div>
        <h1>
          The names behind
          <br />
          <em>the box score.</em>
        </h1>
        <p>
          Leaderboards built from the complete {release.season} player-game
          release. Each table aggregates one source name, team ID
          and category within the season, so the board is useful for triage
          without pretending the release provides a verified athlete identity.
        </p>
        <div className="hero-actions">
          <Link className="button" href="/football/players/">
            Open identified player rankings ↗
          </Link>
          <Link className="button secondary" href={"/football/source-stats/?dataset=ncaa_player_stats&season=" + release.season}>
            Search raw player rows ↗
          </Link>
        </div>
        {release.available_seasons && release.available_seasons.length > 1 && (
          <p className="note" style={{ marginTop: 18 }}>
            Browse source seasons: {release.available_seasons.map((season, index) => (
              <span key={season}>
                {index > 0 ? " · " : ""}
                {season === release.season ? <strong>{season}</strong> : <Link href={`/football/ncaa-leaders/${season}/`}>{season}</Link>}
              </span>
            ))}
          </p>
        )}
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
          <span>Selected source season</span>
        </div>
        <div>
          <strong>{release.source.sha256?.slice(0, 12) || "—"}</strong>
          <span>Receipt hash prefix</span>
        </div>
      </div>
      <p className="note">
        {release.identity_note} Team names come from the retained edition when
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
                <p className="note">
                  Rank: {category.rank_basis || "source-category total"}. Rate context: {category.rate_basis || "unavailable"}.
                </p>
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
                    <th className="numeric">{category.primary_label} total</th>
                    <th className="numeric">{category.primary_label} / game</th>
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
                        <small>Team ID {leader.team_id} · <Link href={`/football/source-stats/?dataset=ncaa_player_stats&season=${release.season}&team=${encodeURIComponent(leader.team_id)}`}>Open source rows ↗</Link></small>
                      </th>
                      <td className="numeric"><strong>{format(leader.primary)}</strong></td>
                      <td className="numeric">{leader.primary_per_game == null ? "—" : format(leader.primary_per_game)}</td>
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
          The Player release has contest and team context but no stable
          athlete ID. Repeated names are not merged across teams or seasons,
          and these aggregates do not alter the identified player rankings or
          forecast model. Verify a personnel question in the raw source rows
          before treating a leader as one continuous athlete.
        </p>
        {release.source.url && (
          <p>
            <span>
              Retained edition
            </span>
            {release.source.fetched_at ? " · retrieved " + release.source.fetched_at : ""}
          </p>
        )}
      </section>
      {divisionCoverage && (
        <section className="section paper-panel" aria-labelledby="ncaa-division-coverage">
          <div className="eyebrow">Division coverage</div>
          <h2 id="ncaa-division-coverage">
            {divisionCoverage.status === "available"
              ? "Exact division labels are retained."
              : "This source edition cannot separate D1, D2 and D3."}
          </h2>
          <p>{divisionCoverage.reason}</p>
          <p className="note">
            {divisionCoverage.player_rows.toLocaleString()} eligible player rows · {divisionCoverage.source_team_keys.toLocaleString()} source team keys · {divisionCoverage.matching_team_directory_keys.toLocaleString()} keys matched to the retained team directory.
          </p>
          {divisionCoverage.status === "unavailable" && (
            <p className="note">
              These tables intentionally remain an all-source view. A division selector would imply a player-team join that this release does not provide.
            </p>
          )}
        </section>
      )}
      {release.source_category_coverage?.length ? (
        <section className="section paper-panel" aria-labelledby="ncaa-source-category-coverage">
          <div className="eyebrow">Source coverage / every category</div>
          <h2 id="ncaa-source-category-coverage">See what the release actually contains.</h2>
          <p>
            The coverage ledger includes every category in this retained NCAA
            edition, including rows that cannot support a leaderboard. Fields
            are listed exactly as supplied; a stable athlete ID is never
            inferred from a name, team or contest key.
          </p>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Source category</th>
                  <th className="numeric">Rows</th>
                  <th className="numeric">Player-shaped rows</th>
                  <th className="numeric">Rows with stat fields</th>
                  <th className="numeric">Team placeholders</th>
                  <th>Identity / fields</th>
                </tr>
              </thead>
              <tbody>
                {release.source_category_coverage.map((item) => (
                  <tr key={item.category}>
                    <th scope="row">
                      {item.category}
                      <small>{item.rows_with_explicit_division.toLocaleString()} explicit division fields</small>
                    </th>
                    <td className="numeric">{item.rows.toLocaleString()}</td>
                    <td className="numeric">{item.rows_with_position_or_number.toLocaleString()}</td>
                    <td className="numeric">{item.rows_with_stat_fields.toLocaleString()}</td>
                    <td className="numeric">{item.team_placeholder_rows.toLocaleString()}</td>
                    <td>
                      <strong>{item.identity_status === "source_name_and_team_only" ? "Name + team only" : "Mixed identity fields"}</strong>
                      <small>{item.rows_with_stable_athlete_id.toLocaleString()} stable athlete IDs</small>
                      <small>{item.fields.length ? item.fields.join(" · ") : "No stat fields observed"}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}
