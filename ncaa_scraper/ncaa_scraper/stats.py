"""Basketball statistics calculations and aggregations"""

from typing import List, Dict, Optional
import pandas as pd
import polars as pl


class PlayerStats:
    """Calculate player statistics from game data"""
    
    def __init__(self, play_by_play_data: List[Dict]):
        """Initialize with play-by-play data"""
        self.pbp_data = play_by_play_data
        self.df = self._prepare_data()
    
    def _prepare_data(self) -> pl.DataFrame:
        """Convert play-by-play to polars DataFrame"""
        # Combine home and away actions
        rows = []
        for play in self.pbp_data:
            if play['away_action']:
                rows.append({
                    'half': play['half'],
                    'time': play['time'],
                    'score': play['score'],
                    'description': play['away_action'],
                    'team': 'away'
                })
            if play['home_action']:
                rows.append({
                    'half': play['half'],
                    'time': play['time'],
                    'score': play['score'],
                    'description': play['home_action'],
                    'team': 'home'
                })
        
        if not rows:
            # Return empty DataFrame with proper schema
            return pl.DataFrame({
                'half': [],
                'time': [],
                'score': [],
                'description': [],
                'team': [],
                'player': []
            })
        
        df = pl.DataFrame(rows)
        
        # Extract player names
        df = df.with_columns(
            pl.col('description').str.extract(r'^([^,]+)').alias('player')
        )
        
        # Identify play types
        play_types = {
            'made': 'made',
            'missed': 'missed',
            'freethrow': 'freethrow',
            '2pt': '2pt',
            '3pt': '3pt',
            'rebound offensive': 'rebound_offensive',
            'rebound defensive': 'rebound_defensive',
            'assist': 'assist',
            'steal': 'steal',
            'block': 'block',
            'turnover': 'turnover',
            'foul': 'foul'
        }
        
        for key, col_name in play_types.items():
            df = df.with_columns(
                pl.col('description').str.contains(key, literal=False).alias(f'is_{col_name}')
            )
        
        # Additional calculated columns
        df = df.with_columns([
            (pl.col('is_2pt') & pl.col('is_made')).alias('is_2pt_made'),
            (pl.col('is_3pt') & pl.col('is_made')).alias('is_3pt_made'),
            (pl.col('is_freethrow') & pl.col('is_made')).alias('is_freethrow_made'),
            (pl.col('is_2pt') | pl.col('is_3pt')).alias('is_field_goal'),
            (pl.col('is_rebound_offensive') | pl.col('is_rebound_defensive')).alias('is_rebound')
        ])
        
        return df
    
    def get_player_summary(self) -> pl.DataFrame:
        """Get summary statistics for all players"""
        if len(self.df) == 0:
            # Return empty DataFrame with proper schema
            return pl.DataFrame({
                'team': [],
                'player': [],
                'PTS': [],
                'FGM': [],
                'FGA': [],
                '2PM': [],
                '2PA': [],
                '3PM': [],
                '3PA': [],
                'FTM': [],
                'FTA': [],
                'REB': [],
                'OREB': [],
                'DREB': [],
                'AST': [],
                'STL': [],
                'BLK': [],
                'TO': [],
                'PF': [],
                'FG%': [],
                '3P%': [],
                'FT%': []
            })
        
        # Check if columns exist before aggregation
        required_columns = ['is_2pt_made', 'is_2pt', 'is_3pt_made', 'is_3pt', 
                          'is_freethrow_made', 'is_freethrow', 'is_rebound_offensive',
                          'is_rebound_defensive', 'is_assist', 'is_steal', 'is_block',
                          'is_turnover', 'is_foul']
        
        if not all(col in self.df.columns for col in required_columns):
            return pl.DataFrame({
                'team': [],
                'player': [],
                'PTS': [],
                'FGM': [],
                'FGA': [],
                '2PM': [],
                '2PA': [],
                '3PM': [],
                '3PA': [],
                'FTM': [],
                'FTA': [],
                'REB': [],
                'OREB': [],
                'DREB': [],
                'AST': [],
                'STL': [],
                'BLK': [],
                'TO': [],
                'PF': [],
                'FG%': [],
                '3P%': [],
                'FT%': []
            })
        
        return (
            self.df
            .filter(pl.col('player').is_not_null())
            .group_by(['team', 'player'])
            .agg([
                # Scoring
                pl.col('is_2pt_made').sum().alias('2PM'),
                pl.col('is_2pt').sum().alias('2PA'),
                pl.col('is_3pt_made').sum().alias('3PM'),
                pl.col('is_3pt').sum().alias('3PA'),
                pl.col('is_freethrow_made').sum().alias('FTM'),
                pl.col('is_freethrow').sum().alias('FTA'),
                
                # Rebounds
                pl.col('is_rebound_offensive').sum().alias('OREB'),
                pl.col('is_rebound_defensive').sum().alias('DREB'),
                
                # Other stats
                pl.col('is_assist').sum().alias('AST'),
                pl.col('is_steal').sum().alias('STL'),
                pl.col('is_block').sum().alias('BLK'),
                pl.col('is_turnover').sum().alias('TO'),
                pl.col('is_foul').sum().alias('PF')
            ])
            .with_columns([
                # Calculate points
                ((pl.col('2PM') * 2) + (pl.col('3PM') * 3) + pl.col('FTM')).alias('PTS'),
                (pl.col('2PM') + pl.col('3PM')).alias('FGM'),
                (pl.col('2PA') + pl.col('3PA')).alias('FGA'),
                (pl.col('OREB') + pl.col('DREB')).alias('REB')
            ])
            .with_columns([
                # Calculate percentages
                (pl.col('FGM') / pl.col('FGA') * 100).round(1).alias('FG%'),
                (pl.col('3PM') / pl.col('3PA') * 100).round(1).alias('3P%'),
                (pl.col('FTM') / pl.col('FTA') * 100).round(1).alias('FT%')
            ])
            .sort('PTS', descending=True)
        )
    
    def get_shot_types(self) -> pl.DataFrame:
        """Analyze shot types for each player"""
        shot_types = [
            'jumpshot', 'layup', 'dunk', 'hookshot', 
            'stepbackjumpshot', 'pullupjumpshot', 'turnaroundjumpshot',
            'drivinglayup', 'fastbreak', 'fromturnover'
        ]
        
        # Add shot type columns
        df = self.df
        for shot_type in shot_types:
            df = df.with_columns(
                pl.col('description').str.contains(shot_type).alias(f'is_{shot_type}')
            )
        
        # Aggregate by player
        agg_exprs = []
        for shot_type in shot_types:
            agg_exprs.extend([
                (pl.col(f'is_{shot_type}') & pl.col('is_made')).sum().alias(f'{shot_type}_made'),
                pl.col(f'is_{shot_type}').sum().alias(f'{shot_type}_attempts')
            ])
        
        return (
            df
            .filter(pl.col('player').is_not_null())
            .group_by(['team', 'player'])
            .agg(agg_exprs)
        )


