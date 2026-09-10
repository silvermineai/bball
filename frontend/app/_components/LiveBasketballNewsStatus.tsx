"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { date } from "../_lib/format";

type NewsMeta = {
  summary?: {
    total?: number;
    latest_published?: string | null;
    latest_seen_at?: string | null;
  };
};

export default function LiveBasketballNewsStatus() {
  const [meta, setMeta] = useState<NewsMeta | null>(null);
  const [status, setStatus] = useState<"checking" | "live" | "fallback">("checking");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/basketball/research/news?sport=mens-college-basketball&meta=1", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("live publisher wire unavailable");
        return response.json() as Promise<NewsMeta>;
      })
      .then((payload) => {
        if (!controller.signal.aborted) {
          setMeta(payload);
          setStatus("live");
        }
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) setStatus("fallback");
      });
    return () => controller.abort();
  }, []);

  return (
    <p className="note" role="status">
      {status === "live" && meta
        ? <>Live D1 publisher wire: {(meta.summary?.total || 0).toLocaleString()} retained headlines{meta.summary?.latest_published ? ` · latest publisher date ${date(meta.summary.latest_published)}` : ""}{meta.summary?.latest_seen_at ? ` · archived ${date(meta.summary.latest_seen_at)}` : ""}. <Link href="/basketball/news/">Open the searchable news archive →</Link></>
        : status === "fallback"
          ? <>Live publisher wire unavailable; the bundled headline release remains visible. <Link href="/basketball/news/">Open the news archive →</Link></>
          : "Checking the live publisher wire…"}
    </p>
  );
}
