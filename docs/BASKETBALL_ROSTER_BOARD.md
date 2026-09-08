# 2026–27 roster workload board

The [`/basketball/roster-board/`](https://bball.silvermine.dev/basketball/roster-board/) page ranks source-listed 2026–27 men’s college basketball players by prior recorded production. It is a recruiting and roster-context tool: it does not project a new-school role, verify eligibility, infer departures or alter the matchup model.

The board reads `frontend/public/data/basketball/rosters.json`, which compares the current source listing with the prior imported season. It preserves the publisher’s player ID and program label. A `same_program` observation means the same source identity was observed for that program in the prior release; `different_program` means the source identity has a prior record at another program; `new_to_dataset` means no prior appearance was found in the archive. The last two labels are source observations, not a transaction ledger.

Users can search player, current program or prior program; filter the roster observation; set a minimum prior-minute threshold; and rank by prior minutes per game, total minutes, points, rebounds, assists, effective field-goal percentage or true shooting. Ties retain the same rank. Rows without a prior production record remain visible at the bottom of an unfiltered view and show missing values rather than zeroes. Every row links to the historical player file when a source ID exists, and the CSV contains the exact displayed evidence fields.

The board labels prior workload descriptively: 25 or more recorded minutes per game is “High workload,” 15–24.9 is “Rotation workload,” and lower positive samples are “Limited sample.” These thresholds are editorial reading aids, not fitted talent grades. The page fetches the public roster release after the initial HTML so the 2.9 MB source archive is not embedded in the route payload.

The board is rebuilt whenever the basketball publication regenerates the roster release. The source release, program coverage, and limitations remain visible from [`/research/coverage/`](https://bball.silvermine.dev/research/coverage/) and the recruiting evidence desk.
