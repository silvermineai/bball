import { api } from "@/lib/api";
import { MetricCard } from "@/components/MetricCard";
import { SPORTS } from "@/lib/sports";
import { useSelectedSport } from "@/lib/useSelectedSport";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowRight, Database, Star, Target, UsersRound } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

function Dashboard() {
  const [sport, setSport] = useSelectedSport();
  const selectedSport = SPORTS.find((item) => item.code === sport) ?? SPORTS[0];
  const { data } = useQuery({ queryKey: ["dashboard", sport], queryFn: () => api.dashboard(sport) });
  const { data: session } = useQuery({ queryKey: ["auth", "me"], queryFn: api.me });
  const { data: favorites } = useQuery({ queryKey: ["favorites"], queryFn: api.favorites, enabled: Boolean(session?.user) });
  const teams = data?.teams ?? [];
  const games = data?.games ?? [];
  const players = data?.players ?? [];
  const favoriteTeams = favorites?.teams ?? [];
  const favoritePlayers = favorites?.players ?? [];

  return (
    <div className="space-y-6">
      <section className="rounded-md border border-line bg-white p-6 shadow-panel">
        <div className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr] lg:items-end">
          <div>
            <div className="mb-3 inline-flex rounded-md bg-[#eef2ec] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-court">
              {selectedSport.label} 2025-26
            </div>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-ink md:text-5xl">
              A coaching dashboard for turning NCAA game data into decisions.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-graphite">
              Start with teams, drill into a game, then isolate player tendencies by recent form and shot location.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <MetricCard label="Teams" value={teams.length} detail="Loaded or sampled" icon={<UsersRound size={18} />} />
            <MetricCard label="Games" value={games.length} detail="Parsed schedules" icon={<Database size={18} />} />
          </div>
        </div>
      </section>

      <section className="rounded-md border border-line bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-court">Sport</div>
            <h2 className="mt-1 text-xl font-semibold">{selectedSport.label}</h2>
            <p className="mt-1 text-sm text-graphite">{selectedSport.detail}</p>
          </div>
          <div className="grid gap-2 rounded-md border border-line bg-paper p-1 sm:inline-grid sm:grid-flow-col">
            {SPORTS.map((item) => {
              const active = item.code === sport;
              return (
                <button
                  key={item.code}
                  type="button"
                  onClick={() => setSport(item.code)}
                  className={`rounded px-4 py-2 text-left text-sm font-semibold transition sm:text-center ${
                    active ? "bg-white text-ink shadow-sm" : "text-graphite hover:bg-white/70 hover:text-ink"
                  }`}
                  aria-pressed={active}
                >
                  {item.shortLabel}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <Link to="/teams" className="rounded-md border border-line bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-panel">
            <UsersRound className="text-court" />
            <div className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-court">{selectedSport.shortLabel}</div>
            <h3 className="mt-1 text-xl font-semibold">Teams</h3>
            <p className="mt-2 text-sm leading-6 text-graphite">Browse team schedules, player production, and shot profiles.</p>
            <span className="mt-5 flex items-center gap-2 text-sm font-semibold text-court">Open teams <ArrowRight size={15} /></span>
          </Link>
          <Link to="/games" className="rounded-md border border-line bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-panel">
            <Activity className="text-court" />
            <div className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-court">{selectedSport.shortLabel}</div>
            <h3 className="mt-1 text-xl font-semibold">Games</h3>
            <p className="mt-2 text-sm leading-6 text-graphite">Inspect box scores, shot maps, and every play-by-play action.</p>
            <span className="mt-5 flex items-center gap-2 text-sm font-semibold text-court">Open games <ArrowRight size={15} /></span>
          </Link>
          <Link to="/players" className="rounded-md border border-line bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-panel">
            <Target className="text-court" />
            <div className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-court">{selectedSport.shortLabel}</div>
            <h3 className="mt-1 text-xl font-semibold">Players</h3>
            <p className="mt-2 text-sm leading-6 text-graphite">Filter recent games and see where shots came from.</p>
            <span className="mt-5 flex items-center gap-2 text-sm font-semibold text-court">Open players <ArrowRight size={15} /></span>
          </Link>
        </div>
      </section>

      {session?.user ? (
        <section className="rounded-md border border-line bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-court">Favorites</div>
              <h2 className="mt-1 text-lg font-semibold">Saved Teams And Players</h2>
            </div>
            <Star size={18} className="fill-brass text-brass" />
          </div>
          {favoriteTeams.length || favoritePlayers.length ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {favoriteTeams.map((team) => (
                <Link key={`team-${team.id}`} to="/teams/$teamId" params={{ teamId: String(team.id) }} className="rounded-md border border-line p-3 hover:bg-paper">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-court">Team</div>
                  <div className="mt-1 font-semibold">{team.name}</div>
                  <div className="text-sm text-graphite">{team.games ?? 0} scraped games</div>
                </Link>
              ))}
              {favoritePlayers.map((player) => (
                <Link key={`player-${player.id}`} to="/players/$playerId" params={{ playerId: String(player.id) }} className="rounded-md border border-line p-3 hover:bg-paper">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-court">Player</div>
                  <div className="mt-1 font-semibold">{player.name}</div>
                  <div className="text-sm text-graphite">{player.teamName ?? "Team TBD"} · {player.ppg ?? 0} ppg</div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm leading-6 text-graphite">
              Favorite teams and players from their detail pages to keep your scouting targets close.
            </p>
          )}
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-md border border-line bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Recent {selectedSport.shortLabel} Games</h2>
          <div className="mt-4 space-y-3">
            {games.map((game) => (
              <Link key={game.id} to="/games/$contestId" params={{ contestId: String(game.id) }} className="flex items-center justify-between rounded-md border border-line p-3 hover:bg-paper">
                <div>
                  <div className="font-medium">{game.awayTeam} at {game.homeTeam}</div>
                  <div className="text-sm text-graphite">{game.venue ?? "Venue TBA"}</div>
                </div>
                <div className="text-right font-semibold">{game.awayScore}-{game.homeScore}</div>
              </Link>
            ))}
          </div>
        </div>
        <div className="rounded-md border border-line bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">{selectedSport.shortLabel} Players To Scout</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {players.slice(0, 4).map((player) => (
              <Link key={player.id} to="/players/$playerId" params={{ playerId: String(player.id) }} className="rounded-md border border-line p-3 hover:bg-paper">
                <div className="font-semibold">{player.name}</div>
                <div className="text-sm text-graphite">{player.teamName} · {player.position}</div>
                <div className="mt-3 text-2xl font-semibold">{player.ppg ?? 0}<span className="text-sm font-normal text-graphite"> ppg</span></div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
