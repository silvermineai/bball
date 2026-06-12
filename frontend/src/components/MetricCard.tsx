import type { ReactNode } from "react";

export function MetricCard({ label, value, detail, icon }: { label: string; value: ReactNode; detail?: string; icon?: ReactNode }) {
  return (
    <div className="rounded-md border border-line bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-court">{label}</div>
        {icon ? <div className="text-court">{icon}</div> : null}
      </div>
      <div className="mt-3 text-3xl font-semibold leading-none text-ink">{value}</div>
      {detail ? <div className="mt-2 text-sm text-graphite">{detail}</div> : null}
    </div>
  );
}
