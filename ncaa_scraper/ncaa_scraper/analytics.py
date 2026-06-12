"""Analytics engine: turns scraped ESPN data into strategic insight artifacts.

Reads the espn_* tables in data/ncaa_mbb.sqlite3 and writes static JSON
artifacts to frontend/public/data/ that power the coach + reporter tools:

  meta.json            league context (averages, model params, sources)
  teams.json           master team index with headline metrics
  ratings.json         full power-rating board
  news.json            latest ESPN news articles
  recruiting.json      roster-construction summary for every team
  scout/{teamId}.json  deep scouting report per team

Run:  python -m ncaa_scraper.analytics
"""

from __future__ import annotations

import json
import math
import sqlite3
import statistics
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DB_PATH = REPO_ROOT / "data" / "ncaa_mbb.sqlite3"
OUT_DIR = REPO_ROOT / "frontend" / "public" / "data"

SEASON = 2026
SEASON_LABEL = "2025-26"
HOME_COURT_ADV = 3.2   # points, standard college hca
MARGIN_CAP = 28        # cap blowout margins when fitting ratings
SIGMA = 11.0           # std dev of scoring margin, for win probability


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# ---------------------------------------------------------------- loading

def load_all(conn: sqlite3.Connection) -> dict:
    teams = {r["id"]: dict(r) for r in conn.execute("SELECT * FROM espn_teams")}
    standings = {r["team_id"]: dict(r) for r in conn.execute("SELECT * FROM espn_standings WHERE season=?", (SEASON,))}
    rankings = defaultdict(dict)
    for r in conn.execute("SELECT * FROM espn_rankings WHERE season=?", (SEASON,)):
        rankings[r["team_id"]][r["poll"]] = dict(r)
    games = [dict(r) for r in conn.execute(
        "SELECT * FROM espn_games WHERE season=? AND completed=1 AND home_score IS NOT NULL AND away_score IS NOT NULL ORDER BY game_date",
        (SEASON,),
    )]
    stats: dict[int, dict[str, float]] = defaultdict(dict)
    for r in conn.execute("SELECT team_id, name, value, per_game FROM espn_team_stats WHERE season=?", (SEASON,)):
        stats[r["team_id"]][r["name"]] = r["value"]
        if r["per_game"] is not None:
            stats[r["team_id"]][r["name"] + "PerGame"] = r["per_game"]
    leaders = defaultdict(list)
    for r in conn.execute("SELECT * FROM espn_leaders WHERE season=?", (SEASON,)):
        leaders[r["team_id"]].append(dict(r))
    athletes = defaultdict(list)
    athlete_by_id = {}
    for r in conn.execute("SELECT * FROM espn_athletes"):
        athletes[r["team_id"]].append(dict(r))
        athlete_by_id[r["id"]] = dict(r)
    news = [dict(r) for r in conn.execute("SELECT * FROM espn_news ORDER BY published DESC LIMIT 60")]
    return {
        "teams": teams, "standings": standings, "rankings": rankings, "games": games,
        "stats": stats, "leaders": leaders, "athletes": athletes,
        "athlete_by_id": athlete_by_id, "news": news,
    }


# ---------------------------------------------------------------- ratings (SRS)

def compute_srs(games: list[dict], team_ids: set[int]) -> dict[int, float]:
    """Iterative Simple Rating System with home-court adjustment and capped margins.

    rating[t] converges to (avg adjusted margin) + (avg opponent rating).
    Only games where both teams are D1 (present in espn_teams) are used.
    """
    game_list = []
    for g in games:
        h, a = g["home_id"], g["away_id"]
        if h not in team_ids or a not in team_ids:
            continue
        margin = g["home_score"] - g["away_score"]
        if not g["neutral_site"]:
            margin -= HOME_COURT_ADV
        margin = max(-MARGIN_CAP, min(MARGIN_CAP, margin))
        game_list.append((h, a, margin))

    ratings = {t: 0.0 for t in team_ids}
    schedule = defaultdict(list)
    for h, a, m in game_list:
        schedule[h].append((a, m))
        schedule[a].append((h, -m))

    for _ in range(200):
        max_delta = 0.0
        new_ratings = {}
        for t in team_ids:
            gs = schedule[t]
            if not gs:
                new_ratings[t] = 0.0
                continue
            val = sum(m + ratings[o] for o, m in gs) / len(gs)
            new_ratings[t] = val
            max_delta = max(max_delta, abs(val - ratings[t]))
        # re-center to mean 0
        mean = sum(new_ratings.values()) / len(new_ratings)
        ratings = {t: v - mean for t, v in new_ratings.items()}
        if max_delta < 1e-4:
            break
    return ratings


