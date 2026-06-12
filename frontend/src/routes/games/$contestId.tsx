import { MetricCard } from "@/components/MetricCard";
import { ShotChart } from "@/components/ShotChart";
import { SortableTable } from "@/components/SortableTable";
import { api } from "@/lib/api";
import type { PlayerGameStat, PlayByPlayAction, Shot } from "@/types";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Pause, Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export const Route = createFileRoute("/games/$contestId")({
  component: GameDetailPage,
});

function GameDetailPage() {
  const { contestId } = Route.useParams();
  const [playerFilter, setPlayerFilter] = useState("all");
  const [colorByTeam, setColorByTeam] = useState(false);
  const [courtView, setCourtView] = useState<"full" | "split-half">("full");
  const [currentElapsed, setCurrentElapsed] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const { data } = useQuery({ queryKey: ["game", contestId], queryFn: () => api.game(contestId) });
  const game = data?.game;
  const shots = (data?.shots ?? []) as Shot[];
  const playerStats = (data?.playerStats ?? []) as PlayerGameStat[];
  const actions = (data?.actions ?? []) as PlayByPlayAction[];
  const isBasketball = game?.sportId === "s_mbb" || game?.sportId === "s_wbb" || game?.sportCode === "MBB" || game?.sportCode === "WBB" || (!game?.sportCode && shots.length > 0);
  const gameDuration = useMemo(() => gameClockDuration(shots, actions), [shots, actions]);
  const currentLabel = elapsedToGameClock(currentElapsed);
  const filteredShots = useMemo(() => {
    const playerShots = playerFilter === "all" ? shots : shots.filter((shot) => String(shot.playerId) === playerFilter);
    return playerShots.filter((shot) => shotElapsedSeconds(shot) <= currentElapsed);
  }, [currentElapsed, playerFilter, shots]);

  useEffect(() => {
    setCurrentElapsed(gameDuration);
    setIsPlaying(false);
  }, [contestId, gameDuration]);

  useEffect(() => {
    if (!isPlaying) return;
    const id = window.setInterval(() => {
      setCurrentElapsed((value) => {
        const next = Math.min(value + 12, gameDuration);
        if (next >= gameDuration) {
          setIsPlaying(false);
        }
        return next;
      });
    }, 70);
    return () => window.clearInterval(id);
  }, [gameDuration, isPlaying]);

  const statColumns = useMemo<ColumnDef<PlayerGameStat>[]>(
    () => playerStatColumns(playerStats),
    [playerStats],
  );
  const actionColumns = useMemo<ColumnDef<PlayByPlayAction>[]>(
    () => [
      { accessorKey: "period", header: "P" },
      { accessorKey: "clock", header: "Clock" },
      { accessorKey: "teamName", header: "Team" },
      { accessorKey: "playerName", header: "Player" },
      { accessorKey: "description", header: "Action" },
      { accessorKey: "awayScore", header: "Away" },
      { accessorKey: "homeScore", header: "Home" },
    ],
    [],
  );

  return (
    <div className="space-y-5">
      <section className="rounded-md border border-line bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold uppercase tracking-[0.18em] text-court">Game {game?.id ?? contestId}</div>
        <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">{game?.awayTeam} at {game?.homeTeam}</h1>
            <p className="mt-2 text-graphite">{game?.venue ?? "Venue TBA"} · {game?.date ?? "Date TBA"}</p>
          </div>
          <div className="text-4xl font-semibold">{game?.awayScore ?? "-"}-{game?.homeScore ?? "-"}</div>
        </div>
      </section>
      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Shots" value={shots.length} />
        <MetricCard label="Player Rows" value={playerStats.length} />
        <MetricCard label="Actions" value={actions.length} />
      </section>
      <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-5">
          {isBasketball ? (
            <div className="rounded-md border border-line bg-white p-4 shadow-sm">
              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-court">Shot Filter</label>
              <select className="mt-2 w-full rounded-md border-line" value={playerFilter} onChange={(event) => setPlayerFilter(event.target.value)}>
                <option value="all">All players</option>
                {playerStats.map((player) => (
                  <option key={player.playerId ?? player.ncaa_player_id} value={player.playerId ?? player.ncaa_player_id}>{player.player_name}</option>
                ))}
              </select>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm font-medium text-graphite">
                  <input
                    type="checkbox"
                    className="rounded border-line text-court focus:ring-court"
                    checked={colorByTeam}
                    onChange={(event) => setColorByTeam(event.target.checked)}
                  />
                  Show by team
                </label>
                <div className="grid grid-cols-2 rounded-md border border-line bg-paper p-1 text-sm font-semibold">
                  <button
                    className={`rounded px-3 py-1.5 ${courtView === "full" ? "bg-white text-ink shadow-sm" : "text-graphite"}`}
                    onClick={() => setCourtView("full")}
                  >
                    Full court
                  </button>
                  <button
                    className={`rounded px-3 py-1.5 ${courtView === "split-half" ? "bg-white text-ink shadow-sm" : "text-graphite"}`}
                    onClick={() => setCourtView("split-half")}
                  >
                    Half court
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          {isBasketball ? (
            <GameFlowControls
              actions={actions}
              awayTeam={game?.awayTeam}
              currentElapsed={currentElapsed}
              duration={gameDuration}
              homeTeam={game?.homeTeam}
              isPlaying={isPlaying}
              onPlayToggle={() => {
                if (currentElapsed >= gameDuration) {
                  setCurrentElapsed(0);
                  setIsPlaying(true);
                  return;
                }
                setIsPlaying((value) => !value);
              }}
              onTimeChange={setCurrentElapsed}
            />
          ) : null}
          {isBasketball ? (
            <ShotChart
              shots={filteredShots}
              title={`Game Shot Chart · ${currentLabel}`}
              colorByTeam={colorByTeam}
              courtView={courtView}
              homeTeam={game?.homeTeam}
              awayTeam={game?.awayTeam}
            />
          ) : (
            <section className="rounded-md border border-line bg-white p-5 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-court">{game?.sportId ?? "Sport"}</div>
              <h2 className="mt-1 text-lg font-semibold">Game Events</h2>
              <p className="mt-2 text-sm leading-6 text-graphite">
                This sport is shown through the box score and play-by-play tables. Court shot charts are only rendered for basketball games.
              </p>
            </section>
          )}
        </div>
        <div>
          <h2 className="mb-3 text-lg font-semibold">Player Box</h2>
          <SortableTable data={playerStats} columns={statColumns} />
        </div>
      </section>
      <section>
        <h2 className="mb-3 text-lg font-semibold">Play By Play</h2>
        <SortableTable data={actions} columns={actionColumns} />
      </section>
    </div>
  );
}

function playerStatColumns(rows: PlayerGameStat[]): ColumnDef<PlayerGameStat>[] {
  const statKeys = Array.from(
    new Set(rows.flatMap((row) => Object.keys(parseStatJson(row)))),
  );
  return [
    {
      accessorKey: "player_name",
      header: "Player",
      cell: ({ row }) => (
        <Link className="font-semibold text-ink hover:text-court" to="/players/$playerId" params={{ playerId: String(row.original.playerId ?? row.original.ncaa_player_id) }}>
          {row.original.player_name}
        </Link>
      ),
    },
    { accessorKey: "team_name", header: "Team" },
    {
      id: "statGroup",
      header: "Group",
      accessorFn: (row) => row.statGroup ?? row.stat_group ?? "box",
    },
    { accessorKey: "position", header: "Pos" },
    ...statKeys.map((key) => ({
      id: `stat-${key}`,
      header: statLabel(key),
      accessorFn: (row: PlayerGameStat) => parseStatJson(row)[key] ?? "",
    })),
  ];
}

function parseStatJson(row: PlayerGameStat): Record<string, string | number> {
  const raw = row.statsJson ?? row.stats_json;
  if (!raw) {
    return {
      ...(row.minutes ? { minutes: row.minutes } : {}),
      ...(row.points != null ? { points: row.points } : {}),
      ...(row.total_rebounds != null ? { total_rebounds: row.total_rebounds } : {}),
      ...(row.assists != null ? { assists: row.assists } : {}),
      ...(row.fga != null ? { fga: row.fga } : {}),
      ...(row.three_fga != null ? { three_fga: row.three_fga } : {}),
    };
  }
  try {
    return JSON.parse(raw) as Record<string, string | number>;
  } catch {
    return {};
  }
}

function statLabel(key: string) {
  const labels: Record<string, string> = {
    three_fgm: "3FG",
    three_fga: "3FGA",
    fg_pct: "FG%",
    ftm: "FT",
    total_rebounds: "REB",
    offensive_rebounds: "OREB",
    defensive_rebounds: "DREB",
    technical_fouls: "Tech",
    goalie_minutes: "Goalie Min",
    ab: "AB",
    ba: "BA",
    bb: "BB",
    bf: "BF",
    cs: "CS",
    er: "ER",
    era: "ERA",
    h: "H",
    hb: "HB",
    hbp: "HBP",
    hr: "HR",
    hra: "HR-A",
    ibb: "IBB",
    ip: "IP",
    k: "K",
    kl: "KL",
    obpct: "OBP",
    ops: "OPS",
    po: "PO",
    r: "R",
    rbi: "RBI",
    sb: "SB",
    sf: "SF",
    sh: "SH",
    slgpct: "SLG",
    so: "SO",
    tb: "TB",
    tc: "TC",
    wp: "WP",
    rushattempts: "Rush Att",
    rushydsgained: "Rush Yds Gained",
    rushydslost: "Rush Yds Lost",
    rushlong: "Rush Long",
    rushtds: "Rush TD",
    passattempts: "Pass Att",
    completions: "Comp",
    passyards: "Pass Yds",
    passtds: "Pass TD",
    passeff: "Pass Eff",
    rec: "Rec",
    receivingyards: "Rec Yds",
    rectd: "Rec TD",
    solotack: "Solo",
    assttack: "Ast Tack",
    pbu: "PBU",
    pdef: "PDef",
    intyds: "INT Yds",
    shatt: "Shots",
    sog: "SOG",
    gaa: "GAA",
    ga: "GA",
  };
  return labels[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function GameFlowControls({
  actions,
  awayTeam,
  currentElapsed,
  duration,
  homeTeam,
  isPlaying,
  onPlayToggle,
  onTimeChange,
}: {
  actions: PlayByPlayAction[];
  awayTeam?: string;
  currentElapsed: number;
  duration: number;
  homeTeam?: string;
  isPlaying: boolean;
  onPlayToggle: () => void;
  onTimeChange: (value: number) => void;
}) {
  const currentLabel = elapsedToGameClock(currentElapsed);
  const scorePoints = useMemo(() => scoreTimelinePoints(actions), [actions]);
  const currentScore = scoreAtElapsed(scorePoints, currentElapsed);

  return (
    <section className="rounded-md border border-line bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-court">Game Flow</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-ink">{currentLabel}</div>
        </div>
        <div className="flex items-center gap-3">
          <button
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-line bg-paper text-ink shadow-sm hover:bg-white"
            onClick={onPlayToggle}
            type="button"
            title={isPlaying ? "Pause game flow" : "Play game flow"}
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <div className="min-w-28 text-right text-sm text-graphite">
            <div className="font-semibold text-ink tabular-nums">{currentScore.away}-{currentScore.home}</div>
            <div>Score</div>
          </div>
        </div>
      </div>
      <input
        aria-label="Game time"
        className="mt-4 w-full accent-court"
        max={duration}
        min={0}
        onChange={(event) => onTimeChange(Number(event.target.value))}
        onInput={(event) => onTimeChange(Number(event.currentTarget.value))}
        step={1}
        type="range"
        value={currentElapsed}
      />
      <ScoreTimeline
        awayTeam={awayTeam}
        currentElapsed={currentElapsed}
        duration={duration}
        homeTeam={homeTeam}
        points={scorePoints}
      />
    </section>
  );
}

function ScoreTimeline({
  awayTeam,
  currentElapsed,
  duration,
  homeTeam,
  points,
}: {
  awayTeam?: string;
  currentElapsed: number;
  duration: number;
  homeTeam?: string;
  points: ScorePoint[];
}) {
  const width = 720;
  const height = 150;
  const padding = { top: 14, right: 18, bottom: 24, left: 28 };
  const maxScore = Math.max(10, ...points.map((point) => Math.max(point.away, point.home)));
  const x = (elapsed: number) => padding.left + (elapsed / duration) * (width - padding.left - padding.right);
  const y = (score: number) => height - padding.bottom - (score / maxScore) * (height - padding.top - padding.bottom);
  const awayLine = points.map((point) => `${x(point.elapsed)},${y(point.away)}`).join(" ");
  const homeLine = points.map((point) => `${x(point.elapsed)},${y(point.home)}`).join(" ");
  const cursorX = x(currentElapsed);

  return (
    <div className="mt-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-36 w-full overflow-visible">
        <line x1={padding.left} x2={width - padding.right} y1={height - padding.bottom} y2={height - padding.bottom} stroke="#d5dbd2" strokeWidth="1" />
        {[0, Math.round(maxScore / 2), maxScore].map((score) => (
          <g key={score}>
            <line x1={padding.left} x2={width - padding.right} y1={y(score)} y2={y(score)} stroke="#eef1ec" strokeWidth="1" />
            <text x={padding.left - 8} y={y(score) + 4} textAnchor="end" className="fill-graphite text-[10px] tabular-nums">{score}</text>
          </g>
        ))}
        <polyline fill="none" points={awayLine} stroke="#315f9d" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
        <polyline fill="none" points={homeLine} stroke="#1f8a62" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
        <line x1={cursorX} x2={cursorX} y1={padding.top} y2={height - padding.bottom} stroke="#18251d" strokeDasharray="4 5" strokeWidth="1.5" />
        <circle cx={cursorX} cy={y(scoreAtElapsed(points, currentElapsed).away)} fill="#315f9d" r="4" />
        <circle cx={cursorX} cy={y(scoreAtElapsed(points, currentElapsed).home)} fill="#1f8a62" r="4" />
      </svg>
      <div className="mt-1 flex items-center justify-between gap-4 text-xs text-graphite">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#315f9d]" /> {awayTeam ?? "Away"}</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-make" /> {homeTeam ?? "Home"}</span>
        </div>
        <div className="tabular-nums">{elapsedToGameClock(currentElapsed)}</div>
      </div>
    </div>
  );
}

type ScorePoint = {
  elapsed: number;
  away: number;
  home: number;
};

function scoreTimelinePoints(actions: PlayByPlayAction[]): ScorePoint[] {
  const points: ScorePoint[] = [{ elapsed: 0, away: 0, home: 0 }];
  for (const action of actions) {
    if (action.awayScore == null || action.homeScore == null) continue;
    points.push({
      elapsed: actionElapsedSeconds(action),
      away: action.awayScore,
      home: action.homeScore,
    });
  }
  return points.sort((a, b) => a.elapsed - b.elapsed);
}

function scoreAtElapsed(points: ScorePoint[], elapsed: number) {
  let score = points[0] ?? { elapsed: 0, away: 0, home: 0 };
  for (const point of points) {
    if (point.elapsed > elapsed) break;
    score = point;
  }
  return score;
}

function gameClockDuration(shots: Shot[], actions: PlayByPlayAction[]) {
  const maxShot = Math.max(0, ...shots.map(shotElapsedSeconds));
  const maxAction = Math.max(0, ...actions.map(actionElapsedSeconds));
  return Math.max(2400, maxShot, maxAction);
}

function shotElapsedSeconds(shot: Shot) {
  return elapsedSeconds(shot.period, shot.clock);
}

function actionElapsedSeconds(action: PlayByPlayAction) {
  return elapsedSeconds(action.period, action.clock);
}

function elapsedSeconds(period?: number, clock?: string) {
  if (!period || !clock) return 0;
  const [minutes = 0, seconds = 0, fraction = 0] = clock.split(":").map((value) => Number(value) || 0);
  const remaining = minutes * 60 + seconds + fraction / 100;
  return Math.max(0, (period - 1) * 1200 + (1200 - remaining));
}

function elapsedToGameClock(elapsed: number) {
  const period = elapsed < 1200 ? 1 : 2;
  const periodElapsed = Math.min(1199.99, elapsed - (period - 1) * 1200);
  const remaining = Math.max(0, 1200 - periodElapsed);
  const minutes = Math.floor(remaining / 60);
  const seconds = Math.floor(remaining % 60);
  return `${period === 1 ? "1st" : "2nd"} ${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
