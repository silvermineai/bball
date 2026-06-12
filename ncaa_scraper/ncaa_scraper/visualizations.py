"""Basketball court visualizations and shot charts"""

import math
from typing import List, Dict, Optional

import plotly.express as px
import plotly.graph_objects as go
import pandas as pd
import numpy as np


class CourtPlotter:
    """NCAA Basketball court plotting utilities"""
    
    @staticmethod
    def add_court_lines(fig, line_color="DimGray", line_width=2):
        """Add NCAA Men's Basketball court lines to a Plotly figure"""
        
        # Court dimensions (in feet)
        court_length_ft = 94
        court_width_ft = 50
        
        # Key locations
        hoop_center_x_basket1_ft = 5.25
        hoop_center_x_basket2_ft = court_length_ft - hoop_center_x_basket1_ft
        hoop_center_y_ft = court_width_ft / 2
        
        # Court elements dimensions
        backboard_1_x_ft = 4
        backboard_2_x_ft = court_length_ft - 4
        backboard_width_ft = 6
        hoop_radius_ft = 9 / 12
        
        # Free throw lane
        ft_line_dist_from_baseline_ft = 19
        key_width_ft = 12
        key_y_lower_ft = hoop_center_y_ft - (key_width_ft / 2)
        key_y_upper_ft = hoop_center_y_ft + (key_width_ft / 2)
        
        # Circles
        circle_radius_ft = 6
        restricted_area_radius_ft = 4
        
        # Three-point line
        three_pt_radius_ft = 22 + (1.75 / 12)
        three_pt_sideline_clearance_ft = 40 / 12
        
        def _add_shape(shape_obj):
            fig.add_shape(shape_obj, layer="below")
        
        # Court boundaries
        _add_shape(go.layout.Shape(
            type="line", x0=0, y0=0, x1=court_length_ft, y1=0,
            line=dict(color=line_color, width=line_width+2)
        ))
        _add_shape(go.layout.Shape(
            type="line", x0=0, y0=court_width_ft, x1=court_length_ft, y1=court_width_ft,
            line=dict(color=line_color, width=line_width+2)
        ))
        _add_shape(go.layout.Shape(
            type="line", x0=0, y0=0, x1=0, y1=court_width_ft,
            line=dict(color=line_color, width=line_width+2)
        ))
        _add_shape(go.layout.Shape(
            type="line", x0=court_length_ft, y0=0, x1=court_length_ft, y1=court_width_ft,
            line=dict(color=line_color, width=line_width+2)
        ))
        
        # Midcourt line and circle
        _add_shape(go.layout.Shape(
            type="line", x0=court_length_ft/2, y0=0, x1=court_length_ft/2, y1=court_width_ft,
            line=dict(color=line_color, width=line_width+2)
        ))
        _add_shape(go.layout.Shape(
            type="circle",
            x0=(court_length_ft/2) - circle_radius_ft, y0=hoop_center_y_ft - circle_radius_ft,
            x1=(court_length_ft/2) + circle_radius_ft, y1=hoop_center_y_ft + circle_radius_ft,
            line=dict(color=line_color, width=line_width), fillcolor="rgba(0,0,0,0)"
        ))
        
        # Left key area
        _add_shape(go.layout.Shape(
            type="line", x0=0, y0=key_y_lower_ft, x1=ft_line_dist_from_baseline_ft, y1=key_y_lower_ft,
            line=dict(color=line_color, width=line_width)
        ))
        _add_shape(go.layout.Shape(
            type="line", x0=0, y0=key_y_upper_ft, x1=ft_line_dist_from_baseline_ft, y1=key_y_upper_ft,
            line=dict(color=line_color, width=line_width)
        ))
        _add_shape(go.layout.Shape(
            type="line", x0=ft_line_dist_from_baseline_ft, y0=key_y_lower_ft, 
            x1=ft_line_dist_from_baseline_ft, y1=key_y_upper_ft,
            line=dict(color=line_color, width=line_width)
        ))
        
        # Right key area
        _add_shape(go.layout.Shape(
            type="line", x0=court_length_ft, y0=key_y_lower_ft, 
            x1=court_length_ft - ft_line_dist_from_baseline_ft, y1=key_y_lower_ft,
            line=dict(color=line_color, width=line_width)
        ))
        _add_shape(go.layout.Shape(
            type="line", x0=court_length_ft, y0=key_y_upper_ft, 
            x1=court_length_ft - ft_line_dist_from_baseline_ft, y1=key_y_upper_ft,
            line=dict(color=line_color, width=line_width)
        ))
        _add_shape(go.layout.Shape(
            type="line", x0=court_length_ft - ft_line_dist_from_baseline_ft, y0=key_y_lower_ft, 
            x1=court_length_ft - ft_line_dist_from_baseline_ft, y1=key_y_upper_ft,
            line=dict(color=line_color, width=line_width)
        ))
        
        # Free throw circles
        _add_shape(go.layout.Shape(
            type="circle",
            x0=ft_line_dist_from_baseline_ft - circle_radius_ft, 
            y0=hoop_center_y_ft - circle_radius_ft,
            x1=ft_line_dist_from_baseline_ft + circle_radius_ft, 
            y1=hoop_center_y_ft + circle_radius_ft,
            line=dict(color=line_color, width=line_width), fillcolor="rgba(0,0,0,0)"
        ))
        _add_shape(go.layout.Shape(
            type="circle",
            x0=(court_length_ft - ft_line_dist_from_baseline_ft) - circle_radius_ft, 
            y0=hoop_center_y_ft - circle_radius_ft,
            x1=(court_length_ft - ft_line_dist_from_baseline_ft) + circle_radius_ft, 
            y1=hoop_center_y_ft + circle_radius_ft,
            line=dict(color=line_color, width=line_width), fillcolor="rgba(0,0,0,0)"
        ))
        
        # Three-point lines
        three_pt_y_straight_lower_ft = three_pt_sideline_clearance_ft
        three_pt_y_straight_upper_ft = court_width_ft - three_pt_sideline_clearance_ft
        
        # Calculate where arc meets straight lines
        y_dist = hoop_center_y_ft - three_pt_y_straight_lower_ft
        x_offset = math.sqrt(three_pt_radius_ft**2 - y_dist**2)
        three_pt_arc_x1 = hoop_center_x_basket1_ft + x_offset
        three_pt_arc_x2 = hoop_center_x_basket2_ft - x_offset
        
        # Left three-point line
        _add_shape(go.layout.Shape(
            type="circle",
            x0=hoop_center_x_basket1_ft - three_pt_radius_ft, 
            y0=hoop_center_y_ft - three_pt_radius_ft,
            x1=hoop_center_x_basket1_ft + three_pt_radius_ft, 
            y1=hoop_center_y_ft + three_pt_radius_ft,
            line=dict(color=line_color, width=line_width), fillcolor="rgba(0,0,0,0)"
        ))
        # Mask to create arc
        _add_shape(go.layout.Shape(
            type="rect", x0=0, y0=0, x1=three_pt_arc_x1, y1=court_width_ft,
            fillcolor="white", line_width=0
        ))
        # Straight lines
        _add_shape(go.layout.Shape(
            type="line", x0=0, y0=three_pt_y_straight_lower_ft, 
            x1=three_pt_arc_x1, y1=three_pt_y_straight_lower_ft,
            line=dict(color=line_color, width=line_width)
        ))
        _add_shape(go.layout.Shape(
            type="line", x0=0, y0=three_pt_y_straight_upper_ft, 
            x1=three_pt_arc_x1, y1=three_pt_y_straight_upper_ft,
            line=dict(color=line_color, width=line_width)
        ))
        
        # Right three-point line (similar approach)
        _add_shape(go.layout.Shape(
            type="circle",
            x0=hoop_center_x_basket2_ft - three_pt_radius_ft, 
            y0=hoop_center_y_ft - three_pt_radius_ft,
            x1=hoop_center_x_basket2_ft + three_pt_radius_ft, 
            y1=hoop_center_y_ft + three_pt_radius_ft,
            line=dict(color=line_color, width=line_width), fillcolor="rgba(0,0,0,0)"
        ))
        _add_shape(go.layout.Shape(
            type="rect", x0=three_pt_arc_x2, y0=0, x1=court_length_ft, y1=court_width_ft,
            fillcolor="white", line_width=0
        ))
        _add_shape(go.layout.Shape(
            type="line", x0=court_length_ft, y0=three_pt_y_straight_lower_ft, 
            x1=three_pt_arc_x2, y1=three_pt_y_straight_lower_ft,
            line=dict(color=line_color, width=line_width)
        ))
        _add_shape(go.layout.Shape(
            type="line", x0=court_length_ft, y0=three_pt_y_straight_upper_ft, 
            x1=three_pt_arc_x2, y1=three_pt_y_straight_upper_ft,
            line=dict(color=line_color, width=line_width)
        ))
        
        # Restricted area arcs
        _add_shape(go.layout.Shape(
            type="path",
            path=f"M {hoop_center_x_basket1_ft},{hoop_center_y_ft - restricted_area_radius_ft} "
                 f"A {restricted_area_radius_ft},{restricted_area_radius_ft} 0 0 0 "
                 f"{hoop_center_x_basket1_ft},{hoop_center_y_ft + restricted_area_radius_ft}",
            line=dict(color=line_color, width=line_width)
        ))
        _add_shape(go.layout.Shape(
            type="path",
            path=f"M {hoop_center_x_basket2_ft},{hoop_center_y_ft - restricted_area_radius_ft} "
                 f"A {restricted_area_radius_ft},{restricted_area_radius_ft} 0 0 1 "
                 f"{hoop_center_x_basket2_ft},{hoop_center_y_ft + restricted_area_radius_ft}",
            line=dict(color=line_color, width=line_width)
        ))
        
        # Backboards
        backboard_y_lower = hoop_center_y_ft - (backboard_width_ft / 2)
        backboard_y_upper = hoop_center_y_ft + (backboard_width_ft / 2)
        _add_shape(go.layout.Shape(
            type="line", x0=backboard_1_x_ft, y0=backboard_y_lower, 
            x1=backboard_1_x_ft, y1=backboard_y_upper,
            line=dict(color=line_color, width=line_width+1)
        ))
        _add_shape(go.layout.Shape(
            type="line", x0=backboard_2_x_ft, y0=backboard_y_lower, 
            x1=backboard_2_x_ft, y1=backboard_y_upper,
            line=dict(color=line_color, width=line_width+1)
        ))
        
        # Hoops
        _add_shape(go.layout.Shape(
            type="circle",
            x0=hoop_center_x_basket1_ft - hoop_radius_ft, 
            y0=hoop_center_y_ft - hoop_radius_ft,
            x1=hoop_center_x_basket1_ft + hoop_radius_ft, 
            y1=hoop_center_y_ft + hoop_radius_ft,
            line=dict(color="DarkOrange", width=line_width), fillcolor="rgba(0,0,0,0)"
        ))
        _add_shape(go.layout.Shape(
            type="circle",
            x0=hoop_center_x_basket2_ft - hoop_radius_ft, 
            y0=hoop_center_y_ft - hoop_radius_ft,
            x1=hoop_center_x_basket2_ft + hoop_radius_ft, 
            y1=hoop_center_y_ft + hoop_radius_ft,
            line=dict(color="DarkOrange", width=line_width), fillcolor="rgba(0,0,0,0)"
        ))
        
        return fig