def compute_sos(games: list[dict], srs: dict[int, float]) -> dict[int, float]:
    opps = defaultdict(list)
    for g in games:
        h, a = g["home_id"], g["away_id"]
        if h in srs and a in srs:
            opps[h].append(srs[a])
            opps[a].append(srs[h])
    return {t: (sum(v) / len(v) if v else 0.0) for t, v in opps.items()}


# ---------------------------------------------------------------- metric helpers

def pct_rank(values: list[float], value: float, higher_is_better: bool = True) -> int:
    """National percentile (0-100) of value within values."""
    if not values or value is None:
        return 50
    below = sum(1 for v in values if v < value)
    equal = sum(1 for v in values if v == value)
    pctl = (below + 0.5 * equal) / len(values) * 100
    return round(pctl if higher_is_better else 100 - pctl)


def natl_rank(values: list[float], value: float, higher_is_better: bool = True) -> int:
    if value is None:
        return len(values)
    if higher_is_better:
        return 1 + sum(1 for v in values if v > value)
    return 1 + sum(1 for v in values if v < value)


def safe_div(a, b):
    return a / b if a is not None and b not in (None, 0) else None


def rnd(x, digits=1):
    return round(x, digits) if x is not None else None


# ---------------------------------------------------------------- team metrics

def team_metrics(stats: dict[str, float], standing: dict) -> dict:
    """Derive the strategic metric set for one team from ESPN season totals."""
    s = stats
    games = s.get("gamesPlayed") or ((standing.get("overall_wins") or 0) + (standing.get("overall_losses") or 0)) or None
    poss = s.get("estimatedPossessions")
    pts = s.get("points")
    fgm, fga = s.get("fieldGoalsMade"), s.get("fieldGoalsAttempted")
    tpm, tpa = s.get("threePointFieldGoalsMade"), s.get("threePointFieldGoalsAttempted")
    ftm, fta = s.get("freeThrowsMade"), s.get("freeThrowsAttempted")
    tov = s.get("totalTurnovers") or s.get("turnovers")

    efg = safe_div((fgm or 0) + 0.5 * (tpm or 0), fga) if fga else None
    tov_pct = safe_div(tov, poss)
    ft_rate = safe_div(fta, fga)
    three_rate = safe_div(tpa, fga)
    ast_rate = safe_div(s.get("assists"), fgm)

    pts_from_3 = safe_div(3 * (tpm or 0), pts)
    pts_from_ft = safe_div(ftm, pts)

    return {
        "games": int(games) if games else None,
        "pace": rnd(s.get("avgEstimatedPossessions"), 1),
        "ppg": rnd(s.get("avgPoints"), 1),
        "efg": rnd(100 * efg, 1) if efg else None,
        "fgPct": rnd(s.get("fieldGoalPct"), 1),
        "threePct": rnd(s.get("threePointFieldGoalPct"), 1),
        "ftPct": rnd(s.get("freeThrowPct"), 1),
        "twoPct": rnd(s.get("twoPointFieldGoalPct"), 1),
        "tovPct": rnd(100 * tov_pct, 1) if tov_pct else None,
        "orbPct": rnd(100 * s.get("offensiveReboundPct"), 1) if s.get("offensiveReboundPct") is not None else None,
        "ftRate": rnd(100 * ft_rate, 1) if ft_rate else None,
        "threeRate": rnd(100 * three_rate, 1) if three_rate else None,
        "astRate": rnd(100 * ast_rate, 1) if ast_rate else None,
        "astToRatio": rnd(s.get("assistTurnoverRatio"), 2),
        "ptsFrom3Pct": rnd(100 * pts_from_3, 1) if pts_from_3 else None,
        "ptsFromFtPct": rnd(100 * pts_from_ft, 1) if pts_from_ft else None,
        "fastBreakPerGame": rnd(safe_div(s.get("fastBreakPoints"), games), 1),
        "secondChancePerGame": rnd(safe_div(s.get("secondChancePoints"), games), 1),
        "ptsOffTovPerGame": rnd(safe_div(s.get("turnoverPoints"), games), 1),
        "stealsPerGame": rnd(s.get("avgSteals"), 1),
        "blocksPerGame": rnd(s.get("avgBlocks"), 1),
        "drbPerGame": rnd(s.get("avgDefensiveRebounds"), 1),
        "foulsPerGame": rnd(safe_div(s.get("fouls"), games), 1),
        "_poss": poss,
    }


