/**
 * Basketball research lives in its own D1 so scheduled refreshes cannot be
 * blocked by the legacy football/scouting store reaching its size ceiling.
 * Tests and older local environments only provide DB, so keep the fallback.
 */
export function researchDb(env: Env): D1Database {
  const bindings = env as Env & { RESEARCH_DB?: D1Database };
  return bindings.RESEARCH_DB ?? env.DB;
}
