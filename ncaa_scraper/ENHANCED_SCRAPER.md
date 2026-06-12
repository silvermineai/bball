# Enhanced NCAA Basketball Scraper

## New Data Collection Capabilities

The NCAA scraper has been significantly enhanced to collect comprehensive basketball statistics. Here's what's now available:

### 1. Player Statistics
- **Season Stats**: Complete game-by-game logs with shooting, rebounding, assists, steals, blocks
- **Career Stats**: Historical performance across all seasons
- **Shooting Percentages**: FG%, 3P%, FT%
- **Per-Game Averages**: Points, rebounds, assists per game

### 2. Team Statistics
- **Season Averages**: Team and opponent statistics
- **Efficiency Metrics**: Offensive/defensive efficiency ratings
- **Advanced Stats**: Pace, net rating calculations
- **Rankings**: National team rankings and poll positions

### 3. Conference Data
- **Standings**: Conference win/loss records
- **Team Rankings**: Within conference performance
- **Win Percentages**: Conference and overall records
- **Streaks**: Current winning/losing streaks

### 4. Head-to-Head Matchups
- **Historical Records**: All-time series between teams
- **Recent Games**: Detailed game results history
- **Average Scores**: Historical scoring averages
- **Trends**: Performance patterns in matchups

## CLI Commands

### Basic Commands
```bash
# Scrape a single game
uv run ncaa-scraper game <game_id>

# Scrape team schedule and roster
uv run ncaa-scraper team <team_id>

# Get all teams in a season
uv run ncaa-scraper season -s <season_id>
```

### New Enhanced Commands
```bash
# Player statistics
uv run ncaa-scraper player <player_id> -s <season_id>

# Team season statistics
uv run ncaa-scraper team-stats <team_id> -s <season_id>

# National rankings
uv run ncaa-scraper rankings -s <season_id>

# Conference standings
uv run ncaa-scraper conference <conference_id> -s <season_id>

# List all conferences
uv run ncaa-scraper conferences -s <season_id>

# Head-to-head matchup history
uv run ncaa-scraper matchup <team1_id> <team2_id>
```

## Output Format

All data is saved as JSON files in the output directory:
- `game_<id>/`: Individual game data with box scores, play-by-play, shot charts
- `player_<id>/`: Player season and career statistics
- `team_<id>/`: Team schedule, roster, and season statistics
- `conference_<id>/`: Conference standings
- `matchups/`: Head-to-head historical data
- `season_<id>/`: Season-wide data including teams, rankings, conferences

## Data Structure Examples

### Player Season Stats
```json
{
  "player_id": "12345",
  "season_id": "16440",
  "game_stats": [...],
  "season_averages": {
    "pts_per_game": 15.2,
    "reb_per_game": 6.3,
    "ast_per_game": 3.1,
    "fg_percentage": 45.6,
    "3p_percentage": 38.2,
    "ft_percentage": 78.4
  }
}
```

### Team Statistics
```json
{
  "team_id": "456",
  "season_id": "16440",
  "team_averages": {
    "ppg": 78.5,
    "rpg": 38.2,
    "apg": 15.3,
    "fg_pct": 46.2
  },
  "opponent_averages": {...},
  "rankings": {
    "offensive_efficiency": 108.3,
    "defensive_efficiency": 98.6,
    "net_rating": 9.7
  }
}
```

### Conference Standings
```json
{
  "conference_id": "789",
  "teams": [
    {
      "team_name": "Team A",
      "conference_wins": 12,
      "conference_losses": 3,
      "overall_wins": 24,
      "overall_losses": 6,
      "streak": "W3"
    }
  ]
}
```

## Usage Tips

1. **Season IDs**: Default is "16440" (2024-25 season). Check NCAA site for other season codes.

2. **Finding IDs**: Team and player IDs can be found from NCAA URLs:
   - Team: `https://stats.ncaa.org/teams/12345` → ID is `12345`
   - Player: `https://stats.ncaa.org/players/67890` → ID is `67890`

3. **Caching**: Data is cached locally to avoid repeated requests. Delete the `cache/` directory to force fresh data.

4. **Rate Limiting**: The scraper includes delays to be respectful of the NCAA servers.

## Future Enhancements

Potential additions:
- Live game tracking
- Injury reports (if available)
- Coaching staff information
- Recruiting data
- Tournament brackets
- Historical trends analysis

## Notes

- The scraper targets `stats.ncaa.org` which contains official NCAA statistics
- Data availability depends on what the NCAA provides publicly
- Some endpoints may require authentication or may not exist
- Always verify scraped data against the official site