import { sampleGames, samplePlayers, sampleShots, sampleSummary, sampleTeams } from "@/lib/sampleData";
import { sourceSportCode } from "@/lib/sports";
import type { GameListItem, PlayerSummary, Shot } from "@/types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";
const LOCAL_RUNNER_BASE = import.meta.env.VITE_LOCAL_RUNNER_URL ?? "http://127.0.0.1:8790";
type CurrentUser = { id: number; email: string; createdAt?: string; isAdmin?: boolean };

async function request<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { credentials: "include" });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

async function requestOrLoad<T>(path: string, fallbackLoader: () => Promise<T>): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { credentials: "include" });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return (await res.json()) as T;
  } catch {
    return fallbackLoader();
  }
}

async function loadSampleGame() {
  try {
    const res = await fetch("/sample-game-6422772.json");
    if (!res.ok) throw new Error("sample fixture unavailable");
    return await res.json();
  } catch {
    return {
      game: sampleGames[0],
      playerStats: [],
      shots: sampleShots,
      actions: [],
    };
  }
}

async function loadSamplePlayer(playerId: string) {
  const game = await loadSampleGame();
  const playerStats = game.playerStats ?? [];
  const stat = playerStats.find((row: { ncaa_player_id: number }) => String(row.ncaa_player_id) === playerId);
  const shots = (game.shots ?? []).filter((shot: Shot) => String(shot.playerId) === playerId);
  const summary: PlayerSummary | null = stat
    ? {
        games: 1,
        ppg: stat.points,
        rpg: stat.total_rebounds,
        apg: stat.assists,
        fgm: stat.fgm,
        fga: stat.fga,
        threeFgm: stat.three_fgm,
        threeFga: stat.three_fga,
        ftm: stat.ftm,
        fta: stat.fta,
        turnovers: stat.turnovers,
        steals: stat.steals,
        blocks: stat.blocks,
      }
    : sampleSummary;
  return {
    player: stat
      ? { id: stat.ncaa_player_id, name: stat.player_name, teamName: stat.team_name, games: 1, ppg: stat.points, isFavorite: false }
      : (samplePlayers.find((player) => String(player.id) === playerId) ?? samplePlayers[0]),
    summary,
    gameLog: [game.game as GameListItem],
    shots,
  };
}

function filterBySport<T extends { sportCode?: string }>(rows: T[], sport: string) {
  return rows.filter((row) => (row.sportCode ?? "MBB") === sourceSportCode(sport));
}

