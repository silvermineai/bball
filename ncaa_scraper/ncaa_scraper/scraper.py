"""NCAA Basketball Web Scraper"""

import re
import os
import json
from typing import List, Dict, Optional, Tuple
from datetime import datetime
import logging
from io import StringIO

import requests
from requests.adapters import HTTPAdapter
from requests.packages.urllib3.util.retry import Retry
from bs4 import BeautifulSoup
import pandas as pd
import polars as pl
import time

logger = logging.getLogger(__name__)


class BaseScraper:
    """Base scraper with common functionality"""
    
    def __init__(self, cache_dir: str = "./cache"):
        self.base_url = "https://stats.ncaa.org"
        self.cache_dir = cache_dir
        os.makedirs(cache_dir, exist_ok=True)
        
        # Create session with retry strategy
        self.session = requests.Session()
        retry_strategy = Retry(
            total=3,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["HEAD", "GET", "OPTIONS"],
            backoff_factor=1
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)
        
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Cache-Control': 'max-age=0',
            'DNT': '1'
        }
        self.session.headers.update(self.headers)
    
    def _get_cached_or_fetch(self, url: str, cache_key: str) -> str:
        """Get content from cache or fetch from web"""
        cache_path = os.path.join(self.cache_dir, f"{cache_key}.html")
        
        if os.path.exists(cache_path):
            logger.info(f"Using cached data for {cache_key}")
            with open(cache_path, 'r', encoding='utf-8') as f:
                return f.read()
        
        logger.info(f"Fetching data from {url}")
        
        # First visit the main page to establish session
        if not hasattr(self, '_session_established'):
            logger.info("Establishing session with main page")
            main_response = self.session.get(self.base_url, timeout=30)
            self._session_established = True
            time.sleep(2)
        
        # Add small delay to be respectful
        time.sleep(1)
        
        # Update referer header for this specific request
        self.session.headers.update({
            'Referer': self.base_url,
            'Sec-Fetch-Site': 'same-origin'
        })
        
        response = self.session.get(url, timeout=30)
        
        # Check if we got the Akamai challenge page
        if 'akamai_validation' in response.text or 'bm-verify' in response.text:
            logger.warning(f"Got Akamai challenge page for {url}")
            # Try once more with different headers
            self.session.headers.update({
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                'Sec-Ch-Ua-Mobile': '?0',
                'Sec-Ch-Ua-Platform': '"macOS"'
            })
            time.sleep(3)
            response = self.session.get(url, timeout=30)
        
        response.raise_for_status()
        
        with open(cache_path, 'w', encoding='utf-8') as f:
            f.write(response.text)
        
        return response.text


