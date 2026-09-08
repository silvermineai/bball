# Basketball roster impact lab

The native `/basketball/roster-lab/` page compares the 2026–27 source-listed roster snapshot with prior recorded minutes, the independent efficiency field and the published upcoming schedule. It is a coaching research lens for deciding which programs deserve a closer personnel read.

Returning minutes share is same-program listed players' prior recorded minutes divided by all prior minutes observed for that program. Represented prior workload adds prior minutes from players listed under a different program. The incoming workload share is that latter value divided by the same denominator. The denominator is the exact-ID matched prior-production sample; a player with no prior record contributes no minutes and remains visible in the listed-player count.

The page retains four separate observations rather than inventing a composite roster grade: listed players, returning players, different-program players and new-to-dataset players. Historical adjusted net rating and scheduled/forecasted game counts are joins for context. They do not change the forecast, establish a transfer, prove eligibility or availability, or infer departures from an absent listing.

The derived rows are built by `frontend/app/_lib/roster-readiness.ts` from the published roster and basketball overview editions. Tests cover exact workload denominators, missing prior production and schedule coverage. CSV exports preserve the source IDs, counts, raw minute totals, shares, rating context and schedule counts.
