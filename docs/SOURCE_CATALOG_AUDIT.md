# Licensed source catalog audit

Checked 2026-09-11 against the public [SportsDataverse data release store](https://github.com/sportsdataverse/sportsdataverse-data/) and the upstream [hoopR men's college basketball pipeline](https://github.com/sportsdataverse/hoopR-mbb-data/blob/main/CLAUDE.md).

The active ESPN men's college basketball release families listed by SportsDataverse are play-by-play, player box scores, schedules and team box scores. Silvermine consumes those releases and also consumes the permitted NCAA-derived releases for player boxes, rosters, shots, possessions, lineups, matchup stints, team boxes and RAPM. The local source catalog retains each release receipt, retrieval clock and content hash.

The upstream pipeline documents additional `game_rosters` and `officials` outputs. The former repeats game-level roster, starter and DNP metadata already retained where it affects the player box archive; the latter contains officiating metadata rather than player statistics. They remain outside the player-stat warehouse so they cannot be mistaken for an additional stat source. Revisit them if a future coaching feature needs game-roster availability or officiating context, with a separate table and provenance contract.

The upstream release catalog also documents cross-source team, schedule and player crosswalks. Silvermine keeps the player crosswalk out of identity joins because the available release does not provide a verified NCAA-to-ESPN mapping; source-native IDs remain separate by design.

No proprietary KenPom ratings are copied. The site publishes independent Four Factors, tempo, opponent-adjusted efficiency, lineup stints, RAPM, Box BPM and player production views, with source-native publisher values shown separately when available.
