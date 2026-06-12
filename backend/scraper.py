import requests
from bs4 import BeautifulSoup
import json
import pandas as pd
import polars as pl
from datetime import datetime
import os
from typing import Dict, List, Optional, Tuple
import logging
import time
import re

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class NCAABasketballScraper:
    def __init__(self, cache_dir: str = "./data/cache"):
        self.base_url = "https://stats.ncaa.org"
        self.cache_dir = cache_dir
        os.makedirs(cache_dir, exist_ok=True)
        
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Cache-Control': 'max-age=0'
        }
        
    def _get_cached_or_fetch(self, url: str, cache_key: str) -> str:
        cache_path = os.path.join(self.cache_dir, f"{cache_key}.html")
        
        if os.path.exists(cache_path):
            logger.info(f"Using cached data for {cache_key}")
            with open(cache_path, 'r', encoding='utf-8') as f:
                return f.read()
        
        logger.info(f"Fetching data from {url}")
        response = requests.get(url, headers=self.headers)
        response.raise_for_status()
        
        with open(cache_path, 'w', encoding='utf-8') as f:
            f.write(response.text)
        
        time.sleep(1)  # Be nice to the server
        return response.text
    
    def get_seasons(self) -> List[Dict]:
        """Get available seasons from NCAA website"""
        url = f"{self.base_url}/game_upload/teamIndex"
        html = self._get_cached_or_fetch(url, "seasons_index")
        soup = BeautifulSoup(html, 'html.parser')
        
        seasons = []
        season_select = soup.find('select', {'name': 'academic_year'})
        if season_select:
            for option in season_select.find_all('option'):
                if option.get('value'):
                    seasons.append({
                        'id': option['value'],
                        'name': option.text.strip()
                    })
        
        return seasons
    
    def get_teams_for_season(self, season_id: str) -> List[Dict]:
        """Get all teams for a specific season"""
        url = f"{self.base_url}/teams?sport_code=MBB&academic_year={season_id}"
        html = self._get_cached_or_fetch(url, f"teams_{season_id}")
        soup = BeautifulSoup(html, 'html.parser')
        
        teams = []
        teams_table = soup.find('table', {'id': 'teams_table'})
        if teams_table:
            for row in teams_table.find('tbody').find_all('tr'):
                cells = row.find_all('td')
                if len(cells) >= 2:
                    team_link = cells[0].find('a')
                    if team_link:
                        team_id = team_link['href'].split('/')[-1]
                        teams.append({
                            'id': team_id,
                            'name': team_link.text.strip(),
                            'conference': cells[1].text.strip() if len(cells) > 1 else ''
                        })
        
        return teams
    
    def get_team_roster(self, team_id: str) -> List[Dict]:
        """Get roster for a specific team"""
        url = f"{self.base_url}/teams/{team_id}/roster"
        html = self._get_cached_or_fetch(url, f"roster_{team_id}")
        soup = BeautifulSoup(html, 'html.parser')
        
        roster = []
        roster_table = soup.find('table', {'id': 'roster_grid'})
        if roster_table:
            for row in roster_table.find('tbody').find_all('tr'):
                cells = row.find_all('td')
                if len(cells) >= 6:
                    player_link = cells[1].find('a')
                    if player_link:
                        player_id = player_link['href'].split('/')[-1]
                        roster.append({
                            'id': player_id,
                            'jersey': cells[0].text.strip(),
                            'name': player_link.text.strip(),
                            'position': cells[2].text.strip(),
                            'height': cells[3].text.strip(),
                            'weight': cells[4].text.strip(),
                            'class': cells[5].text.strip(),
                            'hometown': cells[6].text.strip() if len(cells) > 6 else ''
                        })
        
        return roster
    
    def get_team_schedule(self, team_id: str) -> List[Dict]:
        """Get schedule/games for a specific team"""
        url = f"{self.base_url}/teams/{team_id}"
        html = self._get_cached_or_fetch(url, f"schedule_{team_id}")
        soup = BeautifulSoup(html, 'html.parser')
        
        games = []
        schedule_table = soup.find('table', {'id': 'game_breakdown_div'})
        if schedule_table:
            for row in schedule_table.find('tbody').find_all('tr'):
                cells = row.find_all('td')
                if len(cells) >= 4:
                    game_link = cells[0].find('a')
                    if game_link and '/contests/' in game_link['href']:
                        game_id = game_link['href'].split('/')[-2]
                        games.append({
                            'id': game_id,
                            'date': cells[0].text.strip(),
                            'opponent': cells[1].text.strip(),
                            'result': cells[2].text.strip() if len(cells) > 2 else '',
                            'score': cells[3].text.strip() if len(cells) > 3 else ''
                        })
        
        return games
    
    def get_game_details(self, game_id: str) -> Dict:
        """Get detailed game information including box score and play-by-play"""
        box_score_url = f"{self.base_url}/contests/{game_id}/box_score"
        box_score_html = self._get_cached_or_fetch(box_score_url, f"game_{game_id}_box")
        
        pbp_url = f"{self.base_url}/contests/{game_id}/play_by_play"
        pbp_html = self._get_cached_or_fetch(pbp_url, f"game_{game_id}_pbp")
        
        return {
            'id': game_id,
            'box_score': self._parse_box_score(box_score_html),
            'play_by_play': self._parse_play_by_play(pbp_html),
            'shots': self._parse_shots(box_score_html)
        }
    
    def _parse_box_score(self, html: str) -> Dict:
        """Parse box score from HTML"""
        soup = BeautifulSoup(html, 'html.parser')
        box_score = {'home': {}, 'away': {}}
        
        # Find team names
        team_headers = soup.find_all('td', {'class': 'heading'})
        if len(team_headers) >= 2:
            box_score['away']['name'] = team_headers[0].text.strip()
            box_score['home']['name'] = team_headers[1].text.strip()
        
        # Parse player stats tables
        tables = soup.find_all('table', {'class': 'mytable'})
        for i, table in enumerate(tables[:2]):  # First two tables are player stats
            team = 'away' if i == 0 else 'home'
            players = []
            
            for row in table.find('tbody').find_all('tr'):
                cells = row.find_all('td')
                if len(cells) > 10 and cells[0].text.strip() not in ['Totals', 'Team']:
                    player = {
                        'name': cells[0].text.strip(),
                        'position': cells[1].text.strip() if len(cells) > 1 else '',
                        'minutes': cells[2].text.strip() if len(cells) > 2 else '0',
                        'fgm': int(cells[3].text.strip() or 0) if len(cells) > 3 else 0,
                        'fga': int(cells[4].text.strip() or 0) if len(cells) > 4 else 0,
                        '3pm': int(cells[5].text.strip() or 0) if len(cells) > 5 else 0,
                        '3pa': int(cells[6].text.strip() or 0) if len(cells) > 6 else 0,
                        'ftm': int(cells[7].text.strip() or 0) if len(cells) > 7 else 0,
                        'fta': int(cells[8].text.strip() or 0) if len(cells) > 8 else 0,
                        'pts': int(cells[9].text.strip() or 0) if len(cells) > 9 else 0,
                        'oreb': int(cells[10].text.strip() or 0) if len(cells) > 10 else 0,
                        'dreb': int(cells[11].text.strip() or 0) if len(cells) > 11 else 0,
                        'reb': int(cells[12].text.strip() or 0) if len(cells) > 12 else 0,
                        'ast': int(cells[13].text.strip() or 0) if len(cells) > 13 else 0,
                        'to': int(cells[14].text.strip() or 0) if len(cells) > 14 else 0,
                        'stl': int(cells[15].text.strip() or 0) if len(cells) > 15 else 0,
                        'blk': int(cells[16].text.strip() or 0) if len(cells) > 16 else 0,
                        'pf': int(cells[17].text.strip() or 0) if len(cells) > 17 else 0,
                    }
                    players.append(player)
            
            box_score[team]['players'] = players
        
        return box_score
    
    def _parse_play_by_play(self, html: str) -> List[Dict]:
        """Parse play-by-play data from HTML"""
        soup = BeautifulSoup(html, 'html.parser')
        plays = []
        
        tables = soup.find_all('table')
        halves = [table for table in tables if 'Time' in str(table)]
        
        for half_num, half_table in enumerate(halves, 1):
            df = pd.read_html(str(half_table))[0]
            
            for _, row in df.iterrows():
                play = {
                    'half': half_num,
                    'time': row.iloc[0],
                    'away_action': row.iloc[1] if pd.notna(row.iloc[1]) else '',
                    'score': row.iloc[2] if pd.notna(row.iloc[2]) else '',
                    'home_action': row.iloc[3] if pd.notna(row.iloc[3]) else ''
                }
                plays.append(play)
        
        return plays
    
    def _parse_shots(self, html: str) -> List[Dict]:
        """Extract shot chart data from HTML"""
        shots = []
        
        # Find all script tags
        script_pattern = re.compile(r'addShot\((.*?)\);', re.DOTALL)
        matches = script_pattern.findall(html)
        
        for match in matches:
            params = []
            current_param = ""
            in_string = False
            
            for char in match:
                if char in ["'", '"']:
                    in_string = not in_string
                    current_param += char
                elif char == ',' and not in_string:
                    params.append(current_param.strip())
                    current_param = ""
                else:
                    current_param += char
            
            if current_param:
                params.append(current_param.strip())
            
            if len(params) >= 8:
                shots.append({
                    'x': float(params[0]),
                    'y': float(params[1]),
                    'team_id': int(params[2]),
                    'made': params[3].lower() == 'true',
                    'shot_id': int(params[4]),
                    'description': params[5].strip("'\""),
                    'tags': params[6].strip("'\""),
                    'is_three': params[7].lower() == 'true'
                })
        
        return shots
    
    def scrape_season_data(self, season_id: str, output_dir: str = "./data"):
        """Scrape all data for a season"""
        os.makedirs(output_dir, exist_ok=True)
        
        # Get all teams
        teams = self.get_teams_for_season(season_id)
        logger.info(f"Found {len(teams)} teams for season {season_id}")
        
        all_games = {}
        all_rosters = {}
        
        for team in teams[:5]:  # Limit to 5 teams for testing
            logger.info(f"Processing team: {team['name']}")
            
            # Get roster
            roster = self.get_team_roster(team['id'])
            all_rosters[team['id']] = {
                'team': team,
                'roster': roster
            }
            
            # Get schedule
            games = self.get_team_schedule(team['id'])
            
            # Get game details
            for game in games[:3]:  # Limit to 3 games per team for testing
                if game['id'] not in all_games:
                    logger.info(f"Processing game: {game['id']}")
                    game_details = self.get_game_details(game['id'])
                    all_games[game['id']] = game_details
        
        # Save data
        with open(os.path.join(output_dir, f"season_{season_id}_games.json"), 'w') as f:
            json.dump(all_games, f, indent=2)
        
        with open(os.path.join(output_dir, f"season_{season_id}_rosters.json"), 'w') as f:
            json.dump(all_rosters, f, indent=2)
        
        logger.info(f"Scraped {len(all_games)} games and {len(all_rosters)} team rosters")

if __name__ == "__main__":
    scraper = NCAABasketballScraper()
    
    # Get available seasons
    seasons = scraper.get_seasons()
    if seasons:
        latest_season = seasons[0]
        logger.info(f"Scraping data for season: {latest_season['name']}")
        scraper.scrape_season_data(latest_season['id'])