class GameScraper(BaseScraper):
    """Scraper for individual game data"""
    
    def scrape_game(self, game_id: str) -> Dict:
        """Scrape all data for a single game"""
        game_data = {
            'id': game_id,
            'box_score': self._scrape_box_score(game_id),
            'play_by_play': self._scrape_play_by_play(game_id),
            'shots': self._scrape_shots(game_id),
        }
        return game_data
    
    def _scrape_box_score(self, game_id: str) -> Dict:
        """Scrape box score data"""
        url = f"{self.base_url}/contests/{game_id}/box_score"
        html = self._get_cached_or_fetch(url, f"game_{game_id}_box")
        soup = BeautifulSoup(html, 'html.parser')
        
        # Parse team names and scores
        team_headers = soup.find_all('td', {'class': 'heading'})
        away_team = team_headers[0].text.strip() if len(team_headers) > 0 else "Away"
        home_team = team_headers[1].text.strip() if len(team_headers) > 1 else "Home"
        
        # Parse player stats tables
        tables = soup.find_all('table', {'class': 'mytable'})
        
        box_score = {
            'away_team': {
                'name': away_team,
                'players': self._parse_player_stats_table(tables[0]) if len(tables) > 0 else []
            },
            'home_team': {
                'name': home_team,
                'players': self._parse_player_stats_table(tables[1]) if len(tables) > 1 else []
            }
        }
        
        return box_score
    
    def _parse_player_stats_table(self, table) -> List[Dict]:
        """Parse player statistics from HTML table"""
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
        
        return players
    
    def _scrape_play_by_play(self, game_id: str) -> List[Dict]:
        """Scrape play-by-play data"""
        url = f"{self.base_url}/contests/{game_id}/play_by_play"
        html = self._get_cached_or_fetch(url, f"game_{game_id}_pbp")
        soup = BeautifulSoup(html, 'html.parser')
        
        plays = []
        tables = soup.find_all('table')
        halves = [table for table in tables if 'Time' in str(table)]
        
        for half_num, half_table in enumerate(halves, 1):
            df = pd.read_html(StringIO(str(half_table)))[0]
            
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
    
    def _scrape_shots(self, game_id: str) -> List[Dict]:
        """Extract shot chart data from box score HTML"""
        url = f"{self.base_url}/contests/{game_id}/box_score"
        html = self._get_cached_or_fetch(url, f"game_{game_id}_box")
        
        # Extract addShot() calls from JavaScript
        shots = []
        script_pattern = re.compile(r'addShot\((.*?)\);', re.DOTALL)
        matches = script_pattern.findall(html)
        
        for match in matches:
            try:
                # Skip function definition
                if 'function' in match or match.strip().startswith('x'):
                    continue
                    
                params = self._parse_js_params(match)
                if len(params) >= 8:
                    shots.append({
                        'x': float(params[0]),
                        'y': float(params[1]),
                        'team_id': int(params[2]),
                        'made': params[3].lower() == 'true',
                        'shot_id': int(params[4]),
                        'description': params[5],
                        'tags': params[6],
                        'is_three': params[7].lower() == 'true'
                    })
            except (ValueError, IndexError) as e:
                logger.warning(f"Failed to parse shot data: {match[:50]}... Error: {e}")
        
        return shots
    
    def _parse_js_params(self, params_str: str) -> List[str]:
        """Parse JavaScript function parameters"""
        params = []
        current_param = ""
        in_string = False
        
        for char in params_str:
            if char in ["'", '"']:
                in_string = not in_string
            elif char == ',' and not in_string:
                params.append(current_param.strip())
                current_param = ""
            else:
                current_param += char
        
        if current_param:
            params.append(current_param.strip())
        
        # Remove quotes from string parameters
        cleaned_params = []
        for param in params:
            if param.startswith(("'", '"')) and param.endswith(("'", '"')):
                cleaned_params.append(param[1:-1])
            else:
                cleaned_params.append(param)
        
        return cleaned_params


class TeamScraper(BaseScraper):
    """Scraper for team data"""
    
    def scrape_team_schedule(self, team_id: str) -> List[Dict]:
        """Scrape team's game schedule"""
        url = f"{self.base_url}/teams/{team_id}"
        html = self._get_cached_or_fetch(url, f"team_{team_id}_schedule")
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
    
    def scrape_team_roster(self, team_id: str) -> List[Dict]:
        """Scrape team roster"""
        url = f"{self.base_url}/teams/{team_id}/roster"
        html = self._get_cached_or_fetch(url, f"team_{team_id}_roster")
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