METRIC_DIRECTIONS = {
    # metric -> True if higher is better (for percentile shading)
    "pace": True, "offEff": True, "ppg": True, "efg": True, "fgPct": True,
    "threePct": True, "ftPct": True, "twoPct": True, "tovPct": False,
    "orbPct": True, "ftRate": True, "threeRate": True, "astRate": True,
    "astToRatio": True, "fastBreakPerGame": True, "secondChancePerGame": True,
    "ptsOffTovPerGame": True, "stealsPerGame": True, "blocksPerGame": True,
    "drbPerGame": True, "foulsPerGame": False, "defEff": False, "papg": False,
    "srs": True, "sos": True, "netMargin": True,
}


# ---------------------------------------------------------------- narratives

def build_narratives(m: dict, pcts: dict, identity: dict) -> dict:
    strengths, weaknesses, how_to_beat = [], [], []

    def fmt(v, suffix=""):
        return f"{v}{suffix}" if v is not None else "—"

    checks = [
        ("offEff", f"Elite offense — {fmt(m.get('offEff'))} points per 100 possessions",
         f"Struggling offense — only {fmt(m.get('offEff'))} points per 100 possessions"),
        ("defEff", f"Lockdown defense — allows just {fmt(m.get('defEff'))} points per 100 possessions",
         f"Leaky defense — gives up {fmt(m.get('defEff'))} points per 100 possessions"),
        ("efg", f"Efficient shooting ({fmt(m.get('efg'), '%')} eFG)",
         f"Poor shot-making ({fmt(m.get('efg'), '%')} eFG)"),
        ("threePct", f"Dangerous from deep — {fmt(m.get('threePct'), '%')} from three",
         f"Weak perimeter shooting ({fmt(m.get('threePct'), '%')} from three)"),
        ("tovPct", f"Takes care of the ball — turnovers on only {fmt(m.get('tovPct'), '%')} of possessions",
         f"Turnover prone — coughs it up on {fmt(m.get('tovPct'), '%')} of possessions"),
        ("orbPct", f"Dominant on the offensive glass ({fmt(m.get('orbPct'), '%')} ORB rate)",
         f"Weak on the offensive boards ({fmt(m.get('orbPct'), '%')} ORB rate)"),
        ("ftRate", f"Lives at the free-throw line ({fmt(m.get('ftRate'))} FTA per 100 FGA)",
         f"Doesn't earn free points ({fmt(m.get('ftRate'))} FTA per 100 FGA)"),
        ("astRate", f"Elite ball movement — assists on {fmt(m.get('astRate'), '%')} of made baskets",
         f"Stagnant offense — assists on just {fmt(m.get('astRate'), '%')} of makes"),
        ("stealsPerGame", f"Disruptive hands — {fmt(m.get('stealsPerGame'))} steals per game",
         None),
        ("blocksPerGame", f"Strong rim protection — {fmt(m.get('blocksPerGame'))} blocks per game",
         None),
        ("fastBreakPerGame", f"Lethal in transition — {fmt(m.get('fastBreakPerGame'))} fast-break points per game",
         None),
    ]
    for key, strong_text, weak_text in checks:
        p = pcts.get(key)
        if p is None:
            continue
        if p >= 80 and strong_text:
            strengths.append({"text": strong_text, "metric": key, "pct": p})
        elif p <= 20 and weak_text:
            weaknesses.append({"text": weak_text, "metric": key, "pct": p})

    # how-to-beat: inverse of strengths, exploit weaknesses
    if pcts.get("tovPct", 50) <= 35:
        how_to_beat.append("Pressure their ball-handlers — they rank near the bottom nationally at protecting the ball.")
    if pcts.get("threePct", 50) >= 75:
        how_to_beat.append("Run shooters off the three-point line; make them score inside the arc.")
    if pcts.get("orbPct", 50) >= 75:
        how_to_beat.append("Gang rebound and finish possessions — second chances fuel their offense.")
    if pcts.get("ftRate", 50) >= 75:
        how_to_beat.append("Defend without fouling; they manufacture points at the stripe.")
    if pcts.get("pace", 50) >= 75:
        how_to_beat.append("Control tempo and limit transition opportunities — they want a track meet.")
    if pcts.get("pace", 50) <= 25:
        how_to_beat.append("Push the ball before their half-court defense sets; they want a grind-it-out game.")
    if pcts.get("defEff", 50) <= 30:
        how_to_beat.append("Attack early and often — their half-court defense can be scored on.")
    if pcts.get("blocksPerGame", 50) >= 75:
        how_to_beat.append("Be careful challenging at the rim — use pump fakes and kick-outs against their shot blocking.")
    if pcts.get("foulsPerGame", 50) <= 25:
        how_to_beat.append("Drive at their bigs — they foul at one of the highest rates in the country.")
    if not how_to_beat:
        how_to_beat.append("No glaring statistical weaknesses — win the possession battle and make open shots.")

    return {
        "strengths": strengths[:5],
        "weaknesses": weaknesses[:5],
        "howToBeat": how_to_beat[:5],
    }


