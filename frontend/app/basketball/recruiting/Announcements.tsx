"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  categoryLabels,
  eventLabels,
  publicationDate,
  recruitingRows,
  sortRecruitingRows,
  type RecruitingSort,
  type RecruitingRelease,
} from "../../_lib/recruiting";
import Recruiting from "./Recruiting";
import { comparisonHref } from "../../_lib/player-comparison";
import { downloadCsv, toCsv } from "../../_lib/csv";
const number = (n: number | null) => (n == null ? "—" : n.toFixed(1));
const percent = (n: number | null) =>
  n == null ? "—" : `${(n * 100).toFixed(1)}%`;
export default function Announcements({ data }: { data: RecruitingRelease }) {
  const [view, setView] = useState("announcements"),
    [team, setTeam] = useState("all"),
    [q, setQ] = useState(""),
    [kind, setKind] = useState("all"),
    [sort, setSort] = useState<RecruitingSort>("latest");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setTeam(params.get("team") || "all");
    setQ(params.get("q") || "");
  }, []);
  const rows = sortRecruitingRows(
    recruitingRows(data).filter(
      (p) =>
        (team === "all" || p.team_id === team) &&
        (kind === "all" ||
          (kind === "availability"
            ? p.timeline.some((e) => e.kind !== "addition")
            : p.category === kind)) &&
        `${p.name} ${p.program.name} ${p.previous_program || ""}`
          .normalize("NFKD")
          .replace(/\p{M}/gu, "")
          .toLowerCase()
          .includes(q.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()),
    ),
    sort,
  );
  return (
    <>
      <div className="recruiting-views" aria-label="Recruiting evidence view">
        <button
          aria-pressed={view === "announcements"}
          onClick={() => setView("announcements")}
        >
          School announcements <span>{data.coverage.players}</span>
        </button>
        <button
          aria-pressed={view === "observations"}
          onClick={() => setView("observations")}
        >
          Roster observations
        </button>
      </div>
      {view === "observations" ? (
        <Recruiting />
      ) : (
        <>
          <div className="strip recruiting-strip">
            <div>
              <strong>{data.coverage.players}</strong>
              <span>Players with announced additions</span>
            </div>
            <div>
              <strong>{data.coverage.programs}</strong>
              <span>Programs in this partial review</span>
            </div>
            <div>
              <strong>{data.coverage.historical_links}</strong>
              <span>Prior college stat profiles linked</span>
            </div>
            <div>
              <strong>{data.coverage.events}</strong>
              <span>Dated school statements</span>
            </div>
          </div>
          <div className="recruiting-scope">
            <span className="eyebrow">Coverage / Selected announcements</span>
            <p>
              {[...data.programs]
                .map((p) => p.name)
                .sort((a, b) => a.localeCompare(b))
                .join(", ")}
              . This is a growing research file; even these programs’ classes
              may be incomplete. An absent player or school means no reviewed
              record here. Additions are not a count of available players.
            </p>
            <small>
              Source review: {publicationDate(data.reviewed_at)} · These
              announcements do not adjust the forecast model.
            </small>
          </div>
          <div className="toolbar recruiting-filters">
            <label className="control">
              <span>PLAYER OR PRIOR PROGRAM</span>
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Try Khamenia, LSU or Kentucky"
              />
            </label>
            <label className="control">
              <span>ANNOUNCING PROGRAM</span>
              <select value={team} onChange={(e) => setTeam(e.target.value)}>
                <option value="all">All reviewed programs</option>
                {!data.programs.some((p) => p.id === team) &&
                  team !== "all" && (
                    <option value={team}>
                      Program {team} · no reviewed records
                    </option>
                  )}
                {[...data.programs]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="control">
              <span>RECORD TYPE</span>
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="all">All additions</option>
                {Object.entries(categoryLabels).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
                <option value="availability">
                  With availability announcement
                </option>
              </select>
            </label>
            <label className="control">
              <span>SORT</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as RecruitingSort)}
              >
                <option value="latest">Latest school publication</option>
                <option value="ppg">Prior points per game</option>
                <option value="mpg">Prior minutes per game</option>
                <option value="name">Player name</option>
              </select>
            </label>
          </div>
          <div className="section-heading recruiting-results">
            <p role="status">
              {rows.length} player{rows.length === 1 ? "" : "s"} ·{" "}
              {sort === "latest"
                ? "Latest school publication first"
                : sort === "ppg"
                  ? "Prior points per game, highest first"
                  : sort === "mpg"
                    ? "Prior minutes per game, highest first"
                    : "Alphabetical by player"}
            </p>
            <div className="button-row">
              <button
                className="button secondary"
                type="button"
                onClick={() =>
                  downloadCsv(
                    "basketball-recruiting-evidence.csv",
                    toCsv(
                      [
                        "Player",
                        "Category",
                        "Announcing program",
                        "Prior program",
                        "Latest status",
                        "Latest publication",
                        "Prior stat team",
                        "Games",
                        "Minutes per game",
                        "Points per game",
                        "Rebounds per game",
                        "Assists per game",
                        "eFG%",
                        "TS%",
                        "3P%",
                        "Free throw rate",
                        "3PA rate",
                        "Turnover rate",
                        "Source title",
                        "Source URL",
                        "Reviewed at",
                      ],
                      rows.map((p) => [
                        p.name,
                        categoryLabels[p.category],
                        p.program.name,
                        p.previous_program,
                        eventLabels[p.latest.kind],
                        p.latest.source.published_on,
                        p.stats?.team,
                        p.stats?.games,
                        p.stats?.mpg,
                        p.stats?.ppg,
                        p.stats?.rpg,
                        p.stats?.apg,
                        p.stats?.efg == null ? null : p.stats.efg * 100,
                        p.stats?.ts == null ? null : p.stats.ts * 100,
                        p.stats?.three_pct == null
                          ? null
                          : p.stats.three_pct * 100,
                        p.stats?.ft_rate == null
                          ? null
                          : p.stats.ft_rate * 100,
                        p.stats?.three_rate == null
                          ? null
                          : p.stats.three_rate * 100,
                        p.stats?.tov_rate == null
                          ? null
                          : p.stats.tov_rate * 100,
                        p.latest.source.title,
                        p.latest.source.url,
                        p.latest.source.checked_at,
                      ]),
                    ),
                  )
                }
              >
                Download CSV ↓
              </button>
              <a href="/data/basketball/recruiting.json" download>
                Evidence JSON ↓
              </a>
            </div>
          </div>
          <div className="recruiting-grid">
            {rows.map((p) => (
              <article className="recruiting-card" key={p.key}>
                <div className="recruiting-card-top">
                  <Link href={`/basketball/programs/${p.team_id}/`}>
                    {p.program.name} ↗
                  </Link>
                  <span>{categoryLabels[p.category]}</span>
                </div>
                <h2>{p.name}</h2>
                <p className="recruiting-origin">
                  From {p.previous_program || "prior program not recorded"}
                </p>
                <div
                  className={`recruiting-state ${p.latest.kind !== "addition" ? "recruiting-unavailable" : ""}`}
                >
                  <span>{eventLabels[p.latest.kind]}</span>
                  <time dateTime={p.latest.source.published_on}>
                    {publicationDate(p.latest.source.published_on)}
                  </time>
                </div>
                <p className="recruiting-eligibility">{p.latest.summary}</p>
                {p.latest.kind === "addition" && (
                  <p className="recruiting-eligibility">
                    School-announced addition for 2026–27. Current eligibility
                    and availability are not verified here.
                  </p>
                )}
                {p.stats ? (
                  <div className="recruiting-history">
                    <span className="eyebrow">
                      2025–26 / {p.stats.team} / {p.stats.games} recorded{" "}
                      {p.stats.games === 1 ? "game" : "games"}
                    </span>
                    <div className="recruiting-metrics">
                      <div>
                        <strong>{number(p.stats.ppg)}</strong>
                        <span>PTS / G</span>
                      </div>
                      <div>
                        <strong>{number(p.stats.rpg)}</strong>
                        <span>REB / G</span>
                      </div>
                      <div>
                        <strong>{number(p.stats.apg)}</strong>
                        <span>AST / G</span>
                      </div>
                      <div>
                        <strong>{number(p.stats.mpg)}</strong>
                        <span>MIN / G</span>
                      </div>
                      <div>
                        <strong>
                          {percent(p.stats.efg)}
                        </strong>
                        <span>eFG%</span>
                      </div>
                      <div>
                        <strong>{percent(p.stats.ts)}</strong>
                        <span>TS%</span>
                      </div>
                      <div>
                        <strong>{percent(p.stats.three_pct)}</strong>
                        <span>3P%</span>
                      </div>
                      <div>
                        <strong>{percent(p.stats.ft_rate)}</strong>
                        <span>FTR</span>
                      </div>
                      <div>
                        <strong>{percent(p.stats.three_rate)}</strong>
                        <span>3PA RATE</span>
                      </div>
                      <div>
                        <strong>{percent(p.stats.tov_rate)}</strong>
                        <span>TO RATE</span>
                      </div>
                    </div>
                    {p.stats.games < 10 && (
                      <small>
                        Limited sample: fewer than 10 recorded games. These
                        averages do not establish a full-season role.
                      </small>
                    )}
                    <Link href={`/basketball/player/?id=${p.stats.id}`}>
                      Historical player file →
                    </Link>
                    <Link href={comparisonHref(p.stats)}>
                      Compare prior production →
                    </Link>
                    {p.stats.incomplete_box_games > 0 && (
                      <small>
                        {p.stats.incomplete_box_games} games have incomplete box
                        fields.
                      </small>
                    )}
                  </div>
                ) : (
                  <div className="recruiting-history recruiting-no-stats">
                    <span className="eyebrow">Historical college stats</span>
                    <p>
                      No reviewed link to a 2025–26 college box-score profile.
                      Prep and international statistics are not included in this
                      file.
                    </p>
                  </div>
                )}
                <details className="recruiting-evidence">
                  <summary>
                    {p.timeline.length === 1
                      ? "Read the school announcement"
                      : `${p.timeline.length} school statements · View history`}
                  </summary>
                  <ol>
                    {p.timeline.map((e) => (
                      <li key={e.id}>
                        <time dateTime={e.source.published_on}>
                          {publicationDate(e.source.published_on)}
                        </time>
                        <strong>{eventLabels[e.kind]}</strong>
                        <p>{e.summary}</p>
                        <a href={e.source.url}>{e.source.title} ↗</a>
                        <small>
                          {e.source.publisher} · Reviewed{" "}
                          {publicationDate(e.source.checked_at)}
                        </small>
                        {e.source.review_note && (
                          <p className="note">
                            Review note: {e.source.review_note}
                          </p>
                        )}
                      </li>
                    ))}
                  </ol>
                </details>
              </article>
            ))}
          </div>
          {!rows.length && (
            <div className="empty">
              <p>
                No reviewed announcements match these filters. This does not
                establish that the program has no additions.
              </p>
              <button
                className="button secondary"
                onClick={() => {
                  setTeam("all");
                  setQ("");
                  setKind("all");
                }}
              >
                Clear filters
              </button>
            </div>
          )}
          <section className="section paper-panel">
            <h2>Every record has a paper trail.</h2>
            <p>{data.methodology}</p>
            <p>
              Dates above are the publisher’s calendar dates, not when a player
              signed or entered the portal. Our review timestamps show when we
              checked the sources; older articles were collected
              retrospectively. Later school statements remain alongside the
              original addition. A planned redshirt is a school statement, not
              an eligibility ruling.
            </p>
            <p>
              Historical stats come from{" "}
              <a href={data.stats_source.url}>
                SportsDataverse’s attributed bulk releases
              </a>{" "}
              ({data.stats_source.license}). Links require a reviewed match of
              the full player name and the school-announced prior program.
              College production describes past appearances; it does not project
              a player’s role at a new school. Announcement records contain our
              brief factual summaries and links to the school’s reporting.
            </p>
            <p>
              <Link href="/basketball/model/">
                How the forecast model works →
              </Link>
            </p>
          </section>
        </>
      )}
    </>
  );
}
