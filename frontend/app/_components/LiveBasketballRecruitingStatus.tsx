"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { date } from "../_lib/format";

type RecruitingEdition = {
  reviewed_at?: string;
  first_recorded_at?: string;
  coverage?: {
    players?: number;
    programs?: number;
    events?: number;
  };
};

export default function LiveBasketballRecruitingStatus() {
  const [edition, setEdition] = useState<RecruitingEdition | null>(null);
  const [status, setStatus] = useState<"checking" | "live" | "fallback">("checking");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/basketball/research/recruiting?season=2027", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("live recruiting edition unavailable");
        return response.json() as Promise<RecruitingEdition>;
      })
      .then((payload) => {
        if (!controller.signal.aborted) {
          setEdition(payload);
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
      {status === "live" && edition
        ? <>
            Live D1 recruiting edition: {(edition.coverage?.players || 0).toLocaleString()} announced additions across {(edition.coverage?.programs || 0).toLocaleString()} reviewed programs · {edition.coverage?.events?.toLocaleString() || "—"} source events{edition.reviewed_at ? ` · reviewed ${date(edition.reviewed_at)}` : ""}{edition.first_recorded_at ? ` · recorded ${date(edition.first_recorded_at)}` : ""}. <Link href="/basketball/recruiting/">Open the evidence board →</Link>
          </>
        : status === "fallback"
          ? <>Live recruiting edition unavailable; the published landing-page coverage remains available. <Link href="/basketball/recruiting/">Open the recruiting board →</Link></>
          : "Checking the live recruiting edition…"}
    </p>
  );
}
