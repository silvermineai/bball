"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type ArchiveMeta = {
  seasons?: number[];
  total?: number;
  game_rows?: number;
  season_rows?: number;
  source?: { fetched_at?: string | null };
};

export default function LiveBasketballPlayerArchiveStatus() {
  const [archive, setArchive] = useState<ArchiveMeta | null>(null);
  const [status, setStatus] = useState<"checking" | "live" | "fallback">("checking");
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setStatus("checking");
    fetch("/api/basketball/research/ncaa-player-box?season=all&meta=1", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("NCAA player archive unavailable");
        return response.json() as Promise<ArchiveMeta>;
      })
      .then((payload) => {
        if (controller.signal.aborted) return;
        setArchive(payload);
        setStatus((payload.game_rows || payload.season_rows || payload.total) ? "live" : "fallback");
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) setStatus("fallback");
      });
    return () => controller.abort();
  }, [retryNonce]);

  return (
    <p className="note" role="status">
      {status === "live" && archive
        ? <>Live NCAA player archive: {(archive.game_rows || archive.total || 0).toLocaleString()} game rows and {(archive.season_rows || 0).toLocaleString()} season summaries across {(archive.seasons || []).length.toLocaleString()} retained seasons{archive.source?.fetched_at ? ` · source receipt ${new Date(archive.source.fetched_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}` : ""}. Source fields remain in the NCAA identity namespace; unavailable values stay unavailable. <Link href="/basketball/ncaa-player-box/">Open the full player archive →</Link>
          </>
        : status === "fallback"
          ? <>The live NCAA player archive is temporarily unavailable; the published player release remains available. <Link href="/basketball/ncaa-player-box/">Open the player archive →</Link> <button className="text-link" type="button" onClick={() => setRetryNonce((value) => value + 1)}>Retry live check</button></>
          : "Checking the live NCAA player archive…"}
    </p>
  );
}
