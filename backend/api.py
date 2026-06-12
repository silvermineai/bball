from flask import Flask, jsonify, request
from flask_cors import CORS
import sqlite3
import os
from datetime import datetime

app = Flask(__name__)
CORS(app)

DATABASE_PATH = os.path.join(os.path.dirname(__file__), '../data/basketball.db')

def get_db():
    """Get database connection"""
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn

@app.route('/api/teams')
def get_teams():
    """Get all teams with their current season records"""
    conn = get_db()
    cursor = conn.cursor()
    
    query = """
    SELECT 
        t.id, t.name, t.mascot, t.abbreviation, t.city, t.state,
        c.name as conference,
        tsr.wins, tsr.losses, tsr.conference_wins, tsr.conference_losses,
        tsr.kenpom_rank, tsr.net_rank,
        tss.offensive_efficiency, tss.defensive_efficiency, tss.pace
    FROM teams t
    LEFT JOIN conferences c ON t.conference_id = c.id
    LEFT JOIN team_season_records tsr ON t.id = tsr.team_id 
        AND tsr.season_id = (SELECT id FROM seasons WHERE is_current = 1)
    LEFT JOIN team_season_stats tss ON t.id = tss.team_id 
        AND tss.season_id = (SELECT id FROM seasons WHERE is_current = 1)
    ORDER BY tsr.wins DESC
    """
    
    cursor.execute(query)
    teams = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    return jsonify(teams)

@app.route('/api/teams/<team_id>')
def get_team_details(team_id):
    """Get detailed information about a specific team"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Get team info
    cursor.execute("""
    SELECT 
        t.*, c.name as conference_name
    FROM teams t
    LEFT JOIN conferences c ON t.conference_id = c.id
    WHERE t.id = ?
    """, (team_id,))
    team = dict(cursor.fetchone())
    
    # Get roster
    cursor.execute("""
    SELECT 
        p.*, pts.jersey_number, pts.position, pts.height, pts.weight, pts.class,
        pss.points_per_game, pss.rebounds_per_game, pss.assists_per_game,
        pss.field_goal_percentage, pss.three_point_percentage, pss.free_throw_percentage
    FROM players p
    JOIN player_team_seasons pts ON p.id = pts.player_id
    LEFT JOIN player_season_stats pss ON p.id = pss.player_id 
        AND pss.season_id = pts.season_id
    WHERE pts.team_id = ? AND pts.season_id = (SELECT id FROM seasons WHERE is_current = 1)
    ORDER BY pts.jersey_number
    """, (team_id,))
    team['roster'] = [dict(row) for row in cursor.fetchall()]
    
    # Get recent games
    cursor.execute("""
    SELECT 
        g.*, 
        ht.name as home_team_name, ht.mascot as home_team_mascot,
        at.name as away_team_name, at.mascot as away_team_mascot
    FROM games g
    JOIN teams ht ON g.home_team_id = ht.id
    JOIN teams at ON g.away_team_id = at.id
    WHERE (g.home_team_id = ? OR g.away_team_id = ?) 
        AND g.status = 'final'
    ORDER BY g.date DESC
    LIMIT 10
    """, (team_id, team_id))
    team['recent_games'] = [dict(row) for row in cursor.fetchall()]
    
    conn.close()
    return jsonify(team)

@app.route('/api/players/<player_id>')
def get_player_details(player_id):
    """Get detailed information about a specific player"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Get player info
    cursor.execute("""
    SELECT 
        p.*, pts.jersey_number, pts.position, pts.height, pts.weight, pts.class,
        t.name as team_name, t.id as team_id
    FROM players p
    JOIN player_team_seasons pts ON p.id = pts.player_id
    JOIN teams t ON pts.team_id = t.id
    WHERE p.id = ? AND pts.season_id = (SELECT id FROM seasons WHERE is_current = 1)
    """, (player_id,))
    player = dict(cursor.fetchone())
    
    # Get season stats
    cursor.execute("""
    SELECT * FROM player_season_stats
    WHERE player_id = ? AND season_id = (SELECT id FROM seasons WHERE is_current = 1)
    """, (player_id,))
    player['season_stats'] = dict(cursor.fetchone() or {})
    
    # Get game log
    cursor.execute("""
    SELECT 
        pgs.*, g.date, g.home_team_id, g.away_team_id,
        CASE 
            WHEN g.home_team_id = pgs.team_id THEN at.name
            ELSE ht.name
        END as opponent_name,
        CASE 
            WHEN g.home_team_id = pgs.team_id THEN 'vs'
            ELSE '@'
        END as location
    FROM player_game_stats pgs
    JOIN games g ON pgs.game_id = g.id
    JOIN teams ht ON g.home_team_id = ht.id
    JOIN teams at ON g.away_team_id = at.id
    WHERE pgs.player_id = ?
    ORDER BY g.date DESC
    LIMIT 10
    """, (player_id,))
    player['game_log'] = [dict(row) for row in cursor.fetchall()]
    
    conn.close()
    return jsonify(player)

