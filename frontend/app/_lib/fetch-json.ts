export type FetchJsonOptions = {
  signal?: AbortSignal;
  attempts?: number;
  delayMs?: number;
};

const retryable = (status: number) => status === 429 || status >= 500;

function wait(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("The request was aborted.", "AbortError"));
      return;
    }
    let onAbort: (() => void) | undefined;
    const cleanup = () => {
      if (onAbort) signal?.removeEventListener("abort", onAbort);
    };
    const timer = globalThis.setTimeout(() => {
      cleanup();
      resolve();
    }, milliseconds);
    onAbort = () => {
      globalThis.clearTimeout(timer);
      cleanup();
      reject(new DOMException("The request was aborted.", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Fetch JSON while giving transient edge/provider failures one bounded retry. */
export async function fetchJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const attempts = Math.max(1, Math.min(3, options.attempts ?? 2));
  const delayMs = Math.max(0, Math.min(2000, options.delayMs ?? 350));
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { signal: options.signal });
      if (response.ok) return await response.json() as T;
      lastError = new Error(`Request failed (${response.status})`);
      if (!retryable(response.status) || attempt === attempts - 1) break;
    } catch (error: unknown) {
      if ((error as { name?: string })?.name === "AbortError") throw error;
      lastError = error;
      if (attempt === attempts - 1) break;
    }
    await wait(delayMs, options.signal);
  }
  throw lastError instanceof Error ? lastError : new Error("Request failed");
}
