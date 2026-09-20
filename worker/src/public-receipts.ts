/**
 * Public research responses retain the release clock and digest, but never
 * expose the private retrieval locator or provider attribution payload.
 * Validation happens before this helper is called; this only shapes output.
 */
export function publicReceipt<T extends Record<string, unknown>>(receipt: T): Omit<T, "url" | "attribution"> {
  const { url: _url, attribution: _attribution, ...safe } = receipt;
  return safe;
}