class TeamStats:
    """Calculate team statistics"""
    
    def __init__(self, box_score_data: Dict):
        """Initialize with box score data"""
        self.box_score = box_score_data
    
    def get_team_totals(self) -> Dict:
        """Calculate team totals from box score"""
        totals = {}
        
        for team_type in ['home_team', 'away_team']:
            team_data = self.box_score.get(team_type, {})
            players = team_data.get('players', [])
            
            team_stats = {
                'name': team_data.get('name', team_type),
                'fgm': sum(p['fgm'] for p in players),
                'fga': sum(p['fga'] for p in players),
                '3pm': sum(p['3pm'] for p in players),
                '3pa': sum(p['3pa'] for p in players),
                'ftm': sum(p['ftm'] for p in players),
                'fta': sum(p['fta'] for p in players),
                'oreb': sum(p['oreb'] for p in players),
                'dreb': sum(p['dreb'] for p in players),
                'reb': sum(p['reb'] for p in players),
                'ast': sum(p['ast'] for p in players),
                'stl': sum(p['stl'] for p in players),
                'blk': sum(p['blk'] for p in players),
                'to': sum(p['to'] for p in players),
                'pf': sum(p['pf'] for p in players),
                'pts': sum(p['pts'] for p in players)
            }
            
            # Calculate percentages
            team_stats['fg_pct'] = (team_stats['fgm'] / team_stats['fga'] * 100) if team_stats['fga'] > 0 else 0
            team_stats['3p_pct'] = (team_stats['3pm'] / team_stats['3pa'] * 100) if team_stats['3pa'] > 0 else 0
            team_stats['ft_pct'] = (team_stats['ftm'] / team_stats['fta'] * 100) if team_stats['fta'] > 0 else 0
            
            totals[team_type] = team_stats
        
        return totals
    
    def calculate_advanced_stats(self) -> Dict:
        """Calculate advanced team statistics"""
        totals = self.get_team_totals()
        advanced = {}
        
        for team_type, stats in totals.items():
            # Possessions estimate
            possessions = stats['fga'] - stats['oreb'] + stats['to'] + (0.44 * stats['fta'])
            
            # Offensive and defensive ratings would need opponent stats
            # For now, calculate what we can
            advanced[team_type] = {
                'possessions': possessions,
                'pace': possessions * 2,  # Rough estimate
                'offensive_reb_pct': (stats['oreb'] / (stats['oreb'] + stats['dreb']) * 100) if (stats['oreb'] + stats['dreb']) > 0 else 0,
                'turnover_pct': (stats['to'] / possessions * 100) if possessions > 0 else 0,
                'free_throw_rate': (stats['fta'] / stats['fga']) if stats['fga'] > 0 else 0,
                'effective_fg_pct': ((stats['fgm'] + 0.5 * stats['3pm']) / stats['fga'] * 100) if stats['fga'] > 0 else 0,
                'true_shooting_pct': (stats['pts'] / (2 * (stats['fga'] + 0.44 * stats['fta'])) * 100) if (stats['fga'] + 0.44 * stats['fta']) > 0 else 0
            }
        
        return advanced