export const api = {
  me: () =>
    fetch(`${API_BASE}/auth/me`, { credentials: "include" }).then(async (res) => {
      if (!res.ok) throw new Error("Could not load session");
      return (await res.json()) as { user: CurrentUser | null };
    }),
  login: (body: { email: string; password: string }) =>
    fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(async (res) => {
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Could not sign in");
      return data as { user: CurrentUser };
    }),
  register: (body: { email: string; password: string }) =>
    fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(async (res) => {
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Could not create account");
      return data as { user: CurrentUser };
    }),
  logout: () =>
    fetch(`${API_BASE}/auth/logout`, { method: "POST", credentials: "include" }).then(async (res) => {
      if (!res.ok) throw new Error("Could not sign out");
      return res.json();
    }),
  favorites: () =>
    fetch(`${API_BASE}/favorites`, { credentials: "include" }).then(async (res) => {
      if (!res.ok) throw new Error("Could not load favorites");
      return (await res.json()) as {
        teams: Array<{ id: number; name: string; record?: string; games?: number; favoritedAt?: string }>;
        players: Array<{ id: number; name: string; teamName?: string; ppg?: number; favoritedAt?: string }>;
      };
    }),
  setFavorite: (type: "team" | "player", id: string | number, isFavorite: boolean) =>
    fetch(`${API_BASE}/favorites/${type}/${id}`, {
      method: isFavorite ? "POST" : "DELETE",
      credentials: "include",
    }).then(async (res) => {
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Could not update favorite");
      return data as { ok: true; type: "team" | "player"; id: number; isFavorite: boolean };
    }),
  adminSummary: () =>
    fetch(`${API_BASE}/admin/summary`, { credentials: "include" }).then(async (res) => {
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Could not load admin summary");
      return data as {
        divisions: Array<{ division: string; teams: number; teamGames: number }>;
        statuses: Array<{ status: string; games: number }>;
        logs: number;
        jobs: number;
      };
    }),
  adminGames: (params: { page: number; pageSize: number; division?: string; status?: string; sport?: string }) => {
    const query = new URLSearchParams({ page: String(params.page), pageSize: String(params.pageSize) });
    if (params.division) query.set("division", params.division);
    if (params.status) query.set("status", params.status);
    if (params.sport) query.set("sport", params.sport);
    return fetch(`${API_BASE}/admin/games?${query}`, { credentials: "include" }).then(async (res) => {
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Could not load games");
      return data as { rows: Array<Record<string, unknown>>; page: number; pageSize: number; total: number };
    });
  },
  adminScrapeLogs: (params: { page: number; pageSize: number }) =>
    fetch(`${API_BASE}/admin/scrape-logs?page=${params.page}&pageSize=${params.pageSize}`, { credentials: "include" }).then(async (res) => {
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Could not load scrape logs");
      return data as { rows: Array<Record<string, unknown>>; page: number; pageSize: number; total: number };
    }),
  adminScrapeJobs: (params: { page: number; pageSize: number; status?: string }) => {
    const query = new URLSearchParams({ page: String(params.page), pageSize: String(params.pageSize) });
    if (params.status) query.set("status", params.status);
    return fetch(`${API_BASE}/admin/scrape-jobs?${query}`, { credentials: "include" }).then(async (res) => {
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Could not load scrape jobs");
      return data as { rows: Array<Record<string, unknown>>; page: number; pageSize: number; total: number };
    });
  },
  createAdminScrapeJob: (body: {
    mode: "backfill" | "seed-team" | "scrape-pending" | "scrape-game" | "sample-sports";
    sport: string;
    teamId: number;
    maxTeams: number;
    limit: number;
    contestId: number;
    season: string;
    division: string;
  }) =>
    fetch(`${API_BASE}/admin/scrape-jobs`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(async (res) => {
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Could not queue cloud scrape job");
      return data as { job: Record<string, unknown> };
    }),
  adminIngestKeys: () =>
    fetch(`${API_BASE}/admin/ingest-keys`, { credentials: "include" }).then(async (res) => {
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Could not load ingest keys");
      return data as { keys: Array<Record<string, unknown>> };
    }),
  createAdminIngestKey: (name: string) =>
    fetch(`${API_BASE}/admin/ingest-keys`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).then(async (res) => {
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Could not create ingest key");
      return data as { key: Record<string, unknown>; token: string };
    }),
  revokeAdminIngestKey: (id: string | number) =>
    fetch(`${API_BASE}/admin/ingest-keys/${id}`, { method: "DELETE", credentials: "include" }).then(async (res) => {
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Could not revoke ingest key");
      return data as { ok: true };
    }),
  dashboard: async (sport = "s_mbb") => {
    const [teams, games, players] = await Promise.all([api.teams("", sport), api.games(sport), api.players("", sport)]);
    return { teams: teams.teams, games: games.games, players: players.players };
  },
  teams: (q = "", sport = "s_mbb") =>
    request(`/teams?q=${encodeURIComponent(q)}&sport=${encodeURIComponent(sport)}`, { teams: filterBySport(sampleTeams, sport) }),
  team: (id: string) =>
    request(`/teams/${id}`, {
      team: sampleTeams.find((team) => String(team.id) === id) ?? sampleTeams[0],
      games: sampleGames,
      players: samplePlayers,
      shots: sampleShots,
    }),
  games: (sport = "s_mbb") => request(`/games?sport=${encodeURIComponent(sport)}`, { games: filterBySport(sampleGames, sport) }),
  game: (id: string) => requestOrLoad(`/games/${id}`, loadSampleGame),
  players: (q = "", sport = "s_mbb") =>
    request(`/players?q=${encodeURIComponent(q)}&sport=${encodeURIComponent(sport)}`, { players: filterBySport(samplePlayers, sport) }),
  player: (id: string, search = "") => requestOrLoad(`/players/${id}${search}`, () => loadSamplePlayer(id)),
  backfillStatus: () =>
    fetch(`${LOCAL_RUNNER_BASE}/backfill/status`).then((res) => {
      if (!res.ok) throw new Error("Local runner unavailable");
      return res.json();
    }),
  backfillLogs: () =>
    fetch(`${LOCAL_RUNNER_BASE}/backfill/logs`).then((res) => {
      if (!res.ok) throw new Error("Local runner unavailable");
      return res.text();
    }),
  startBackfill: (body: { teamId: number; maxTeams: number; limit: number }) =>
    fetch(`${LOCAL_RUNNER_BASE}/backfill/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(async (res) => {
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Could not start backfill");
      return res.json();
    }),
  runnerJobs: (page = 1, pageSize = 25) =>
    fetch(`${LOCAL_RUNNER_BASE}/jobs?page=${page}&pageSize=${pageSize}`).then(async (res) => {
      if (!res.ok) throw new Error("Local runner unavailable");
      return res.json() as Promise<{ rows: Array<Record<string, unknown>>; page: number; pageSize: number; total: number }>;
    }),
  runnerScrapeLogs: (page = 1, pageSize = 25) =>
    fetch(`${LOCAL_RUNNER_BASE}/scrape-logs?page=${page}&pageSize=${pageSize}`).then(async (res) => {
      if (!res.ok) throw new Error("Local runner unavailable");
      return res.json() as Promise<{ rows: Array<Record<string, unknown>>; page: number; pageSize: number; total: number }>;
    }),
  startScrapeJob: (body: {
    mode: "backfill" | "seed-team" | "scrape-pending" | "scrape-game" | "sample-sports";
    sport: string;
    teamId: number;
    maxTeams: number;
    limit: number;
    contestId: number;
    season: string;
    division: string;
  }) =>
    fetch(`${LOCAL_RUNNER_BASE}/jobs/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, sport: sourceSportCode(body.sport) }),
    }).then(async (res) => {
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Could not start scrape job");
      return res.json();
    }),
};