class ShotChart:
    """Create basketball shot charts"""
    
    def __init__(self, shots: List[Dict]):
        """Initialize with shot data"""
        self.shots = shots
        self.df_shots = self._prepare_shot_data()
    
    def _prepare_shot_data(self) -> pd.DataFrame:
        """Convert shot data to DataFrame with proper coordinates"""
        df = pd.DataFrame(self.shots)
        
        # Convert from percentage to feet coordinates
        df['x'] = df['x'] * 94 / 100
        df['y'] = 50 - (df['y'] * 50 / 100)  # Reverse Y axis
        
        # Create one-sided coordinates for half-court view
        df['y_oneside'] = np.where(df['x'] < 94/2, df['y'], 50 - df['y'])
        df['x_oneside'] = np.where(df['x'] < 94/2, df['x'], 94 - df['x'])
        
        # Parse description for additional info
        if 'description' in df.columns:
            df['d_split'] = df['description'].str.split()
            df['half'] = df['d_split'].apply(lambda x: x[0] if x else '')
            df['time'] = df['d_split'].apply(lambda x: x[1] if len(x) > 1 else '')
            df['player'] = df['description'].str.extract(r'made by ([^(]+)')
            df['team'] = df['description'].str.extract(r'\(([^)]+)\)')
            df['score'] = df['description'].str.extract(r'(\d+-\d+)$')
        
        return df
    
    def create_full_court_chart(self, title: str = "Shot Chart") -> go.Figure:
        """Create full court shot chart"""
        fig = px.scatter(
            self.df_shots, 
            x='x', 
            y='y', 
            color='team_id', 
            symbol='made',
            color_discrete_sequence=px.colors.qualitative.Set1,
            symbol_sequence=['circle', 'x'],
            title=title
        )
        
        fig.update_xaxes(range=[0, 94], showgrid=False, zeroline=False, showticklabels=False)
        fig.update_yaxes(range=[0, 50], showgrid=False, zeroline=False, showticklabels=False)
        fig.update_layout(
            height=500, 
            width=940, 
            margin=dict(l=0, r=0, b=0, t=30),
            showlegend=True,
            plot_bgcolor='white'
        )
        
        # Add court lines
        CourtPlotter.add_court_lines(fig)
        
        return fig
    
    def create_half_court_chart(self, title: str = "Shot Chart - Half Court") -> go.Figure:
        """Create half court shot chart"""
        fig = px.scatter(
            self.df_shots, 
            x='x_oneside', 
            y='y_oneside', 
            color='team_id', 
            symbol='made',
            color_discrete_sequence=px.colors.qualitative.Set1,
            symbol_sequence=['circle', 'x'],
            title=title
        )
        
        fig.update_xaxes(range=[0, 47], showgrid=False, zeroline=False, showticklabels=False)
        fig.update_yaxes(range=[0, 50], showgrid=False, zeroline=False, showticklabels=False)
        fig.update_layout(
            height=500, 
            width=470, 
            margin=dict(l=0, r=0, b=0, t=30),
            showlegend=True,
            plot_bgcolor='white'
        )
        
        # Add court lines (half court only)
        CourtPlotter.add_court_lines(fig)
        
        return fig
    
    def create_heatmap(self, team_id: Optional[str] = None) -> go.Figure:
        """Create shot heatmap"""
        # Filter by team if specified
        df = self.df_shots
        if team_id:
            df = df[df['team_id'] == team_id]
        
        # Create hexbin plot
        fig = go.Figure()
        
        # Add heatmap
        fig.add_trace(go.Histogram2d(
            x=df['x_oneside'],
            y=df['y_oneside'],
            colorscale='Hot',
            nbinsx=20,
            nbinsy=20,
            showscale=True
        ))
        
        fig.update_xaxes(range=[0, 47], showgrid=False, zeroline=False, showticklabels=False)
        fig.update_yaxes(range=[0, 50], showgrid=False, zeroline=False, showticklabels=False)
        fig.update_layout(
            height=500, 
            width=470, 
            margin=dict(l=0, r=0, b=0, t=30),
            plot_bgcolor='white',
            title="Shot Heatmap"
        )
        
        # Add court lines
        CourtPlotter.add_court_lines(fig)
        
        return fig
    
    def export_to_json(self) -> Dict:
        """Export shot data and metadata for frontend"""
        return {
            'shots': self.df_shots.to_dict('records'),
            'summary': {
                'total_shots': len(self.df_shots),
                'made_shots': self.df_shots['made'].sum(),
                'shooting_percentage': (self.df_shots['made'].sum() / len(self.df_shots) * 100) if len(self.df_shots) > 0 else 0,
                'three_point_shots': self.df_shots['is_three'].sum() if 'is_three' in self.df_shots else 0,
                'two_point_shots': len(self.df_shots) - self.df_shots['is_three'].sum() if 'is_three' in self.df_shots else len(self.df_shots)
            }
        }