class PlayerScraper(BaseScraper):
    """Scraper for player data"""
    
    def scrape_player_season_stats(self, player_id: str, season_id: str = "16440") -> Dict:
        """Scrape player's season statistics"""
        url = f"{self.base_url}/players/{player_id}/season_stats/{season_id}"
        html = self._get_cached_or_fetch(url, f"player_{player_id}_{season_id}_stats")
        soup = BeautifulSoup(html, 'html.parser')
        
        stats = {
            'player_id': player_id,
            'season_id': season_id,
            'game_stats': [],
            'season_averages': {}
        }
        
        # Parse game log table
        game_log_table = soup.find('table', {'id': 'game_log_div'})
        if game_log_table:
            for row in game_log_table.find('tbody').find_all('tr'):
                cells = row.find_all('td')
                if len(cells) >= 20 and 'Totals' not in cells[0].text:
                    game = {
                        'date': cells[0].text.strip(),
                        'opponent': cells[1].text.strip(),
                        'result': cells[2].text.strip() if len(cells) > 2 else '',
                        'minutes': cells[3].text.strip() if len(cells) > 3 else '0',
                        'fgm': int(cells[4].text.strip() or 0) if len(cells) > 4 else 0,
                        'fga': int(cells[5].text.strip() or 0) if len(cells) > 5 else 0,
                        '3pm': int(cells[6].text.strip() or 0) if len(cells) > 6 else 0,
                        '3pa': int(cells[7].text.strip() or 0) if len(cells) > 7 else 0,
                        'ftm': int(cells[8].text.strip() or 0) if len(cells) > 8 else 0,
                        'fta': int(cells[9].text.strip() or 0) if len(cells) > 9 else 0,
                        'pts': int(cells[10].text.strip() or 0) if len(cells) > 10 else 0,
                        'oreb': int(cells[11].text.strip() or 0) if len(cells) > 11 else 0,
                        'dreb': int(cells[12].text.strip() or 0) if len(cells) > 12 else 0,
                        'reb': int(cells[13].text.strip() or 0) if len(cells) > 13 else 0,
                        'ast': int(cells[14].text.strip() or 0) if len(cells) > 14 else 0,
                        'to': int(cells[15].text.strip() or 0) if len(cells) > 15 else 0,
                        'stl': int(cells[16].text.strip() or 0) if len(cells) > 16 else 0,
                        'blk': int(cells[17].text.strip() or 0) if len(cells) > 17 else 0,
                        'pf': int(cells[18].text.strip() or 0) if len(cells) > 18 else 0,
                    }
                    stats['game_stats'].append(game)
        
        # Calculate season averages
        if stats['game_stats']:
            num_games = len(stats['game_stats'])
            stat_keys = ['pts', 'reb', 'ast', 'stl', 'blk', 'to', 'fgm', 'fga', '3pm', '3pa', 'ftm', 'fta']
            for key in stat_keys:
                total = sum(game.get(key, 0) for game in stats['game_stats'])
                stats['season_averages'][f'{key}_per_game'] = round(total / num_games, 1)
            
            # Calculate shooting percentages
            total_fgm = sum(game.get('fgm', 0) for game in stats['game_stats'])
            total_fga = sum(game.get('fga', 0) for game in stats['game_stats'])
            total_3pm = sum(game.get('3pm', 0) for game in stats['game_stats'])
            total_3pa = sum(game.get('3pa', 0) for game in stats['game_stats'])
            total_ftm = sum(game.get('ftm', 0) for game in stats['game_stats'])
            total_fta = sum(game.get('fta', 0) for game in stats['game_stats'])
            
            stats['season_averages']['fg_percentage'] = round(total_fgm / total_fga * 100, 1) if total_fga > 0 else 0
            stats['season_averages']['3p_percentage'] = round(total_3pm / total_3pa * 100, 1) if total_3pa > 0 else 0
            stats['season_averages']['ft_percentage'] = round(total_ftm / total_fta * 100, 1) if total_fta > 0 else 0
        
        return stats
    
    def scrape_player_career_stats(self, player_id: str) -> Dict:
        """Scrape player's career statistics across all seasons"""
        url = f"{self.base_url}/players/{player_id}/career_statistics"
        html = self._get_cached_or_fetch(url, f"player_{player_id}_career")
        soup = BeautifulSoup(html, 'html.parser')
        
        career = {
            'player_id': player_id,
            'seasons': []
        }
        
        career_table = soup.find('table', {'id': 'career_statistics_div'})
        if career_table:
            for row in career_table.find('tbody').find_all('tr'):
                cells = row.find_all('td')
                if len(cells) >= 15 and 'Career' not in cells[0].text:
                    season = {
                        'year': cells[0].text.strip(),
                        'team': cells[1].text.strip() if len(cells) > 1 else '',
                        'games': int(cells[2].text.strip() or 0) if len(cells) > 2 else 0,
                        'ppg': float(cells[3].text.strip() or 0) if len(cells) > 3 else 0,
                        'rpg': float(cells[4].text.strip() or 0) if len(cells) > 4 else 0,
                        'apg': float(cells[5].text.strip() or 0) if len(cells) > 5 else 0,
                        'fg_pct': float(cells[6].text.strip() or 0) if len(cells) > 6 else 0,
                        '3p_pct': float(cells[7].text.strip() or 0) if len(cells) > 7 else 0,
                        'ft_pct': float(cells[8].text.strip() or 0) if len(cells) > 8 else 0,
                    }
                    career['seasons'].append(season)
        
        return career


