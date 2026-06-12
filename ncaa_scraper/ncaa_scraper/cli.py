"""Command-line interface for NCAA scraper"""

import argparse
import json
import os
from datetime import datetime
import numpy as np

from .scraper import (
    GameScraper, 
    TeamScraper, 
    SeasonScraper,
    PlayerScraper,
    TeamStatsScraper,
    ConferenceScraper,
    MatchupScraper
)
from .visualizations import ShotChart
from .stats import GameStats


class NumpyEncoder(json.JSONEncoder):
    """Custom JSON encoder that handles numpy types"""
    def default(self, obj):
        if isinstance(obj, (np.int_, np.intc, np.intp, np.int8,
                          np.int16, np.int32, np.int64, np.uint8,
                          np.uint16, np.uint32, np.uint64)):
            return int(obj)
        elif isinstance(obj, (np.float_, np.float16, np.float32, np.float64)):
            return float(obj)
        elif isinstance(obj, (np.ndarray,)):
            return obj.tolist()
        return json.JSONEncoder.default(self, obj)


def scrape_game(game_id: str, output_dir: str = "./output"):
    """Scrape a single game and save data"""
    print(f"Scraping game {game_id}...")
    
    scraper = GameScraper()
    game_data = scraper.scrape_game(game_id)
    
    # Create output directory
    game_dir = os.path.join(output_dir, f"game_{game_id}")
    os.makedirs(game_dir, exist_ok=True)
    
    # Save raw data
    with open(os.path.join(game_dir, "raw_data.json"), "w") as f:
        json.dump(game_data, f, indent=2, cls=NumpyEncoder)
    
    # Generate statistics
    stats = GameStats(game_data)
    game_summary = stats.export_for_frontend()
    
    with open(os.path.join(game_dir, "game_summary.json"), "w") as f:
        json.dump(game_summary, f, indent=2, cls=NumpyEncoder)
    
    # Generate visualizations
    if game_data.get('shots'):
        chart = ShotChart(game_data['shots'])
        
        # Save full court chart
        fig_full = chart.create_full_court_chart(
            title=f"Shot Chart - Game {game_id}"
        )
        fig_full.write_html(os.path.join(game_dir, "shot_chart_full.html"))
        
        # Save half court chart
        fig_half = chart.create_half_court_chart(
            title=f"Shot Chart (Half Court) - Game {game_id}"
        )
        fig_half.write_html(os.path.join(game_dir, "shot_chart_half.html"))
        
        # Save heatmap
        fig_heat = chart.create_heatmap()
        fig_heat.write_html(os.path.join(game_dir, "shot_heatmap.html"))
        
        # Export shot data for frontend
        shot_export = chart.export_to_json()
        with open(os.path.join(game_dir, "shot_data.json"), "w") as f:
            json.dump(shot_export, f, indent=2, cls=NumpyEncoder)
    
    print(f"Game {game_id} scraped successfully!")
    print(f"Output saved to: {game_dir}")


def scrape_team(team_id: str, output_dir: str = "./output"):
    """Scrape team schedule and roster"""
    print(f"Scraping team {team_id}...")
    
    scraper = TeamScraper()
    
    # Get schedule
    schedule = scraper.scrape_team_schedule(team_id)
    roster = scraper.scrape_team_roster(team_id)
    
    # Save data
    team_dir = os.path.join(output_dir, f"team_{team_id}")
    os.makedirs(team_dir, exist_ok=True)
    
    with open(os.path.join(team_dir, "schedule.json"), "w") as f:
        json.dump(schedule, f, indent=2, cls=NumpyEncoder)
    
    with open(os.path.join(team_dir, "roster.json"), "w") as f:
        json.dump(roster, f, indent=2, cls=NumpyEncoder)
    
    print(f"Team {team_id} scraped successfully!")
    print(f"Found {len(schedule)} games and {len(roster)} players")


def scrape_season(season_id: str = "16440", output_dir: str = "./output"):
    """Scrape all teams for a season"""
    print(f"Scraping season {season_id}...")
    
    scraper = SeasonScraper()
    teams = scraper.get_all_teams(season_id)
    
    # Save teams list
    season_dir = os.path.join(output_dir, f"season_{season_id}")
    os.makedirs(season_dir, exist_ok=True)
    
    with open(os.path.join(season_dir, "teams.json"), "w") as f:
        json.dump(teams, f, indent=2, cls=NumpyEncoder)
    
    print(f"Found {len(teams)} teams")
    
    # Optionally scrape each team's data
    for i, team in enumerate(teams[:5]):  # Limit to first 5 for testing
        print(f"Scraping team {i+1}/{5}: {team['name']}...")
        scrape_team(team['id'], season_dir)


