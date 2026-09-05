"use client";
import { useEffect, useState } from "react";
export function useBasketballRelease<T>(name: string) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    const c = new AbortController();
    setData(null);
    setError("");
    fetch(`/data/basketball/${name}.json`, { signal: c.signal })
      .then((r) => {
        if (!r.ok)
          throw Error("The published data could not be loaded. Please reload.");
        return r.json();
      })
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => c.abort();
  }, [name]);
  return { data, error };
}