# ---------------------------------------------------------------- press / storylines

def build_press(identity: dict, m: dict, pcts: dict, sched: list[dict], roster_info: dict,
                key_players: list[dict]) -> dict:
    storylines, nuggets = [], []
    name = identity["shortName"]
    record = identity.get("record") or ""

    if identity.get("apRank"):
        storylines.append(f"{name} finished the {SEASON_LABEL} season ranked No. {identity['apRank']} in the final AP poll at {record}.")
    if identity.get("playoffSeed") == 1:
        storylines.append(f"{name} finished atop the {identity.get('conference')} standings at {identity.get('confRecord')} in league play.")
    quality_wins = [g for g in sched if g.get("result") == "W" and g.get("oppSrsRank") and g["oppSrsRank"] <= 50]
    bad_losses = [g for g in sched if g.get("result") == "L" and g.get("oppSrsRank") and g["oppSrsRank"] > 150]
    if quality_wins:
        best = min(quality_wins, key=lambda g: g["oppSrsRank"])
        storylines.append(f"Signature win: {best['score']} over {best['opponent']} (No. {best['oppSrsRank']} in our power ratings){' on the road' if best.get('venueTag') == 'away' else ''}.")
    if bad_losses:
        worst = max(bad_losses, key=lambda g: g["oppSrsRank"])
        storylines.append(f"The resume blemish: a {worst['score']} loss to {worst['opponent']} (No. {worst['oppSrsRank']}).")
    if identity.get("vsApRecord") and identity["vsApRecord"] not in ("0-0",):
        storylines.append(f"{name} went {identity['vsApRecord']} against AP-ranked opponents.")

    star = key_players[0] if key_players else None
    if star and star.get("ppg"):
        storylines.append(f"{star['name']} ({star.get('classYear', '')} {star.get('position', '')}) led the way at {star['ppg']} points per game.")

    departures = roster_info.get("departingCount") or 0
    if departures:
        storylines.append(f"Roster watch: {departures} seniors/graduates depart, opening {roster_info.get('departingShare', 0)}% of the roster for next season.")

    if pcts.get("pace") is not None:
        if pcts["pace"] >= 85:
            nuggets.append(f"One of the fastest teams in the nation — {m.get('pace')} possessions per game ({pcts['pace']}th percentile).")
        elif pcts["pace"] <= 15:
            nuggets.append(f"One of the most deliberate teams in the country — just {m.get('pace')} possessions per game.")
    if m.get("ptsFrom3Pct") and m["ptsFrom3Pct"] > 35:
        nuggets.append(f"Three-point reliant: {m['ptsFrom3Pct']}% of points come from beyond the arc.")
    if m.get("fastBreakPerGame") and pcts.get("fastBreakPerGame", 50) >= 80:
        nuggets.append(f"{m['fastBreakPerGame']} fast-break points per game — among the nation's best in transition.")
    if identity.get("avgHomeAttendance"):
        nuggets.append(f"Averaged {identity['avgHomeAttendance']:,} fans at home games.")
    if m.get("offEff") and m.get("defEff"):
        nuggets.append(f"Scored {m['offEff']} and allowed {m['defEff']} points per 100 possessions (net {rnd(m['offEff'] - m['defEff'], 1)}).")

    streak_games = [g for g in sched if g.get("result")]
    closing = streak_games[-5:] if len(streak_games) >= 5 else streak_games
    wins_close = sum(1 for g in closing if g["result"] == "W")
    if closing:
        storylines.append(f"Closed the season {wins_close}-{len(closing) - wins_close} over the final {len(closing)} games.")

    article = (
        f"{identity['name']} wrapped the {SEASON_LABEL} campaign at {record}"
        + (f", No. {identity['apRank']} in the final AP poll" if identity.get("apRank") else "")
        + f". Playing at {m.get('pace') or 'an average'} possessions per game with an offense scoring "
        + f"{m.get('offEff') or '—'} points per 100 trips, "
        + (f"{star['name']} powered the attack at {star['ppg']} PPG. " if star and star.get("ppg") else "")
        + (f"The defense allowed {m.get('defEff')} per 100 — " if m.get("defEff") else "")
        + f"a profile that ranks No. {identity.get('srsRank', '—')} in our overall power ratings."
    )

    return {"storylines": storylines[:7], "nuggets": nuggets[:6], "articleStarter": article}


