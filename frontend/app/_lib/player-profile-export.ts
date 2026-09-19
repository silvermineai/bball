export type PlayerProfileExportIdentity = {
  season: number;
  id: string;
  team_id?: string | null;
};

export type PlayerProfileExportPage<T extends PlayerProfileExportIdentity> = {
  season: number | "all";
  page: number;
  page_size: number;
  total: number;
  rows: T[];
};

/**
 * Validate one page of a player-profile export against the first response.
 * The archive is paginated, so a successful HTTP response alone does not prove
 * that a page belongs to the same cohort or that it contains any rows.
 */
export function validatePlayerProfileExportPage<T extends PlayerProfileExportIdentity>(
  payload: PlayerProfileExportPage<T>,
  expectedSeason: string,
  expectedTotal: number,
  expectedPageSize: number,
  page: number,
  totalPages: number,
) {
  if (
    String(payload.season) !== expectedSeason
    || Number(payload.page) !== page
    || !Number.isInteger(Number(payload.total))
    || Number(payload.total) !== expectedTotal
    || !Number.isInteger(Number(payload.page_size))
    || Number(payload.page_size) !== expectedPageSize
    || !Array.isArray(payload.rows)
    || payload.rows.length > expectedPageSize
  ) {
    throw new Error("The player profile release changed during export.");
  }
  if (page < totalPages - 1 && payload.rows.length === 0) {
    throw new Error("The player profile release returned an incomplete page.");
  }
  const identities = new Set(
    payload.rows.map((row) => `${row.season}:${row.id}:${row.team_id || ""}`),
  );
  if (identities.size !== payload.rows.length) {
    throw new Error("The player profile release returned duplicate rows.");
  }
  return payload.rows;
}

/** Verify the concatenated pages still cover the cohort advertised by page one. */
export function validateCompletePlayerProfileExport<T extends PlayerProfileExportIdentity>(
  rows: readonly T[],
  expectedTotal: number,
) {
  if (rows.length !== expectedTotal) {
    throw new Error("The player profile release returned an incomplete export.");
  }
  const identities = new Set(
    rows.map((row) => `${row.season}:${row.id}:${row.team_id || ""}`),
  );
  if (identities.size !== rows.length) {
    throw new Error("The player profile release returned duplicate rows.");
  }
  return rows;
}