@app.route('/api/games/<game_id>')
def get_game_details(game_id):
    """Get detailed information about a specific game"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Get game info
    cursor.execute("""
    SELECT 
        g.*,
        ht.name as home_team_name, ht.mascot as home_team_mascot,
        at.name as away_team_name, at.mascot as away_team_mascot
    FROM games g
    JOIN teams ht ON g.home_team_id = ht.id
    JOIN teams at ON g.away_team_id = at.id
    WHERE g.id = ?
    """, (game_id,))
    game = dict(cursor.fetchone())
    
    # Get team stats
    cursor.execute("""
    SELECT * FROM team_game_stats
    WHERE game_id = ?
    """, (game_id,))
    team_stats = cursor.fetchall()
    game['team_stats'] = {
        'home': dict([row for row in team_stats if row['is_home']][0]),
        'away': dict([row for row in team_stats if not row['is_home']][0])
    }
    
    # Get player stats
    cursor.execute("""
    SELECT 
        pgs.*, p.first_name, p.last_name
    FROM player_game_stats pgs
    JOIN players p ON pgs.player_id = p.id
    WHERE pgs.game_id = ?
    ORDER BY pgs.points DESC
    """, (game_id,))
    player_stats = cursor.fetchall()
    game['player_stats'] = {
        'home': [dict(row) for row in player_stats if row['team_id'] == game['home_team_id']],
        'away': [dict(row) for row in player_stats if row['team_id'] == game['away_team_id']]
    }
    
    conn.close()
    return jsonify(game)

@app.route('/api/analytics/shooting-charts/<team_id>')
def get_shooting_chart(team_id):
    """Get shooting chart data for a team"""
    conn = get_db()
    cursor = conn.cursor()
    
    season_id = request.args.get('season_id', None)
    if not season_id:
        cursor.execute("SELECT id FROM seasons WHERE is_current = 1")
        season_id = cursor.fetchone()[0]
    
    cursor.execute("""
    SELECT 
        s.*, p.first_name, p.last_name, g.date
    FROM shots s
    JOIN players p ON s.player_id = p.id
    JOIN games g ON s.game_id = g.id
    WHERE s.team_id = ? 
        AND g.season_id = ?
    ORDER BY g.date DESC
    """, (team_id, season_id))
    
    shots = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    return jsonify(shots)

@app.route('/api/matchups/<team1_id>/<team2_id>')
def get_matchup(team1_id, team2_id):
    """Get head-to-head matchup data between two teams"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Get historical games
    cursor.execute("""
    SELECT 
        g.*,
        ht.name as home_team_name, ht.mascot as home_team_mascot,
        at.name as away_team_name, at.mascot as away_team_mascot
    FROM games g
    JOIN teams ht ON g.home_team_id = ht.id
    JOIN teams at ON g.away_team_id = at.id
    WHERE ((g.home_team_id = ? AND g.away_team_id = ?) 
        OR (g.home_team_id = ? AND g.away_team_id = ?))
        AND g.status = 'final'
    ORDER BY g.date DESC
    """, (team1_id, team2_id, team2_id, team1_id))
    
    games = [dict(row) for row in cursor.fetchall()]
    
    # Calculate matchup stats
    team1_wins = sum(1 for g in games if 
        (g['home_team_id'] == team1_id and g['home_score'] > g['away_score']) or
        (g['away_team_id'] == team1_id and g['away_score'] > g['home_score']))
    
    team2_wins = len(games) - team1_wins
    
    matchup = {
        'team1_id': team1_id,
        'team2_id': team2_id,
        'historical_games': games,
        'team1_wins': team1_wins,
        'team2_wins': team2_wins,
        'total_games': len(games)
    }
    
    conn.close()
    return jsonify(matchup)

if __name__ == '__main__':
    app.run(debug=True, port=5000)