class TeamStatsScraper(BaseScraper):
    """Scraper for team statistics and rankings"""
    
    def scrape_team_season_stats(self, team_id: str, season_id: str = "16440") -> Dict:
        """Scrape team's season statistics"""
        url = f"{self.base_url}/teams/{team_id}/statistics/{season_id}"
        html = self._get_cached_or_fetch(url, f"team_{team_id}_{season_id}_stats")
        soup = BeautifulSoup(html, 'html.parser')
        
        stats = {
            'team_id': team_id,
            'season_id': season_id,
            'overall_record': {},
            'conference_record': {},
            'team_averages': {},
            'opponent_averages': {},
            'rankings': {}
        }
        
        # Parse team statistics table
        stats_table = soup.find('table', {'id': 'team_stats_div'})
        if stats_table:
            rows = stats_table.find('tbody').find_all('tr')
            if len(rows) >= 2:
                # Team stats (first row)
                team_cells = rows[0].find_all('td')
                if len(team_cells) >= 15:
                    stats['team_averages'] = {
                        'ppg': float(team_cells[1].text.strip() or 0),
                        'fgm': float(team_cells[2].text.strip() or 0),
                        'fga': float(team_cells[3].text.strip() or 0),
                        'fg_pct': float(team_cells[4].text.strip() or 0),
                        '3pm': float(team_cells[5].text.strip() or 0),
                        '3pa': float(team_cells[6].text.strip() or 0),
                        '3p_pct': float(team_cells[7].text.strip() or 0),
                        'ftm': float(team_cells[8].text.strip() or 0),
                        'fta': float(team_cells[9].text.strip() or 0),
                        'ft_pct': float(team_cells[10].text.strip() or 0),
                        'rpg': float(team_cells[11].text.strip() or 0),
                        'apg': float(team_cells[12].text.strip() or 0),
                        'spg': float(team_cells[13].text.strip() or 0),
                        'bpg': float(team_cells[14].text.strip() or 0),
                        'topg': float(team_cells[15].text.strip() or 0) if len(team_cells) > 15 else 0
                    }
                
                # Opponent stats (second row)
                if len(rows) > 1:
                    opp_cells = rows[1].find_all('td')
                    if len(opp_cells) >= 15:
                        stats['opponent_averages'] = {
                            'ppg': float(opp_cells[1].text.strip() or 0),
                            'fgm': float(opp_cells[2].text.strip() or 0),
                            'fga': float(opp_cells[3].text.strip() or 0),
                            'fg_pct': float(opp_cells[4].text.strip() or 0),
                            '3pm': float(opp_cells[5].text.strip() or 0),
                            '3pa': float(opp_cells[6].text.strip() or 0),
                            '3p_pct': float(opp_cells[7].text.strip() or 0),
                            'ftm': float(opp_cells[8].text.strip() or 0),
                            'fta': float(opp_cells[9].text.strip() or 0),
                            'ft_pct': float(opp_cells[10].text.strip() or 0),
                            'rpg': float(opp_cells[11].text.strip() or 0),
                            'apg': float(opp_cells[12].text.strip() or 0),
                            'spg': float(opp_cells[13].text.strip() or 0),
                            'bpg': float(opp_cells[14].text.strip() or 0),
                            'topg': float(opp_cells[15].text.strip() or 0) if len(opp_cells) > 15 else 0
                        }
        
        # Calculate efficiency metrics
        if stats['team_averages'] and stats['opponent_averages']:
            # Offensive and defensive efficiency (points per 100 possessions estimate)
            team_poss = stats['team_averages']['fga'] - (stats['team_averages'].get('rpg', 0) * 0.3) + stats['team_averages'].get('topg', 0) + (0.475 * stats['team_averages']['fta'])
            stats['rankings']['offensive_efficiency'] = round((stats['team_averages']['ppg'] / team_poss) * 100, 1) if team_poss > 0 else 0
            stats['rankings']['defensive_efficiency'] = round((stats['opponent_averages']['ppg'] / team_poss) * 100, 1) if team_poss > 0 else 0
            stats['rankings']['net_rating'] = round(stats['rankings']['offensive_efficiency'] - stats['rankings']['defensive_efficiency'], 1)
        
        return stats
    
    def scrape_team_rankings(self, season_id: str = "16440") -> List[Dict]:
        """Scrape national team rankings"""
        url = f"{self.base_url}/rankings/basketball-men/d1/{season_id}/final"
        html = self._get_cached_or_fetch(url, f"rankings_{season_id}")
        soup = BeautifulSoup(html, 'html.parser')
        
        rankings = []
        ranking_table = soup.find('table', {'id': 'rankings_table'})
        
        if ranking_table:
            for row in ranking_table.find('tbody').find_all('tr'):
                cells = row.find_all('td')
                if len(cells) >= 4:
                    team_link = cells[1].find('a')
                    if team_link:
                        rankings.append({
                            'rank': int(cells[0].text.strip() or 0),
                            'team_id': team_link['href'].split('/')[-1],
                            'team_name': team_link.text.strip(),
                            'record': cells[2].text.strip() if len(cells) > 2 else '',
                            'points': int(cells[3].text.strip() or 0) if len(cells) > 3 else 0
                        })
        
        return rankings


