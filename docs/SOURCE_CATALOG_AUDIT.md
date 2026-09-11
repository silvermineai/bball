# Licensed source catalog audit

Checked 2026-09-11 against the public [SportsDataverse data release store](https://github.com/sportsdataverse/sportsdataverse-data/) and the upstream [hoopR men's college basketball pipeline](https://github.com/sportsdataverse/hoopR-mbb-data/blob/main/CLAUDE.md).

The active ESPN men's college basketball release families listed by SportsDataverse are play-by-play, player box scores, schedules and team box scores. Silvermine consumes those releases and also consumes the permitted NCAA-derived releases for player boxes, rosters, shots, possessions, lineups, matchup stints, team boxes and RAPM. The local source catalog retains each release receipt, retrieval clock and content hash.

The football catalog now also consumes the attributed `espn_cfb_rosters`, `cfb_recruits`, `cfb_team_talent` and `cfb_returning_production` release families for 2025–26 personnel context. Their stable source IDs and raw fields remain in separate football dataset namespaces and are surfaced through the recruiting desk; they are not silently joined to eligibility, transfer or forecast state.

The upstream pipeline documents additional `game_rosters` and `officials` outputs. Silvermine now retains the 2003–04 through 2025–26 releases in the dedicated NCAA archive with a separate provenance contract, searchable through the [game context desk](/basketball/game-context/); 2010 has no officials parquet release and remains an explicit source gap. Starter, active, DNP and ejection flags remain game-day context rather than player statistics; officials remain a separate assignment table. They are not joined into the player-stat warehouse or forecast model.

The upstream release catalog also documents cross-source team, schedule and player crosswalks. Silvermine keeps the player crosswalk out of identity joins because the available release does not provide a verified NCAA-to-ESPN mapping; source-native IDs remain separate by design.

No proprietary KenPom ratings are copied. The site publishes independent Four Factors, tempo, opponent-adjusted efficiency, lineup stints, RAPM, Box BPM and player production views, with source-native publisher values shown separately when available.