def scrape_player(player_id: str, season_id: str = "16440", output_dir: str = "./output"):
    """Scrape player statistics"""
    print(f"Scraping player {player_id} for season {season_id}...")
    
    scraper = PlayerScraper()
    
    # Get season stats
    season_stats = scraper.scrape_player_season_stats(player_id, season_id)
    career_stats = scraper.scrape_player_career_stats(player_id)
    
    # Save data
    player_dir = os.path.join(output_dir, f"player_{player_id}")
    os.makedirs(player_dir, exist_ok=True)
    
    with open(os.path.join(player_dir, f"season_{season_id}_stats.json"), "w") as f:
        json.dump(season_stats, f, indent=2, cls=NumpyEncoder)
    
    with open(os.path.join(player_dir, "career_stats.json"), "w") as f:
        json.dump(career_stats, f, indent=2, cls=NumpyEncoder)
    
    print(f"Player {player_id} scraped successfully!")
    if season_stats['season_averages']:
        print(f"Season averages: {season_stats['season_averages'].get('pts_per_game', 0)} PPG, "
              f"{season_stats['season_averages'].get('reb_per_game', 0)} RPG, "
              f"{season_stats['season_averages'].get('ast_per_game', 0)} APG")


def scrape_team_stats(team_id: str, season_id: str = "16440", output_dir: str = "./output"):
    """Scrape team season statistics"""
    print(f"Scraping team {team_id} statistics for season {season_id}...")
    
    scraper = TeamStatsScraper()
    
    # Get team stats
    team_stats = scraper.scrape_team_season_stats(team_id, season_id)
    
    # Save data
    team_dir = os.path.join(output_dir, f"team_{team_id}")
    os.makedirs(team_dir, exist_ok=True)
    
    with open(os.path.join(team_dir, f"season_{season_id}_stats.json"), "w") as f:
        json.dump(team_stats, f, indent=2, cls=NumpyEncoder)
    
    print(f"Team {team_id} statistics scraped successfully!")
    if team_stats['team_averages']:
        print(f"Team averages: {team_stats['team_averages'].get('ppg', 0)} PPG, "
              f"{team_stats['team_averages'].get('rpg', 0)} RPG, "
              f"{team_stats['team_averages'].get('apg', 0)} APG")
    if team_stats['rankings']:
        print(f"Efficiency: Off {team_stats['rankings'].get('offensive_efficiency', 0)}, "
              f"Def {team_stats['rankings'].get('defensive_efficiency', 0)}, "
              f"Net {team_stats['rankings'].get('net_rating', 0)}")


def scrape_rankings(season_id: str = "16440", output_dir: str = "./output"):
    """Scrape national rankings"""
    print(f"Scraping national rankings for season {season_id}...")
    
    scraper = TeamStatsScraper()
    
    # Get rankings
    rankings = scraper.scrape_team_rankings(season_id)
    
    # Save data
    season_dir = os.path.join(output_dir, f"season_{season_id}")
    os.makedirs(season_dir, exist_ok=True)
    
    with open(os.path.join(season_dir, "rankings.json"), "w") as f:
        json.dump(rankings, f, indent=2, cls=NumpyEncoder)
    
    print(f"Found rankings for {len(rankings)} teams")
    if rankings:
        print("Top 5 teams:")
        for team in rankings[:5]:
            print(f"  {team['rank']}. {team['team_name']} ({team['record']})")


def scrape_conference(conference_id: str, season_id: str = "16440", output_dir: str = "./output"):
    """Scrape conference standings"""
    print(f"Scraping conference {conference_id} standings for season {season_id}...")
    
    scraper = ConferenceScraper()
    
    # Get standings
    standings = scraper.scrape_conference_standings(conference_id, season_id)
    
    # Save data
    conf_dir = os.path.join(output_dir, f"conference_{conference_id}")
    os.makedirs(conf_dir, exist_ok=True)
    
    with open(os.path.join(conf_dir, f"season_{season_id}_standings.json"), "w") as f:
        json.dump(standings, f, indent=2, cls=NumpyEncoder)
    
    print(f"Conference {conference_id} standings scraped successfully!")
    if standings['teams']:
        print(f"Found {len(standings['teams'])} teams in standings")


def scrape_conferences(season_id: str = "16440", output_dir: str = "./output"):
    """Scrape all conferences"""
    print(f"Scraping all conferences for season {season_id}...")
    
    scraper = ConferenceScraper()
    
    # Get all conferences
    conferences = scraper.get_all_conferences(season_id)
    
    # Save data
    season_dir = os.path.join(output_dir, f"season_{season_id}")
    os.makedirs(season_dir, exist_ok=True)
    
    with open(os.path.join(season_dir, "conferences.json"), "w") as f:
        json.dump(conferences, f, indent=2, cls=NumpyEncoder)
    
    print(f"Found {len(conferences)} conferences")
    for conf in conferences[:10]:  # Show first 10
        print(f"  - {conf['name']} (ID: {conf['id']})")


