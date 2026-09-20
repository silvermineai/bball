export type FootballRecruitingTeam = {
  team_id: string;
  team: string;
  talent_composite: number | null;
  talent_rank: number | null;
  blue_chip_ratio: number | null;
  n_recruits: number | null;
  off_returning: number | null;
  def_returning: number | null;
  overall_returning: number | null;
  n_returning: number | null;
  returning_estimated: boolean | null;
};

type ApiPage = {
  total?: unknown;
  rows?: unknown;
};

const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;

function number(value: unknown) {
  return finite(value);
}

function teamId(value: unknown) {
  return typeof value === "string" && /^\d{1,15}$/.test(value) ? value : null;
}

function parseRows(payload: unknown) {
  if (!payload || typeof payload !== "object") return [];
  const rows = (payload as ApiPage).rows;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((value): FootballRecruitingTeam[] => {
    if (!value || typeof value !== "object") return [];
    const row = value as Record<string, unknown>;
    const id = teamId(row.team_id);
    if (!id) return [];
    return [{
      team_id: id,
      team: typeof row.team === "string" && row.team.trim() ? row.team : id,
      talent_composite: number(row.talent_composite),
      talent_rank: number(row.talent_rank),
      blue_chip_ratio: number(row.blue_chip_ratio),
      n_recruits: number(row.n_recruits),
      off_returning: number(row.off_returning),
      def_returning: number(row.def_returning),
      overall_returning: number(row.overall_returning),
      n_returning: number(row.n_returning),
      returning_estimated: row.is_estimated == null ? null : Boolean(row.is_estimated),
    }];
  });
}

/** Parse the two exact-team-ID personnel views without guessing by name. */
export function mergeFootballRecruitingContext(talentPayload: unknown, returningPayload: unknown): Map<string, FootballRecruitingTeam> {
  const merged = new Map<string, FootballRecruitingTeam>();
  for (const row of parseRows(talentPayload)) merged.set(row.team_id, row);
  for (const row of parseRows(returningPayload)) {
    const existing = merged.get(row.team_id);
    if (!existing) {
      merged.set(row.team_id, row);
      continue;
    }
    const combined: FootballRecruitingTeam = {
      ...existing,
      talent_composite: row.talent_composite ?? existing.talent_composite,
      talent_rank: row.talent_rank ?? existing.talent_rank,
      blue_chip_ratio: row.blue_chip_ratio ?? existing.blue_chip_ratio,
      n_recruits: row.n_recruits ?? existing.n_recruits,
      off_returning: row.off_returning ?? existing.off_returning,
      def_returning: row.def_returning ?? existing.def_returning,
      overall_returning: row.overall_returning ?? existing.overall_returning,
      n_returning: row.n_returning ?? existing.n_returning,
      returning_estimated: row.returning_estimated ?? existing.returning_estimated,
    };
    merged.set(row.team_id, combined);
  }
  return merged;
}

/** Keep API pagination bounded and reject malformed pages instead of showing partial personnel context as complete. */
export async function loadFootballRecruitingContext(signal?: AbortSignal, season = 2026): Promise<Map<string, FootballRecruitingTeam>> {
  const load = async (view: "talent" | "returning") => {
    const firstResponse = await fetch(`/api/football/recruiting?view=${view}&season=${season}&page=0&limit=100`, { signal });
    if (!firstResponse.ok) throw new Error("Football recruiting context unavailable.");
    const first = await firstResponse.json() as ApiPage;
    const total = typeof first.total === "number" && Number.isInteger(first.total) && first.total >= 0 ? first.total : null;
    if (total == null) throw new Error("Football recruiting context returned invalid pagination.");
    const pages = Math.ceil(total / 100);
    if (pages > 20) throw new Error("Football recruiting context exceeds the bounded page window.");
    const rest = await Promise.all(Array.from({ length: Math.max(0, pages - 1) }, (_, index) =>
      fetch(`/api/football/recruiting?view=${view}&season=${season}&page=${index + 1}&limit=100`, { signal }).then((response) => {
        if (!response.ok) throw new Error("Football recruiting context unavailable.");
        return response.json() as Promise<ApiPage>;
      }),
    ));
    const payloads = [first, ...rest];
    const rows = payloads.flatMap(parseRows);
    if (rows.length > total) throw new Error("Football recruiting context changed during pagination.");
    return rows;
  };
  const [talent, returning] = await Promise.all([load("talent"), load("returning")]);
  return mergeFootballRecruitingContext({ rows: talent }, { rows: returning });
}