class ConferenceScraper(BaseScraper):
    """Scraper for conference data"""
    
    def scrape_conference_standings(self, conference_id: str, season_id: str = "16440") -> Dict:
        """Scrape conference standings"""
        url = f"{self.base_url}/standings/{conference_id}/{season_id}"
        html = self._get_cached_or_fetch(url, f"conference_{conference_id}_{season_id}_standings")
        soup = BeautifulSoup(html, 'html.parser')
        
        standings = {
            'conference_id': conference_id,
            'season_id': season_id,
            'teams': []
        }
        
        standings_table = soup.find('table', {'id': 'standings_table'})
        if standings_table:
            for row in standings_table.find('tbody').find_all('tr'):
                cells = row.find_all('td')
                if len(cells) >= 8:
                    team_link = cells[0].find('a')
                    if team_link:
                        standings['teams'].append({
                            'team_id': team_link['href'].split('/')[-1],
                            'team_name': team_link.text.strip(),
                            'conference_wins': int(cells[1].text.strip() or 0),
                            'conference_losses': int(cells[2].text.strip() or 0),
                            'conference_pct': float(cells[3].text.strip() or 0),
                            'overall_wins': int(cells[4].text.strip() or 0),
                            'overall_losses': int(cells[5].text.strip() or 0),
                            'overall_pct': float(cells[6].text.strip() or 0),
                            'streak': cells[7].text.strip() if len(cells) > 7 else ''
                        })
        
        return standings
    
    def get_all_conferences(self, season_id: str = "16440") -> List[Dict]:
        """Get all conferences for a season"""
        url = f"{self.base_url}/standings/basketball-men/d1/{season_id}"
        html = self._get_cached_or_fetch(url, f"conferences_{season_id}")
        soup = BeautifulSoup(html, 'html.parser')
        
        conferences = []
        conf_links = soup.find_all('a', href=re.compile(r'/standings/\d+'))
        
        for link in conf_links:
            conf_id = link['href'].split('/')[-2]
            conferences.append({
                'id': conf_id,
                'name': link.text.strip()
            })
        
        return conferences


class MatchupScraper(BaseScraper):
    """Scraper for head-to-head matchup data"""
    
    def scrape_head_to_head(self, team1_id: str, team2_id: str) -> Dict:
        """Scrape historical matchup data between two teams"""
        url = f"{self.base_url}/teams/{team1_id}/head_to_head/{team2_id}"
        html = self._get_cached_or_fetch(url, f"h2h_{team1_id}_{team2_id}")
        soup = BeautifulSoup(html, 'html.parser')
        
        matchup = {
            'team1_id': team1_id,
            'team2_id': team2_id,
            'all_time_record': {},
            'recent_games': [],
            'statistics': {}
        }
        
        # Parse historical games
        games_table = soup.find('table', {'id': 'h2h_games'})
        if games_table:
            for row in games_table.find('tbody').find_all('tr'):
                cells = row.find_all('td')
                if len(cells) >= 5:
                    game_link = cells[0].find('a')
                    if game_link:
                        matchup['recent_games'].append({
                            'game_id': game_link['href'].split('/')[-2],
                            'date': cells[0].text.strip(),
                            'location': cells[1].text.strip() if len(cells) > 1 else '',
                            'winner': cells[2].text.strip() if len(cells) > 2 else '',
                            'score': cells[3].text.strip() if len(cells) > 3 else '',
                            'season': cells[4].text.strip() if len(cells) > 4 else ''
                        })
        
        # Calculate all-time record
        if matchup['recent_games']:
            team1_wins = sum(1 for game in matchup['recent_games'] if team1_id in game.get('winner', ''))
            team2_wins = len(matchup['recent_games']) - team1_wins
            matchup['all_time_record'] = {
                'team1_wins': team1_wins,
                'team2_wins': team2_wins,
                'total_games': len(matchup['recent_games'])
            }
            
            # Calculate average scores
            scores = []
            for game in matchup['recent_games']:
                score_parts = game.get('score', '').split('-')
                if len(score_parts) == 2:
                    try:
                        scores.append((int(score_parts[0]), int(score_parts[1])))
                    except ValueError:
                        pass
            
            if scores:
                avg_team1_score = sum(s[0] for s in scores) / len(scores)
                avg_team2_score = sum(s[1] for s in scores) / len(scores)
                matchup['statistics'] = {
                    'avg_team1_score': round(avg_team1_score, 1),
                    'avg_team2_score': round(avg_team2_score, 1),
                    'avg_total_points': round(avg_team1_score + avg_team2_score, 1)
                }
        
        return matchup


class SeasonScraper(BaseScraper):
    """Scraper for full season data"""
    
    def get_all_teams(self, season_id: str = "16440") -> List[Dict]:
        """Get all teams for a season"""
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