def scrape_matchup(team1_id: str, team2_id: str, output_dir: str = "./output"):
    """Scrape head-to-head matchup history"""
    print(f"Scraping matchup history between {team1_id} and {team2_id}...")
    
    scraper = MatchupScraper()
    
    # Get matchup data
    matchup = scraper.scrape_head_to_head(team1_id, team2_id)
    
    # Save data
    matchup_dir = os.path.join(output_dir, "matchups")
    os.makedirs(matchup_dir, exist_ok=True)
    
    with open(os.path.join(matchup_dir, f"{team1_id}_vs_{team2_id}.json"), "w") as f:
        json.dump(matchup, f, indent=2, cls=NumpyEncoder)
    
    print(f"Matchup history scraped successfully!")
    if matchup['all_time_record']:
        print(f"All-time record: Team 1 wins {matchup['all_time_record']['team1_wins']}, "
              f"Team 2 wins {matchup['all_time_record']['team2_wins']}")
    if matchup['statistics']:
        print(f"Average scores: {matchup['statistics']['avg_team1_score']} - "
              f"{matchup['statistics']['avg_team2_score']}")


def main():
    """Main CLI entry point"""
    parser = argparse.ArgumentParser(description="NCAA Basketball Data Scraper")
    subparsers = parser.add_subparsers(dest="command", help="Commands")
    
    # Game scraper
    game_parser = subparsers.add_parser("game", help="Scrape a single game")
    game_parser.add_argument("game_id", help="NCAA game ID")
    game_parser.add_argument("-o", "--output", default="./output", help="Output directory")
    
    # Team scraper
    team_parser = subparsers.add_parser("team", help="Scrape team schedule and roster")
    team_parser.add_argument("team_id", help="NCAA team ID")
    team_parser.add_argument("-o", "--output", default="./output", help="Output directory")
    
    # Team stats scraper
    team_stats_parser = subparsers.add_parser("team-stats", help="Scrape team season statistics")
    team_stats_parser.add_argument("team_id", help="NCAA team ID")
    team_stats_parser.add_argument("-s", "--season-id", default="16440", help="Season ID")
    team_stats_parser.add_argument("-o", "--output", default="./output", help="Output directory")
    
    # Player scraper
    player_parser = subparsers.add_parser("player", help="Scrape player statistics")
    player_parser.add_argument("player_id", help="NCAA player ID")
    player_parser.add_argument("-s", "--season-id", default="16440", help="Season ID")
    player_parser.add_argument("-o", "--output", default="./output", help="Output directory")
    
    # Season scraper
    season_parser = subparsers.add_parser("season", help="Scrape all teams for a season")
    season_parser.add_argument("-s", "--season-id", default="16440", help="Season ID")
    season_parser.add_argument("-o", "--output", default="./output", help="Output directory")
    
    # Rankings scraper
    rankings_parser = subparsers.add_parser("rankings", help="Scrape national rankings")
    rankings_parser.add_argument("-s", "--season-id", default="16440", help="Season ID")
    rankings_parser.add_argument("-o", "--output", default="./output", help="Output directory")
    
    # Conference scraper
    conference_parser = subparsers.add_parser("conference", help="Scrape conference standings")
    conference_parser.add_argument("conference_id", help="NCAA conference ID")
    conference_parser.add_argument("-s", "--season-id", default="16440", help="Season ID")
    conference_parser.add_argument("-o", "--output", default="./output", help="Output directory")
    
    # All conferences scraper
    conferences_parser = subparsers.add_parser("conferences", help="List all conferences")
    conferences_parser.add_argument("-s", "--season-id", default="16440", help="Season ID")
    conferences_parser.add_argument("-o", "--output", default="./output", help="Output directory")
    
    # Matchup scraper
    matchup_parser = subparsers.add_parser("matchup", help="Scrape head-to-head matchup history")
    matchup_parser.add_argument("team1_id", help="First team ID")
    matchup_parser.add_argument("team2_id", help="Second team ID")
    matchup_parser.add_argument("-o", "--output", default="./output", help="Output directory")
    
    args = parser.parse_args()
    
    if args.command == "game":
        scrape_game(args.game_id, args.output)
    elif args.command == "team":
        scrape_team(args.team_id, args.output)
    elif args.command == "team-stats":
        scrape_team_stats(args.team_id, args.season_id, args.output)
    elif args.command == "player":
        scrape_player(args.player_id, args.season_id, args.output)
    elif args.command == "season":
        scrape_season(args.season_id, args.output)
    elif args.command == "rankings":
        scrape_rankings(args.season_id, args.output)
    elif args.command == "conference":
        scrape_conference(args.conference_id, args.season_id, args.output)
    elif args.command == "conferences":
        scrape_conferences(args.season_id, args.output)
    elif args.command == "matchup":
        scrape_matchup(args.team1_id, args.team2_id, args.output)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()