class GameStats:
    """Comprehensive game statistics"""
    
    def __init__(self, game_data: Dict):
        """Initialize with complete game data"""
        self.game_data = game_data
        self.player_stats = PlayerStats(game_data.get('play_by_play', []))
        self.team_stats = TeamStats(game_data.get('box_score', {}))
    
    def get_game_summary(self) -> Dict:
        """Get comprehensive game summary"""
        return {
            'game_id': self.game_data.get('id'),
            'team_totals': self.team_stats.get_team_totals(),
            'advanced_stats': self.team_stats.calculate_advanced_stats(),
            'player_stats': self.player_stats.get_player_summary().to_dicts(),
            'shot_data': self.game_data.get('shots', [])
        }
    
    def export_for_frontend(self) -> Dict:
        """Export data formatted for frontend consumption"""
        summary = self.get_game_summary()
        
        # Format for easy frontend consumption
        return {
            'gameId': summary['game_id'],
            'teams': {
                'home': {
                    'name': summary['team_totals']['home_team']['name'],
                    'score': summary['team_totals']['home_team']['pts'],
                    'stats': summary['team_totals']['home_team'],
                    'advanced': summary['advanced_stats']['home_team']
                },
                'away': {
                    'name': summary['team_totals']['away_team']['name'],
                    'score': summary['team_totals']['away_team']['pts'],
                    'stats': summary['team_totals']['away_team'],
                    'advanced': summary['advanced_stats']['away_team']
                }
            },
            'players': summary['player_stats'],
            'shots': summary['shot_data']
        }