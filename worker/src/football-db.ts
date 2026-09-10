/**
 * Football research has its own D1 budget. Keep the legacy fallback so local
 * tests and older deployments remain readable while the new binding rolls out.
 */
export function footballDb(env: Env): D1Database {
  const bindings = env as Env & { FOOTBALL_DB?: D1Database };
  return bindings.FOOTBALL_DB ?? env.DB;
}
