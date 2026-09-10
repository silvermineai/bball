/**
 * Basketball research lives in its own D1 so scheduled refreshes cannot be
 * blocked by the legacy football/scouting store reaching its size ceiling.
 * Tests and older local environments only provide DB, so keep the fallback.
 */
export function researchDb(env: Env): D1Database {
  const bindings = env as Env & { RESEARCH_DB?: D1Database };
  return bindings.RESEARCH_DB ?? env.DB;
}

/**
 * NCAA game rows are the largest research table. Keep them on their own D1
 * budget while falling back to the research database for tests and older
 * deployments that do not have the optional binding yet.
 */
export function ncaaBoxDb(env: Env): D1Database {
  const bindings = env as Env & { NCAA_BOX_DB?: D1Database };
  return bindings.NCAA_BOX_DB ?? researchDb(env);
}