# ---------------------------------------------------------------- recruiting

CLASS_ORDER = ["Freshman", "Sophomore", "Junior", "Senior", "Graduate"]


def build_roster_info(roster: list[dict], leaders: list[dict]) -> dict:
    by_class = defaultdict(list)
    for p in roster:
        cls = p.get("class_year") or "Unknown"
        by_class[cls].append(p)
    departing = by_class.get("Senior", []) + by_class.get("Graduate", [])
    total = len(roster) or 1

    # how much of the leader production departs
    leader_ids = {l["athlete_id"] for l in leaders if l["category"] in ("pointsPerGame", "minutesPerGame")}
    departing_ids = {p["id"] for p in departing}
    departing_leaders = leader_ids & departing_ids

    pos_counts = defaultdict(int)
    departing_pos = defaultdict(int)
    for p in roster:
        pos = p.get("position") or "?"
        pos_counts[pos] += 1
        if p["id"] in departing_ids:
            departing_pos[pos] += 1

    needs = [pos for pos, cnt in departing_pos.items() if cnt >= max(1, pos_counts[pos] // 2)]

    return {
        "classBreakdown": {c: len(by_class.get(c, [])) for c in CLASS_ORDER if by_class.get(c)},
        "rosterSize": len(roster),
        "departingCount": len(departing),
        "departingShare": round(100 * len(departing) / total),
        "departingNames": [{"name": p["full_name"], "position": p.get("position"), "classYear": p.get("class_year")} for p in departing],
        "departingStarCount": len(departing_leaders),
        "positionalNeeds": sorted(needs),
    }


# ---------------------------------------------------------------- key players

LEADER_LABELS = {
    "pointsPerGame": "ppg", "reboundsPerGame": "rpg", "assistsPerGame": "apg",
    "stealsPerGame": "spg", "blocksPerGame": "bpg", "minutesPerGame": "mpg",
    "3PointMadePerGame": "threesPg", "fieldGoalPercentage": "fgPct", "PER": "per",
}


def build_key_players(leaders: list[dict], athlete_by_id: dict) -> list[dict]:
    per_athlete = defaultdict(dict)
    for l in leaders:
        label = LEADER_LABELS.get(l["category"])
        if not label:
            continue
        per_athlete[l["athlete_id"]][label] = round(l["value"], 1) if l["value"] is not None else None

    players = []
    for aid, statline in per_athlete.items():
        ath = athlete_by_id.get(aid)
        players.append({
            "id": aid,
            "name": ath["full_name"] if ath else f"#{aid}",
            "position": ath.get("position") if ath else None,
            "classYear": ath.get("class_year") if ath else None,
            "height": ath.get("height") if ath else None,
            "jersey": ath.get("jersey") if ath else None,
            "hometown": (f"{ath['hometown_city']}, {ath['hometown_state']}" if ath and ath.get("hometown_city") else None),
            **statline,
        })
    players.sort(key=lambda p: (p.get("ppg") or 0, p.get("mpg") or 0), reverse=True)
    return players[:8]


# ---------------------------------------------------------------- main build

def build(conn: sqlite3.Connection) -> None:
    data = load_all(conn)
    teams = data["teams"]
    team_ids = set(teams.keys())
    games = data["games"]

    print(f"loaded: {len(teams)} teams, {len(games)} completed games")

    srs = compute_srs(games, team_ids)
    sos = compute_sos(games, srs)
    srs_sorted = sorted(srs.items(), key=lambda kv: kv[1], reverse=True)
    srs_rank = {t: i + 1 for i, (t, _) in enumerate(srs_sorted)}

    # points for/against + home attendance per team from the full game log
    # (ESPN season-stat totals are regular-season only, so efficiency is built
    # from per-game rates: full-season ppg/papg over ESPN's per-game pace)
    pts_for = defaultdict(int)
    pts_against = defaultdict(int)
    games_count = defaultdict(int)
    home_attendance = defaultdict(list)
    schedules = defaultdict(list)
    for g in games:
        h, a = g["home_id"], g["away_id"]
        if h in team_ids:
            pts_for[h] += g["home_score"]
            pts_against[h] += g["away_score"]
            games_count[h] += 1
            if g.get("attendance"):
                home_attendance[h].append(g["attendance"])
        if a in team_ids:
            pts_for[a] += g["away_score"]
            pts_against[a] += g["home_score"]
            games_count[a] += 1
        schedules[h].append((g, "home"))
        schedules[a].append((g, "away"))

    # metrics per team
    metrics = {}
    for tid in team_ids:
        m = team_metrics(data["stats"].get(tid, {}), data["standings"].get(tid, {}))
        m.pop("_poss", None)
        pace = m.get("pace")
        if games_count.get(tid):
            n = games_count[tid]
            m["ppg"] = rnd(pts_for[tid] / n, 1)
            m["papg"] = rnd(pts_against[tid] / n, 1)
            m["offEff"] = rnd(100 * pts_for[tid] / n / pace, 1) if pace else None
            m["defEff"] = rnd(100 * pts_against[tid] / n / pace, 1) if pace else None
        else:
            m["papg"] = None
            m["offEff"] = None
            m["defEff"] = None
        m["srs"] = rnd(srs.get(tid, 0.0), 2)
        m["sos"] = rnd(sos.get(tid, 0.0), 2)
        m["netMargin"] = rnd((m["ppg"] - m["papg"]) if m.get("ppg") and m.get("papg") else None, 1)
        metrics[tid] = m

    # percentiles across teams that actually have stats
    metric_values = defaultdict(list)
    for tid, m in metrics.items():
        if not data["stats"].get(tid):
            continue
        for k, v in m.items():
            if v is not None and k in METRIC_DIRECTIONS:
                metric_values[k].append(v)

    percentiles = {}
    ranks = {}
    for tid, m in metrics.items():
        pcts, rks = {}, {}
        for k, v in m.items():
            if k in METRIC_DIRECTIONS and v is not None and metric_values.get(k):
                pcts[k] = pct_rank(metric_values[k], v, METRIC_DIRECTIONS[k])
                rks[k] = natl_rank(metric_values[k], v, METRIC_DIRECTIONS[k])
        percentiles[tid] = pcts
        ranks[tid] = rks

    # identity cards
    identities = {}
    for tid, t in teams.items():
        st = data["standings"].get(tid, {})
        rk = data["rankings"].get(tid, {})
        ap = rk.get("AP Top 25", {}).get("rank")
        coaches = rk.get("Coaches Poll", {}).get("rank")
        att = home_attendance.get(tid)
        identities[tid] = {
            "id": tid,
            "name": t["display_name"],
            "shortName": t["short_name"],
            "abbrev": t["abbreviation"],
            "logo": t["logo"],
            "color": t["color"],
            "altColor": t["alt_color"],
            "conference": t.get("conference_name"),
            "record": (f"{st['overall_wins']}-{st['overall_losses']}" if st.get("overall_wins") is not None else None),
            "confRecord": (f"{st['conf_wins']}-{st['conf_losses']}" if st.get("conf_wins") is not None else None),
            "homeRecord": st.get("home_record"),
            "awayRecord": st.get("away_record"),
            "vsApRecord": st.get("vs_ap_record"),
            "playoffSeed": st.get("playoff_seed"),
            "apRank": ap,
            "coachesRank": coaches,
            "srsRank": srs_rank.get(tid),
            "avgHomeAttendance": (round(sum(att) / len(att)) if att else None),
        }

    # schedule views
    def schedule_view(tid: int) -> list[dict]:
        rows = []
        for g, side in sorted(schedules.get(tid, []), key=lambda x: x[0]["game_date"] or ""):
            opp_id = g["away_id"] if side == "home" else g["home_id"]
            opp = teams.get(opp_id)
            own_score = g["home_score"] if side == "home" else g["away_score"]
            opp_score = g["away_score"] if side == "home" else g["home_score"]
            if own_score is None or opp_score is None:
                continue
            won = own_score > opp_score
            rows.append({
                "gameId": g["id"],
                "date": (g["game_date"] or "")[:10],
                "opponent": opp["short_name"] if opp else f"Team {opp_id}",
                "opponentId": opp_id if opp else None,
                "opponentLogo": opp["logo"] if opp else None,
                "venueTag": "neutral" if g["neutral_site"] else side,
                "result": "W" if won else "L",
                "score": f"{own_score}-{opp_score}",
                "margin": own_score - opp_score,
                "oppSrsRank": srs_rank.get(opp_id),
                "confGame": bool(g["conference_game"]),
                "note": g.get("notes"),
                "broadcast": g.get("broadcast"),
            })
        return rows

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "scout").mkdir(exist_ok=True)

    league_avgs = {
        k: rnd(statistics.mean(v), 2) for k, v in metric_values.items() if v
    }

    # ---- scout files
    teams_with_stats = [tid for tid in team_ids if data["stats"].get(tid)]
    for tid in team_ids:
        identity = identities[tid]
        m = metrics[tid]
        pcts = percentiles[tid]
        rks = ranks[tid]
        sched = schedule_view(tid)
        roster = data["athletes"].get(tid, [])
        roster_info = build_roster_info(roster, data["leaders"].get(tid, []))
        key_players = build_key_players(data["leaders"].get(tid, []), data["athlete_by_id"])
        narratives = build_narratives(m, pcts, identity)
        press = build_press(identity, m, pcts, sched, roster_info, key_players)

        quality_wins = [g for g in sched if g["result"] == "W" and g.get("oppSrsRank") and g["oppSrsRank"] <= 50]
        bad_losses = [g for g in sched if g["result"] == "L" and g.get("oppSrsRank") and g["oppSrsRank"] > 150]
        last10 = sched[-10:]

        scout = {
            "identity": identity,
            "metrics": {k: v for k, v in m.items() if not k.startswith("_")},
            "percentiles": pcts,
            "ranks": rks,
            "narratives": narratives,
            "press": press,
            "keyPlayers": key_players,
            "roster": [
                {
                    "id": p["id"], "name": p["full_name"], "jersey": p.get("jersey"),
                    "position": p.get("position"), "height": p.get("height"),
                    "weight": p.get("weight"), "classYear": p.get("class_year"),
                    "hometown": (f"{p['hometown_city']}, {p['hometown_state']}" if p.get("hometown_city") else None),
                }
                for p in roster
            ],
            "rosterInfo": roster_info,
            "schedule": sched,
            "qualityWins": quality_wins[:8],
            "badLosses": bad_losses[:5],
            "last10Record": f"{sum(1 for g in last10 if g['result'] == 'W')}-{sum(1 for g in last10 if g['result'] == 'L')}",
        }
        with open(OUT_DIR / "scout" / f"{tid}.json", "w") as f:
            json.dump(scout, f, separators=(",", ":"))

    print(f"scout: wrote {len(team_ids)} files")

    # ---- teams.json (index)
    index = []
    for tid in sorted(team_ids, key=lambda t: srs_rank.get(t, 999)):
        identity = identities[tid]
        m = metrics[tid]
        index.append({
            **identity,
            "srs": m["srs"], "sos": m["sos"],
            "offEff": m["offEff"], "defEff": m["defEff"], "pace": m["pace"],
            "ppg": m["ppg"], "papg": m["papg"],
            "hasStats": bool(data["stats"].get(tid)),
        })
    with open(OUT_DIR / "teams.json", "w") as f:
        json.dump({"season": SEASON_LABEL, "teams": index}, f, separators=(",", ":"))
    print(f"teams.json: {len(index)} teams")

    # ---- ratings.json (full board)
    board = []
    for tid in sorted(teams_with_stats, key=lambda t: srs_rank.get(t, 999)):
        identity = identities[tid]
        m = metrics[tid]
        board.append({
            "id": tid, "rank": identity["srsRank"], "name": identity["name"],
            "shortName": identity["shortName"], "logo": identity["logo"],
            "conference": identity["conference"], "record": identity["record"],
            "apRank": identity["apRank"],
            "srs": m["srs"], "sos": m["sos"], "offEff": m["offEff"], "defEff": m["defEff"],
            "pace": m["pace"], "efg": m["efg"], "tovPct": m["tovPct"], "orbPct": m["orbPct"],
            "ftRate": m["ftRate"], "threePct": m["threePct"], "netMargin": m["netMargin"],
        })
    with open(OUT_DIR / "ratings.json", "w") as f:
        json.dump({"season": SEASON_LABEL, "updated": datetime.now(timezone.utc).isoformat(), "board": board}, f, separators=(",", ":"))
    print(f"ratings.json: {len(board)} teams")

    # ---- recruiting.json
    recruiting = []
    for tid in sorted(team_ids, key=lambda t: srs_rank.get(t, 999)):
        roster = data["athletes"].get(tid, [])
        if not roster:
            continue
        info = build_roster_info(roster, data["leaders"].get(tid, []))
        recruiting.append({
            "id": tid,
            "name": identities[tid]["name"],
            "shortName": identities[tid]["shortName"],
            "logo": identities[tid]["logo"],
            "conference": identities[tid]["conference"],
            "srsRank": identities[tid]["srsRank"],
            **info,
        })
    with open(OUT_DIR / "recruiting.json", "w") as f:
        json.dump({"season": SEASON_LABEL, "teams": recruiting}, f, separators=(",", ":"))
    print(f"recruiting.json: {len(recruiting)} teams")

    # ---- conferences.json
    conf_teams = defaultdict(list)
    for tid, st in data["standings"].items():
        if st.get("conference_id") and tid in identities:
            conf_teams[(st["conference_id"], st["conference_name"])].append((tid, st))
    conferences = []
    for (cid, cname), members in conf_teams.items():
        rows = []
        for tid, st in members:
            ident = identities[tid]
            m = metrics[tid]
            rows.append({
                "id": tid, "name": ident["name"], "shortName": ident["shortName"],
                "logo": ident["logo"], "seed": st.get("playoff_seed"),
                "confRecord": ident["confRecord"], "record": ident["record"],
                "srs": m["srs"], "srsRank": ident["srsRank"], "apRank": ident["apRank"],
            })
        rows.sort(key=lambda r: (r["seed"] if r["seed"] is not None else 99, -(r["srs"] or 0)))
        srs_vals = [r["srs"] for r in rows if r["srs"] is not None]
        conferences.append({
            "id": cid, "name": cname, "teams": rows,
            "avgSrs": rnd(sum(srs_vals) / len(srs_vals), 2) if srs_vals else None,
        })
    conferences.sort(key=lambda c: -(c["avgSrs"] if c["avgSrs"] is not None else -99))
    for i, c in enumerate(conferences):
        c["strengthRank"] = i + 1
    with open(OUT_DIR / "conferences.json", "w") as f:
        json.dump({"season": SEASON_LABEL, "conferences": conferences}, f, separators=(",", ":"))
    print(f"conferences.json: {len(conferences)} leagues")

    # ---- news.json
    news_rows = [
        {
            "id": n["id"], "headline": n["headline"], "description": n["description"],
            "published": n["published"], "link": n["link"], "image": n["image"],
            "categories": json.loads(n["categories"] or "[]"),
        }
        for n in data["news"]
    ]
    with open(OUT_DIR / "news.json", "w") as f:
        json.dump({"articles": news_rows}, f, separators=(",", ":"))
    print(f"news.json: {len(news_rows)} articles")

    # ---- meta.json
    meta = {
        "season": SEASON_LABEL,
        "generated": datetime.now(timezone.utc).isoformat(),
        "completedGames": len(games),
        "teamsTracked": len(team_ids),
        "model": {"homeCourtAdvantage": HOME_COURT_ADV, "marginCap": MARGIN_CAP, "sigma": SIGMA},
        "leagueAverages": league_avgs,
        "sources": [
            {"name": "ESPN", "kind": "scores, rosters, season statistics, rankings, news"},
            {"name": "stats.ncaa.org", "kind": "play-by-play, shot locations, box scores"},
            {"name": "YouTube (official channels)", "kind": "game film and highlights"},
        ],
    }
    with open(OUT_DIR / "meta.json", "w") as f:
        json.dump(meta, f, indent=1)
    print("meta.json written")


def main() -> None:
    conn = connect()
    build(conn)
    conn.close()


if __name__ == "__main__":
    main()
