"""
TODO:
- add turnovers
- add blocks
- create a game report with the plotly HTML + all other things in it.
- add another white block to prevent the freethrow circle from being there (fill it in with home team's color?)

##############################
# Stat Key
##############################
PMP (or PM): This can sometimes refer to "Plus/Minus" per minute, but in many standard box scores like the one you sent, P simply indicates the player's Position (e.g., G for Guard, F for Forward, C for Center) and MP stands for Minutes Played.
FGM: Field Goals Made. This is the number of shots a player successfully made from the field (anywhere on the court except for free throws).
FGA: Field Goals Attempted. This is the total number of shots a player took from the field.
FG%: Field Goal Percentage (not shown in your image, but often included). This is calculated as FGM divided by FGA and shows the player's shooting accuracy from the field.
3PM (or 3FG, 3FGM): Three-Point Field Goals Made. The number of successful shots made from beyond the three-point line. Your image uses 3FG.
3PA (or 3FGA): Three-Point Field Goals Attempted. The total number of shots taken from beyond the three-point line. Your image uses 3FGA.
3P%: Three-Point Field Goal Percentage (not shown in your image, but often included). Calculated as 3PM divided by 3PA, showing accuracy from three-point range.
FTM (or FT): Free Throws Made. The number of successful free throws. Your image uses FT.
FTA: Free Throws Attempted. The total number of free throws taken.
FT%: Free Throw Percentage (not shown in your image, but often included). Calculated as FTM divided by FTA, showing accuracy from the free-throw line.
PTS: Points. The total number of points scored by a player.
OReb (or OFF): Offensive Rebounds. The number of rebounds a player secured after their own team missed a shot.
DReb (or DEF): Defensive Rebounds. The number of rebounds a player secured after the opposing team missed a shot.
Tot Reb (or REB, TRB): Total Rebounds. The sum of offensive and defensive rebounds.
AST: Assists. A pass made to a teammate who then scores directly.
TO (or TOV): Turnovers. When a player loses possession of the ball to the opposing team.
STL: Steals. When a player takes the ball away from an opponent.
BLK: Blocks. When a player deflects an opponent's shot attempt.
Fouls (or PF): Personal Fouls. The number of fouls committed by a player.
DQ: Disqualifications. If a player commits too many personal fouls (usually 5 or 6 depending on the league), they are disqualified from the game.
Tech Fouls: Technical Fouls. These are fouls for unsportsmanlike conduct or other non-gameplay violations.

##############################
# Ways this can create value #
##############################

## Transfer Scouting (balance out your weaknesses)
- Analyze your own strengths/weaknesses and find gaps
    - Find players on lower-prestige teams that have great 3-ball
    - Find great drivers to balance your 3-game
- Know strenghts and weaknesses of individual players relative to the league: find underdogs.

## Game Prep
- Compare your team's strengths relative to upcoming (driving, 3-ball)
- Detailed player-specific insights
    - Who's most likely to turnover the ball? 
    - Where does he like to shoot from?
    - What kind of shot does he take? (Step-backs? Pull-ups? 3-pointers?)
    - Will this guy drive?
    - Does he shoot off of an assist?
- Film Notebook: Have one central location for all game footage (YouTubes) and have your staff take notes.
    - Insights from the Web: we'll scour the internet for analyst reports and predictions
    - Know the vegas odds
    - Detailed reports on each opponent and their players
    - Heatmaps of where your opponent is shooting from over last 10 games
- Be unpredictable: They can see reports and know where you shoot from.
    - Develop new plays that go against what youv'e done the last 3 games
- Team Tendencies
    - shot sequence
        - given they just shot a three, what are they going to try for?
        - 3 | 2 | 3 -> 80% of a 3, 20% of a 2
        - 2 | 2 | 3 -> 66% of a 2, 33% of a 3

## Strategic Team Development
- Find your competitive edge in the league?
    - Should focus our offense on driving? 3-ball?
    - What do our 
- What should we practice on? as a team? as an individual?
    - e.g., "Jeremy J. is missing all his 3's from [X spot on the court] this season. Let's develop that skillset with [Y Drill]"

https://stats.ncaa.org/players/8179067

"""
# %%
print('starting')
import re
from bs4 import BeautifulSoup
import requests
import numpy as np
import pandas as pd
print('requests')
import plotly.express as px
import plotly.graph_objects as go
import polars as pl
import io
import plotly.io as pio
import math

import logging
import polars as pl
import os

# Set the maximum column width (in characters)
pl.Config.set_tbl_width_chars(width=-1)
pl.Config.set_tbl_cols(n=-1)
pl.Config.set_tbl_rows(n=200)
pl.Config.set_fmt_str_lengths(100)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

# Create a logger instance
logger = logging.getLogger(__name__)
logger.info("Logger initialized successfully.")


def extract_add_shots(html_content):
    # Parse the HTML
    soup = BeautifulSoup(html_content, 'html.parser')
    
    # Find all script tags
    script_tags = soup.find_all('script')
    
    add_shots = []
    
    # Iterate through script tags to find the one with addShot calls
    for script in script_tags:
        if script.string and 'addShot' in script.string:
            # Use regex to find all addShot function calls
            pattern = r'addShot\([^;]+\);'
            matches = re.findall(pattern, script.string)
            add_shots.extend(matches)
    
    return add_shots

def parse_add_shots(html_content):
    add_shots = extract_add_shots(html_content)
    parsed_shots = []
    
    for shot in add_shots:
        # Extract the parameters inside the parentheses
        params_str = re.search(r'addShot\((.*)\);', shot).group(1)
        
        # Split by comma, but respect string literals with commas inside
        params = []
        current_param = ""
        in_string = False
        
        for char in params_str:
            if char == "'" or char == '"':
                in_string = not in_string
                current_param += char
            elif char == ',' and not in_string:
                params.append(current_param.strip())
                current_param = ""
            else:
                current_param += char
        
        # Add the last parameter
        if current_param:
            params.append(current_param.strip())
        
        # Convert parameters to appropriate types
        x = float(params[0])
        y = float(params[1])
        team_id = int(params[2])
        made = params[3].lower() == 'true'
        shot_id = int(params[4])
        description = params[5].strip("'\"")
        tags = params[6].strip("'\"")
        is_three = params[7].lower() == 'true'
        
        parsed_shots.append({
            'x': x,
            'y': y,
            'team_id': team_id,
            'made': made,
            'shot_id': shot_id,
            'description': description,
            'tags': tags,
            'is_three': is_three
        })
    
    return parsed_shots

def add_ncaa_mens_basketball_court_lines(fig, line_color="DimGray", line_width=2):
    """
    Adds NCAA Men's Basketball court lines to a Plotly figure.
    Sweep flags are set based on observed behavior of working FT arcs.
    All coordinates and radii calculations re-verified.

    Assumes:
    - The figure's x-axis represents court length (94 feet) from 0% to 100%.
    - The figure's y-axis represents court width (50 feet) from 0% to 100%.
    - (0,0) is the bottom-left corner of the court.

    Parameters:
    - fig: A Plotly graph objects figure.
    - line_color: Color of the court lines.
    - line_width: Width of the court lines.
    """

    court_length_total_perc = 100.0
    court_width_total_perc = 100.0

    backboard_face_from_baseline_ft = 4.0
    basket_center_offset_from_backboard_ft = 15.0 / 12.0
    basket_center_from_baseline_ft = backboard_face_from_baseline_ft + basket_center_offset_from_backboard_ft

    hoop_center_y_ft = 50.0 / 2.0
    hoop_y_perc = (hoop_center_y_ft / 50.0) * 100.0

    backboard_x1_perc = (backboard_face_from_baseline_ft / 94.0) * 100.0
    backboard_x2_perc = ((94.0 - backboard_face_from_baseline_ft) / 94.0) * 100.0

    basket_center_x1_perc = (basket_center_from_baseline_ft / 94.0) * 100.0
    basket_center_x2_perc = ((94.0 - basket_center_from_baseline_ft) / 94.0) * 100.0

    ft_line_dist_from_baseline_ft = 19.0
    ft1_line_x_perc = (ft_line_dist_from_baseline_ft / 94.0) * 100.0
    ft2_line_x_perc = ((94.0 - ft_line_dist_from_baseline_ft) / 94.0) * 100.0

    key_width_ft = 12.0
    key_half_width_perc = (key_width_ft / 2.0 / 50.0) * 100.0
    key_y_lower_perc = hoop_y_perc - key_half_width_perc
    key_y_upper_perc = hoop_y_perc + key_half_width_perc

    circle_radius_ft = 6.0
    circle_radius_x_perc = (circle_radius_ft / 94.0) * 100.0
    circle_radius_y_perc = (circle_radius_ft / 50.0) * 100.0

    restricted_arc_radius_ft = 4.0
    restricted_arc_radius_x_perc = (restricted_arc_radius_ft / 94.0) * 100.0
    restricted_arc_radius_y_perc = (restricted_arc_radius_ft / 50.0) * 100.0

    three_pt_radius_ft = 22.0 + (1.75 / 12.0)
    three_pt_radius_x_perc = (three_pt_radius_ft / 94.0) * 100.0
    three_pt_radius_y_perc = (three_pt_radius_ft / 50.0) * 100.0

    three_pt_sideline_dist_ft = 40.0 / 12.0
    three_pt_y_straight_lower_perc = (three_pt_sideline_dist_ft / 50.0) * 100.0
    three_pt_y_straight_upper_perc = 100.0 - three_pt_y_straight_lower_perc

    delta_y_for_3pt_arc_ft = hoop_center_y_ft - three_pt_sideline_dist_ft
    # Ensure argument to sqrt is non-negative
    sqrt_arg = three_pt_radius_ft**2 - delta_y_for_3pt_arc_ft**2
    if sqrt_arg < 0: sqrt_arg = 0 # Should not happen with correct dimensions
    three_pt_arc_pertemuan_x_offset_ft = math.sqrt(sqrt_arg)

    three_pt1_arc_meeting_point_x_ft = basket_center_from_baseline_ft + three_pt_arc_pertemuan_x_offset_ft
    three_pt1_arc_meeting_point_x_perc = (three_pt1_arc_meeting_point_x_ft / 94.0) * 100.0

    three_pt2_arc_meeting_point_x_ft = 94.0 - basket_center_from_baseline_ft - three_pt_arc_pertemuan_x_offset_ft
    three_pt2_arc_meeting_point_x_perc = (three_pt2_arc_meeting_point_x_ft / 94.0) * 100.0

    hoop_rim_radius_ft = 9.0 / 12.0
    hoop_rim_radius_x_perc = (hoop_rim_radius_ft / 94.0) * 100.0
    hoop_rim_radius_y_perc = (hoop_rim_radius_ft / 50.0) * 100.0

    def _add_shape(shape_obj):
        fig.add_shape(shape_obj, layer="above")

    # Court boundaries & Midcourt line
    _add_shape(go.layout.Shape(type="line", x0=0, y0=0, x1=court_length_total_perc, y1=0, line=dict(color=line_color, width=line_width)))
    _add_shape(go.layout.Shape(type="line", x0=0, y0=court_width_total_perc, x1=court_length_total_perc, y1=court_width_total_perc, line=dict(color=line_color, width=line_width)))
    _add_shape(go.layout.Shape(type="line", x0=0, y0=0, x1=0, y1=court_width_total_perc, line=dict(color=line_color, width=line_width)))
    _add_shape(go.layout.Shape(type="line", x0=court_length_total_perc, y0=0, x1=court_length_total_perc, y1=court_width_total_perc, line=dict(color=line_color, width=line_width)))
    _add_shape(go.layout.Shape(type="line", x0=court_length_total_perc/2, y0=0, x1=court_length_total_perc/2, y1=court_width_total_perc, line=dict(color=line_color, width=line_width)))
    
    _add_shape(go.layout.Shape(type="circle", x0=court_length_total_perc/2 - circle_radius_x_perc, y0=hoop_y_perc - circle_radius_y_perc, x1=court_length_total_perc/2 + circle_radius_x_perc, y1=hoop_y_perc + circle_radius_y_perc, line=dict(color=line_color, width=line_width)))

    # --- Left Key ---
    _add_shape(go.layout.Shape(type="line", x0=0, y0=key_y_lower_perc, x1=ft1_line_x_perc, y1=key_y_lower_perc, line=dict(color=line_color, width=line_width)))
    _add_shape(go.layout.Shape(type="line", x0=0, y0=key_y_upper_perc, x1=ft1_line_x_perc, y1=key_y_upper_perc, line=dict(color=line_color, width=line_width)))
    _add_shape(go.layout.Shape(type="line", x0=ft1_line_x_perc, y0=key_y_lower_perc, x1=ft1_line_x_perc, y1=key_y_upper_perc, line=dict(color=line_color, width=line_width)))
    # FT Arc Left (SF=1 for right bulge)
    # FT Arc Left (top half circle centered on FT line)
    ft1_arc_path = (
        f"M {ft1_line_x_perc - circle_radius_x_perc},{hoop_y_perc} "
        f"A {circle_radius_x_perc},{circle_radius_y_perc} 0 0 1 "
        f"{ft1_line_x_perc + circle_radius_x_perc},{hoop_y_perc}"
    )
    _add_shape(go.layout.Shape(type="path", path=ft1_arc_path, line=dict(color=line_color, width=line_width)))
    fig.show()

    # _add_shape(go.layout.Shape(type="path", path=f"M {ft1_line_x_perc},{key_y_lower_perc} A {circle_radius_x_perc},{circle_radius_y_perc} 0 0 1 {ft1_line_x_perc},{key_y_upper_perc}", line=dict(color=line_color, width=line_width)))
    
    # Restricted Area Arc - Left (SF=0 for left bulge)
    _add_shape(go.layout.Shape(type="path", path=f"M {basket_center_x1_perc},{hoop_y_perc - restricted_arc_radius_y_perc} A {restricted_arc_radius_x_perc},{restricted_arc_radius_y_perc} 0 0 0 {basket_center_x1_perc},{hoop_y_perc + restricted_arc_radius_y_perc}", line=dict(color=line_color, width=line_width)))

    # --- Right Key ---
    _add_shape(go.layout.Shape(type="line", x0=court_length_total_perc, y0=key_y_lower_perc, x1=ft2_line_x_perc, y1=key_y_lower_perc, line=dict(color=line_color, width=line_width)))
    _add_shape(go.layout.Shape(type="line", x0=court_length_total_perc, y0=key_y_upper_perc, x1=ft2_line_x_perc, y1=key_y_upper_perc, line=dict(color=line_color, width=line_width)))
    _add_shape(go.layout.Shape(type="line", x0=ft2_line_x_perc, y0=key_y_lower_perc, x1=ft2_line_x_perc, y1=key_y_upper_perc, line=dict(color=line_color, width=line_width)))
    # FT Arc Right (SF=0 for left bulge)
    _add_shape(go.layout.Shape(type="path", path=f"M {ft2_line_x_perc},{key_y_lower_perc} A {circle_radius_x_perc},{circle_radius_y_perc} 0 0 0 {ft2_line_x_perc},{key_y_upper_perc}", line=dict(color=line_color, width=line_width)))
    
    # Restricted Area Arc - Right (SF=1 for right bulge)
    _add_shape(go.layout.Shape(type="path", path=f"M {basket_center_x2_perc},{hoop_y_perc - restricted_arc_radius_y_perc} A {restricted_arc_radius_x_perc},{restricted_arc_radius_y_perc} 0 0 1 {basket_center_x2_perc},{hoop_y_perc + restricted_arc_radius_y_perc}", line=dict(color=line_color, width=line_width)))

    # --- Left Three-Point Line ---
    _add_shape(go.layout.Shape(type="line", x0=0, y0=three_pt_y_straight_lower_perc, x1=three_pt1_arc_meeting_point_x_perc, y1=three_pt_y_straight_lower_perc, line=dict(color=line_color, width=line_width)))
    _add_shape(go.layout.Shape(type="line", x0=0, y0=three_pt_y_straight_upper_perc, x1=three_pt1_arc_meeting_point_x_perc, y1=three_pt_y_straight_upper_perc, line=dict(color=line_color, width=line_width)))
    # 3P Arc Left (SF=1 for right bulge)
    _add_shape(go.layout.Shape(type="path", path=f"M {three_pt1_arc_meeting_point_x_perc},{three_pt_y_straight_lower_perc} A {three_pt_radius_x_perc},{three_pt_radius_y_perc} 0 0 1 {three_pt1_arc_meeting_point_x_perc},{three_pt_y_straight_upper_perc}", line=dict(color=line_color, width=line_width)))

    # --- Right Three-Point Line ---
    _add_shape(go.layout.Shape(type="line", x0=court_length_total_perc, y0=three_pt_y_straight_lower_perc, x1=three_pt2_arc_meeting_point_x_perc, y1=three_pt_y_straight_lower_perc, line=dict(color=line_color, width=line_width)))
    _add_shape(go.layout.Shape(type="line", x0=court_length_total_perc, y0=three_pt_y_straight_upper_perc, x1=three_pt2_arc_meeting_point_x_perc, y1=three_pt_y_straight_upper_perc, line=dict(color=line_color, width=line_width)))
    # 3P Arc Right (SF=0 for left bulge)
    _add_shape(go.layout.Shape(type="path", path=f"M {three_pt2_arc_meeting_point_x_perc},{three_pt_y_straight_lower_perc} A {three_pt_radius_x_perc},{three_pt_radius_y_perc} 0 0 0 {three_pt2_arc_meeting_point_x_perc},{three_pt_y_straight_upper_perc}", line=dict(color=line_color, width=line_width)))
    
    # Backboards
    backboard_width_ft = 6.0
    backboard_width_perc_y = (backboard_width_ft / 50.0) * 100.0
    backboard_y_lower_perc = hoop_y_perc - backboard_width_perc_y / 2.0
    backboard_y_upper_perc = hoop_y_perc + backboard_width_perc_y / 2.0
    _add_shape(go.layout.Shape(type="line", x0=backboard_x1_perc, y0=backboard_y_lower_perc, x1=backboard_x1_perc, y1=backboard_y_upper_perc, line=dict(color=line_color, width=line_width+1)))
    _add_shape(go.layout.Shape(type="line", x0=backboard_x2_perc, y0=backboard_y_lower_perc, x1=backboard_x2_perc, y1=backboard_y_upper_perc, line=dict(color=line_color, width=line_width+1)))

    # Hoop Rims
    _add_shape(go.layout.Shape(type="circle", x0=basket_center_x1_perc - hoop_rim_radius_x_perc, y0=hoop_y_perc - hoop_rim_radius_y_perc, x1=basket_center_x1_perc + hoop_rim_radius_x_perc, y1=hoop_y_perc + hoop_rim_radius_y_perc, line=dict(color=line_color, width=line_width)))
    _add_shape(go.layout.Shape(type="circle", x0=basket_center_x2_perc - hoop_rim_radius_x_perc, y0=hoop_y_perc - hoop_rim_radius_y_perc, x1=basket_center_x2_perc + hoop_rim_radius_x_perc, y1=hoop_y_perc + hoop_rim_radius_y_perc, line=dict(color=line_color, width=line_width))) 
    return fig



def create_white_hidden_axes_theme():
    """
    Creates and registers a Plotly theme template with a pure white background
    and hidden X and Y axes.

    Returns:
        plotly.graph_objects.layout.Template: The custom theme template object.
    """
    custom_theme = go.layout.Template()

    # Set background colors
    custom_theme.layout.plot_bgcolor = 'rgba(255,255,255,1)'  # Pure white plot background
    custom_theme.layout.paper_bgcolor = 'rgba(255,255,255,1)' # Pure white paper background

    # Hide X-axis
    custom_theme.layout.xaxis.visible = False
    custom_theme.layout.xaxis.showgrid = False
    custom_theme.layout.xaxis.showline = False
    custom_theme.layout.xaxis.showticklabels = False
    custom_theme.layout.xaxis.zeroline = False

    # Hide Y-axis
    custom_theme.layout.yaxis.visible = False
    custom_theme.layout.yaxis.showgrid = False
    custom_theme.layout.yaxis.showline = False
    custom_theme.layout.yaxis.showticklabels = False
    custom_theme.layout.yaxis.zeroline = False
    
    # Optional: Remove color axes/legends if they are not desired for a minimalist look
    # custom_theme.layout.coloraxis.showscale = False 

    # Register the theme so it can be used by name (optional but good practice)
    # pio.templates['white_hidden_axes'] = custom_theme
    
    return custom_theme

def add_ncaa_mens_basketball_court_lines_ft(fig):
    """
    See https://www.ncaa.com/news/basketball-men/article/2019-09-26/college-and-nba-basketballs-biggest-rule-differences

    Adds detailed NCAA Men's Basketball court lines and hoops to a Plotly figure.
    Includes:
    - Standard court lines, hoops, backboards.
    - Center circle, Free throw circles (full circles).
    - Masked 3-point line (arc from full circle, straight lines).
    - Restricted Area Arc (4-foot arc, not full circle).
    - Free-Throw Lane Markings (blocks).
    - Commercial Advertising Area.
    """

    line_color = "DimGray"
    hoop_color = "DarkOrange"
    court_background_color="white"

    line_width=2
    border_line_width=4

    # --- Court Dimensions (all in feet) ---
    court_length_ft = 94
    court_width_ft = 50

    # Hoop and Backboard
    hoop_center_x_basket1_ft = 5.25
    hoop_center_x_basket2_ft = court_length_ft - hoop_center_x_basket1_ft
    hoop_center_y_ft = court_width_ft / 2

    # Backboard
    backboard_1_x_ft = 4
    backboard_2_x_ft = court_length_ft - 4
    backboard_width_ft = 6
    backboard_y_lower_ft = hoop_center_y_ft - (backboard_width_ft / 2)
    backboard_y_upper_ft = hoop_center_y_ft + (backboard_width_ft / 2)

    # Hoop (Ring)
    hoop_radius_ft = 9 / 12

    # Free Throw Lane (Key)
    ft_line_dist_from_baseline_ft = 19
    key_width_ft = 12
    key_y_lower_ft = hoop_center_y_ft - (key_width_ft / 2)
    key_y_upper_ft = hoop_center_y_ft + (key_width_ft / 2)

    # Circles
    circle_radius_ft = 6 # For FT circles and center circle

    # Restricted Area Arc (NCAA Men's: 4-foot arc from center of basket)
    restricted_area_radius_ft = 4 # Radius of the arc

    # Three-Point Line
    three_pt_radius_ft = 22 + (1.75 / 12)
    three_pt_sideline_clearance_ft = 40 / 12 # 3ft 4in
    three_pt_y_straight_lower_ft = three_pt_sideline_clearance_ft
    three_pt_y_straight_upper_ft = court_width_ft - three_pt_sideline_clearance_ft
    # Calculate x-coordinate where the arc meets the straight lines
    # Using pythagorean theorem: R^2 = x_offset^2 + y_offset^2
    # x_offset = sqrt(R^2 - y_offset^2)
    y_dist_for_3pt_arc_calc_ft = hoop_center_y_ft - three_pt_y_straight_lower_ft # distance from hoop_center_y to the straight 3pt line
    if three_pt_radius_ft**2 >= y_dist_for_3pt_arc_calc_ft**2:
        x_offset_for_3pt_arc_ft = math.sqrt(three_pt_radius_ft**2 - y_dist_for_3pt_arc_calc_ft**2)
    else:
        x_offset_for_3pt_arc_ft = 0 # Should not happen with NCAA dimensions
    three_pt_arc_connection_x1_ft = hoop_center_x_basket1_ft + x_offset_for_3pt_arc_ft
    three_pt_arc_connection_x2_ft = hoop_center_x_basket2_ft - x_offset_for_3pt_arc_ft


    def _add_shape(shape_obj):
        fig.add_shape(shape_obj, layer="below")


    # --- Left Three-Point Line (Masked Circle Method) ---
    _add_shape(go.layout.Shape(type="circle",
        x0=hoop_center_x_basket1_ft - three_pt_radius_ft, y0=hoop_center_y_ft - three_pt_radius_ft,
        x1=hoop_center_x_basket1_ft + three_pt_radius_ft, y1=hoop_center_y_ft + three_pt_radius_ft,
        line=dict(color=line_color, width=line_width), fillcolor="rgba(0,0,0,0)"))
    # Masking rectangle to hide part of the circle to form the arc
    _add_shape(go.layout.Shape(type="rect", x0=0, y0=0, x1=three_pt_arc_connection_x1_ft, y1=court_width_ft,
        fillcolor=court_background_color, line_width=0))
    # Straight lines for 3-point line
    _add_shape(go.layout.Shape(type="line", x0=0, y0=three_pt_y_straight_lower_ft, x1=three_pt_arc_connection_x1_ft, y1=three_pt_y_straight_lower_ft, line=dict(color=line_color, width=line_width)))
    _add_shape(go.layout.Shape(type="line", x0=0, y0=three_pt_y_straight_upper_ft, x1=three_pt_arc_connection_x1_ft, y1=three_pt_y_straight_upper_ft, line=dict(color=line_color, width=line_width)))

    # --- Right Three-Point Line (Masked Circle Method) ---
    _add_shape(go.layout.Shape(type="circle",
        x0=hoop_center_x_basket2_ft - three_pt_radius_ft, y0=hoop_center_y_ft - three_pt_radius_ft,
        x1=hoop_center_x_basket2_ft + three_pt_radius_ft, y1=hoop_center_y_ft + three_pt_radius_ft,
        line=dict(color=line_color, width=line_width), fillcolor="rgba(0,0,0,0)"))
    # Masking rectangle
    _add_shape(go.layout.Shape(type="rect", x0=three_pt_arc_connection_x2_ft, y0=0, x1=court_length_ft, y1=court_width_ft,
        fillcolor=court_background_color, line_width=0))
    # Straight lines for 3-point line
    _add_shape(go.layout.Shape(type="line", x0=court_length_ft, y0=three_pt_y_straight_lower_ft, x1=three_pt_arc_connection_x2_ft, y1=three_pt_y_straight_lower_ft, line=dict(color=line_color, width=line_width)))
    _add_shape(go.layout.Shape(type="line", x0=court_length_ft, y0=three_pt_y_straight_upper_ft, x1=three_pt_arc_connection_x2_ft, y1=three_pt_y_straight_upper_ft, line=dict(color=line_color, width=line_width)))


    # --- Left Key Area ---
    # Key Lines
    _add_shape(go.layout.Shape(type="line", x0=0, y0=key_y_lower_ft, x1=ft_line_dist_from_baseline_ft, y1=key_y_lower_ft, line=dict(color=line_color, width=line_width)))
    _add_shape(go.layout.Shape(type="line", x0=0, y0=key_y_upper_ft, x1=ft_line_dist_from_baseline_ft, y1=key_y_upper_ft, line=dict(color=line_color, width=line_width)))
    _add_shape(go.layout.Shape(type="line", x0=ft_line_dist_from_baseline_ft, y0=key_y_lower_ft, x1=ft_line_dist_from_baseline_ft, y1=key_y_upper_ft, line=dict(color=line_color, width=line_width))) # FT line
    # FT Circle (top of key)
    ft_circle_center_x_left = ft_line_dist_from_baseline_ft
    ft_circle_center_y = hoop_center_y_ft
    _add_shape(go.layout.Shape(type="circle",
        x0=ft_circle_center_x_left - circle_radius_ft, y0=ft_circle_center_y - circle_radius_ft,
        x1=ft_circle_center_x_left + circle_radius_ft, y1=ft_circle_center_y + circle_radius_ft,
        line=dict(color=line_color, width=line_width), fillcolor="rgba(0,0,0,0)"))
    # Restricted Area Arc (Left - bulges towards court center)
    # Start point (top of arc for left basket): (hoop_center_x_basket1_ft, hoop_center_y_ft - restricted_area_radius_ft)
    # End point (bottom of arc for left basket): (hoop_center_x_basket1_ft, hoop_center_y_ft + restricted_area_radius_ft)
    # Sweep flag 0 for right bulge (into court) with reversed Y-axis
    _add_shape(go.layout.Shape(type="path",
        path=f"M {hoop_center_x_basket1_ft},{hoop_center_y_ft - restricted_area_radius_ft} A {restricted_area_radius_ft},{restricted_area_radius_ft} 0 0 0 {hoop_center_x_basket1_ft},{hoop_center_y_ft + restricted_area_radius_ft}",
        line=dict(color=line_color, width=line_width)))

    # --- Right Key Area ---
    _add_shape(go.layout.Shape(type="line", x0=court_length_ft, y0=key_y_lower_ft, x1=court_length_ft - ft_line_dist_from_baseline_ft, y1=key_y_lower_ft, line=dict(color=line_color, width=line_width)))
    _add_shape(go.layout.Shape(type="line", x0=court_length_ft, y0=key_y_upper_ft, x1=court_length_ft - ft_line_dist_from_baseline_ft, y1=key_y_upper_ft, line=dict(color=line_color, width=line_width)))
    _add_shape(go.layout.Shape(type="line", x0=court_length_ft - ft_line_dist_from_baseline_ft, y0=key_y_lower_ft, x1=court_length_ft - ft_line_dist_from_baseline_ft, y1=key_y_upper_ft, line=dict(color=line_color, width=line_width))) # FT line
    ft_circle_center_x_right = court_length_ft - ft_line_dist_from_baseline_ft
    _add_shape(go.layout.Shape(type="circle",
        x0=ft_circle_center_x_right - circle_radius_ft, y0=ft_circle_center_y - circle_radius_ft,
        x1=ft_circle_center_x_right + circle_radius_ft, y1=ft_circle_center_y + circle_radius_ft,
        line=dict(color=line_color, width=line_width), fillcolor="rgba(0,0,0,0)"))
    # Restricted Area Arc (Right - bulges towards court center)
    # Sweep flag 1 for left bulge (into court) with reversed Y-axis
    _add_shape(go.layout.Shape(type="path",
        path=f"M {hoop_center_x_basket2_ft},{hoop_center_y_ft - restricted_area_radius_ft} A {restricted_area_radius_ft},{restricted_area_radius_ft} 0 0 1 {hoop_center_x_basket2_ft},{hoop_center_y_ft + restricted_area_radius_ft}",
        line=dict(color=line_color, width=line_width)))


    # --- Free Throw Lane Markings (Blocks) ---
    block_height_ft = 8 / 12  # 8 inches
    first_block_width_ft = 1.0 # 1 foot
    other_block_width_ft = 2 / 12 # 2 inches
    dist_to_first_block_ft = 7.0
    space_between_blocks_ft = 3.0

    current_x_offset = dist_to_first_block_ft

    # Left Key Markings
    # First block
    # Above key line (closer to y=0 because y-axis is reversed)
    _add_shape(go.layout.Shape(type="rect",
        x0=current_x_offset, y0=key_y_lower_ft - block_height_ft,
        x1=current_x_offset + first_block_width_ft, y1=key_y_lower_ft,
        line=dict(color=line_color, width=line_width), fillcolor=line_color))
    # Below key line
    _add_shape(go.layout.Shape(type="rect",
        x0=current_x_offset, y0=key_y_upper_ft,
        x1=current_x_offset + first_block_width_ft, y1=key_y_upper_ft + block_height_ft,
        line=dict(color=line_color, width=line_width), fillcolor=line_color))

    current_x_offset += first_block_width_ft + space_between_blocks_ft

    # Subsequent 3 blocks
    for _ in range(3):
        # Above key line
        _add_shape(go.layout.Shape(type="rect",
            x0=current_x_offset, y0=key_y_lower_ft - block_height_ft,
            x1=current_x_offset + other_block_width_ft, y1=key_y_lower_ft,
            line=dict(color=line_color, width=line_width), fillcolor=line_color))
        # Below key line
        _add_shape(go.layout.Shape(type="rect",
            x0=current_x_offset, y0=key_y_upper_ft,
            x1=current_x_offset + other_block_width_ft, y1=key_y_upper_ft + block_height_ft,
            line=dict(color=line_color, width=line_width), fillcolor=line_color))
        current_x_offset += other_block_width_ft + space_between_blocks_ft

    # Right Key Markings
    current_x_offset = dist_to_first_block_ft # Reset for right side calculation

    # First block (right side, x decreases from court_length_ft)
    # Above key line
    _add_shape(go.layout.Shape(type="rect",
        x0=court_length_ft - current_x_offset - first_block_width_ft, y0=key_y_lower_ft - block_height_ft,
        x1=court_length_ft - current_x_offset, y1=key_y_lower_ft,
        line=dict(color=line_color, width=line_width), fillcolor=line_color))
    # Below key line
    _add_shape(go.layout.Shape(type="rect",
        x0=court_length_ft - current_x_offset - first_block_width_ft, y0=key_y_upper_ft,
        x1=court_length_ft - current_x_offset, y1=key_y_upper_ft + block_height_ft,
        line=dict(color=line_color, width=line_width), fillcolor=line_color))

    current_x_offset += first_block_width_ft + space_between_blocks_ft

    # Subsequent 3 blocks (right side)
    for _ in range(3):
        # Above key line
        _add_shape(go.layout.Shape(type="rect",
            x0=court_length_ft - current_x_offset - other_block_width_ft, y0=key_y_lower_ft - block_height_ft,
            x1=court_length_ft - current_x_offset, y1=key_y_lower_ft,
            line=dict(color=line_color, width=line_width), fillcolor=line_color))
        # Below key line
        _add_shape(go.layout.Shape(type="rect",
            x0=court_length_ft - current_x_offset - other_block_width_ft, y0=key_y_upper_ft,
            x1=court_length_ft - current_x_offset, y1=key_y_upper_ft + block_height_ft,
            line=dict(color=line_color, width=line_width), fillcolor=line_color))
        current_x_offset += other_block_width_ft + space_between_blocks_ft


    # --- Backboards ---
    _add_shape(go.layout.Shape(type="line", x0=backboard_1_x_ft, y0=backboard_y_lower_ft, x1=backboard_1_x_ft, y1=backboard_y_upper_ft, line=dict(color=line_color, width=line_width+1)))
    _add_shape(go.layout.Shape(type="line", x0=backboard_2_x_ft, y0=backboard_y_lower_ft, x1=backboard_2_x_ft, y1=backboard_y_upper_ft, line=dict(color=line_color, width=line_width+1)))


    # --- Hoops (Rings) ---
    _add_shape(go.layout.Shape(type="circle",
        x0=hoop_center_x_basket1_ft - hoop_radius_ft, y0=hoop_center_y_ft - hoop_radius_ft,
        x1=hoop_center_x_basket1_ft + hoop_radius_ft, y1=hoop_center_y_ft + hoop_radius_ft,
        line=dict(color=hoop_color, width=line_width), fillcolor="rgba(0,0,0,0)"))
    _add_shape(go.layout.Shape(type="circle",
        x0=hoop_center_x_basket2_ft - hoop_radius_ft, y0=hoop_center_y_ft - hoop_radius_ft,
        x1=hoop_center_x_basket2_ft + hoop_radius_ft, y1=hoop_center_y_ft + hoop_radius_ft,
        line=dict(color=hoop_color, width=line_width), fillcolor="rgba(0,0,0,0)"))

    # --- Court Boundary Lines ---
    _add_shape(go.layout.Shape(type="line", x0=0, y0=0, x1=court_length_ft, y1=0, line=dict(color=line_color, width=border_line_width))) # Top sideline
    _add_shape(go.layout.Shape(type="line", x0=0, y0=court_width_ft, x1=court_length_ft, y1=court_width_ft, line=dict(color=line_color, width=border_line_width))) # Bottom sideline
    _add_shape(go.layout.Shape(type="line", x0=0, y0=0, x1=0, y1=court_width_ft, line=dict(color=line_color, width=border_line_width))) # Left baseline
    _add_shape(go.layout.Shape(type="line", x0=court_length_ft, y0=0, x1=court_length_ft, y1=court_width_ft, line=dict(color=line_color, width=border_line_width))) # Right baseline

    # --- Midcourt Line ---
    _add_shape(go.layout.Shape(type="line", x0=court_length_ft/2, y0=0, x1=court_length_ft/2, y1=court_width_ft, line=dict(color=line_color, width=border_line_width)))

    # --- Center Circle ---
    _add_shape(go.layout.Shape(type="circle",
        x0=(court_length_ft/2) - circle_radius_ft, y0=hoop_center_y_ft - circle_radius_ft,
        x1=(court_length_ft/2) + circle_radius_ft, y1=hoop_center_y_ft + circle_radius_ft,
        line=dict(color=line_color, width=line_width), fillcolor="rgba(0,0,0,0)"))

    return fig


def get_df_shots_from_parsed_shots(parsed_shots):
    df = pd.DataFrame(parsed_shots)
    df['team_id'] = df['team_id'].astype(str)
    df['x'] = df['x'] * 94 / 100
    df['y'] = 50 - (df['y'] * 50 / 100) # 50 - =reversing it, so it matches NCAA's page
    # this lets me combine both y's into one half.
    df['y_oneside'] = np.where(df['x'] < 94/2, df['y'], 50 - df['y'])
    df['x_oneside'] = np.where(df['x'] < 94/2, df['x'], 94 - df['x'])

    # parse the description for info
    df['d_split'] = df['description'].str.split()
    df['half'] = df['d_split'].apply(lambda x: x[0])
    df['time'] = df['d_split'].apply(lambda x: x[1])
    df['is_made'] = df['d_split'].apply(lambda x: x[3] == 'made')
    df['player'] = df['d_split'].apply(lambda x: x[5] + ' ' + x[6].split('(')[0])
    df['team'] = df['description'].str.extract('\\((.*)\\)')
    df['score'] = df['description'].str.extract('(\\d+-\\d+)$')
    df['score_away'] = df['score'].str.extract('(\\d+)-\\d+')
    df['score_home'] = df['score'].str.extract('\\d+-(\\d+)')
    return df

def plot_df_shots(df_shots):
    fig = px.scatter(df_shots, x='x', y='y', color='team_id', symbol='made', color_discrete_sequence=px.colors.qualitative.Set1, symbol_sequence=['circle', 'x'])
    fig.update_xaxes(range=[0, 94], showgrid=False, zeroline=False, showticklabels=False)
    fig.update_yaxes(range=[0, 50], showgrid=False, zeroline=False, showticklabels=False)# autorange="reversed") # CRITICAL: Y-axis reversed
    fig.update_layout(height=500, width=940, margin=dict(l=0, r=0, b=0, t=0), showlegend=False)
    fig = add_ncaa_mens_basketball_court_lines_ft(fig)
    return fig

def plot_df_shots_oneside(df_shots):
    fig = px.scatter(df_shots, x='x_oneside', y='y_oneside', color='team_id', symbol='made', color_discrete_sequence=px.colors.qualitative.Set1, symbol_sequence=['circle', 'x'])
    fig.update_xaxes(range=[0, 94/2], showgrid=False, zeroline=False, showticklabels=False)
    fig.update_yaxes(range=[0, 50], showgrid=False, zeroline=False, showticklabels=False)# autorange="reversed") # CRITICAL: Y-axis reversed
    fig.update_layout(height=500, width=940/2, margin=dict(l=0, r=0, b=0, t=0), showlegend=False)
    fig = add_ncaa_mens_basketball_court_lines_ft(fig)
    return fig



if __name__ == "__main__":
    """
    Cal Bears:
    https://stats.ncaa.org/teams/590547
    """
    logger.info('starting main')
    dir_out = "./runs"

    BOX_SCORE = "box_score"
    PBP = "play_by_play"
    FN_SHOTS_CSV = 'shots.csv'

    # 1. Create the custom theme
    pio.templates['white_hidden_axes'] = create_white_hidden_axes_theme()
    pio.templates.default = "white_hidden_axes"

    # Define headers to mimic a browser request
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'max-age=0'
    }
    game_ids = [
        "5728620", # CSU: https://stats.ncaa.org/contests/5728620/box_score
        "5729056", # cal poly: https://stats.ncaa.org/contests/5729056/box_score
        "5722911", # Vanderbilt https://stats.ncaa.org/contests/5722911/box_score
        "5729057", # socal Trojans: https://stats.ncaa.org/contests/5729057/box_score
        "5728723", # Air Force Falcons https://stats.ncaa.org/contests/5728723/box_score
        "5723981", # Sac https://stats.ncaa.org/contests/5723981/box_score
        "5729058", # mercyhurst: https://stats.ncaa.org/contests/5729058/box_score
        "5729059", # missouri tigers: https://stats.ncaa.org/contests/5729059/box_score
        "5732746", # stanford: https://stats.ncaa.org/contests/5732746/box_score
        "5729061", # cornell: https://stats.ncaa.org/contests/5729061/box_score
        "5732882", # st. demons: https://stats.ncaa.org/contests/5732882/box_score
        "5729060", # sd aztecs: https://stats.ncaa.org/contests/5729060/box_score
        "5732750", # https://stats.ncaa.org/contests/5732750/box_score pitt panthers
        # "",
        # "",
    ]

    for game_id in game_ids:
        game_url = f"https://stats.ncaa.org/contests/{game_id}"
        for page in [BOX_SCORE, PBP]:
            path = f"{dir_out}/{game_id}/{page}.html"
            if not os.path.exists(f"{dir_out}/{game_id}/{page}.html"):
                # download the page
                url = f"{game_url}/{page}"
                response = requests.get(url, headers=headers)
                os.makedirs(os.path.dirname(path), exist_ok=True)
                with open(path, "w") as file:
                    file.write(response.text)
            
    print('getting box score')
    # Example usage

    ####################################
    # Box Score
    ####################################
    for game_id in game_ids:
        path = os.path.join(dir_out, game_id, BOX_SCORE + ".html")
        with open(path, "r") as file:
            response_text = file.read()
        add_shots = extract_add_shots(response_text)
        parsed_shots = parse_add_shots(response_text)
        df_shots = get_df_shots_from_parsed_shots(parsed_shots)
        fig_df_shots = plot_df_shots(df_shots=df)
        fig_df_shots_oneside = plot_df_shots_oneside(df_shots=df)

        __import__('ipdb').set_trace()
        path = os.path.join(dir_out, game_id, FN_SHOTS_CSV)
        df.to_csv(path)



        __import__('ipdb').set_trace()

    fig = px.line(df, x='x', y='y', color='team_id', line_shape='linear', markers=True, symbol='made', color_discrete_sequence=px.colors.qualitative.Set1, symbol_sequence=['circle', 'x'])
    # fig.update_yaxes(autorange="reversed").update_traces(marker=dict(size=10)).update_layout(height=500, width=940).show()

    # fig = plot_shots_plotly(parsed_shots[0:10])
    # fig.show()

    ####################################
    # Play-by-play stats
    ####################################
    r2 = requests.get(pbp, headers=headers)
    tables = BeautifulSoup(r2.text, 'html.parser').find_all('table')
    halfs = [c for c in tables if 'Time' in str(c)]
    assert len(halfs) == 2
    first_half, second_half = [pd.read_html(io.StringIO(str(half)))[0] for half in halfs]
    assert first_half.columns.tolist() == second_half.columns.tolist()
    away_team = first_half.columns[1]
    home_team = first_half.columns[3]
    first_half['half'] = 1
    second_half['half'] = 2
    df_pbp = pd.concat([first_half, second_half], ignore_index=True)
    df_pbp.columns = ['time', 'away', 'score', 'home', 'half']

    df_away = df_pbp[['half', 'time', 'score', 'away']]
    df_away.columns = ['half', 'time', 'score', 'description']
    df_away['team'] = away_team
    df_away['site'] = 'away'

    df_home = df_pbp[['half', 'time', 'score', 'home']]
    df_home.columns = ['half', 'time', 'score', 'description']
    df_home['team'] = home_team
    df_home['site'] = 'home'

    df_p = pd.concat([df_home, df_away], ignore_index=True).sort_values(by=['half', 'time', 'site'], ascending=[True, True, True])
    # Extract player name (first and last) only if there's a comma in the description
    df_p['player'] = df_p['description'].str.extract(r'^([^,]+)(?=,)', expand=False)
    stats = [
        # shot description
        'made', 'missed', 'freethrow [1-3]of[1-3]', '2pt', '3pt',
        # strategy
        'substitution out', 'substitution in', 
        # center
        'jumpball won', 'jumpball lost', 
        # shot type
        'stepbackjumpshot', 'drivinglayup', 'drivinglayup', ' jumpshot ', ' pullupjumpshot ', 'dunk', 'hookshot', 'turnaroundjumpshot', ' layup ',
        # shot location
        'pointsinthepaint',
        # shot approach
        'fastbreak', 'assist', 'fromturnover',
        # fouls
        'foulon',  # TODO
        # defense
        'rebound', 'block', 'rebound offensive', 'rebound defensive', 'steal',
        # turnovers
        'turnover badpass', 'turnover travel', 'turnover offensive', 'turnover outofbounds'
    ]
    for key in stats:
        df_p[f'is_{key.strip().replace(' ', "_")}'] = df_p['description'].str.contains(key, case=False, na=False)   

    df_p['is_freethrow'] = df_p['is_freethrow_[1-3]of[1-3]']

    pl_df =(
        pl.from_pandas(df_p)
        .with_columns(
            (pl.col('is_2pt') & pl.col('is_made')).alias('is_2pt_made'),
            (pl.col('is_3pt') & pl.col('is_made')).alias('is_3pt_made'),
            (pl.col('is_freethrow') & pl.col('is_made')).alias('is_freethrow_made'),
            (pl.col('is_2pt') | pl.col('is_3pt')).alias('is_fg'),
            (pl.col('is_freethrow') | pl.col('is_2pt') | pl.col('is_3pt')).alias('is_shot')
        )
    )

    stats = (
        pl_df
        .group_by('team', 'player')
        .agg(
            pl.col('is_2pt_made').sum().alias('2PM'),
            pl.col('is_2pt').sum().alias('2PA'),
            pl.col('is_3pt_made').sum().alias('3PM'), 
            pl.col('is_3pt').sum().alias("3PA"), 
            pl.col('is_freethrow_made').sum().alias('FT'),
            pl.col('is_freethrow').sum().alias('FTA'),
            pl.col('is_shot').sum().alias('TS'), 
            pl.col('is_rebound_offensive').sum().alias('OReb'),
            pl.col('is_rebound_defensive').sum().alias('DReb'),
            # shot types
            (pl.col('is_hookshot') & pl.col('is_made')).sum().alias('HSM'),
            (pl.col('is_hookshot')).sum().alias('HSA'),
            (pl.col('is_layup') & pl.col('is_made')).sum().alias('LUM'),
            (pl.col('is_layup')).sum().alias('LUA'),
            (pl.col('is_drivinglayup') & pl.col('is_made')).sum().alias('DLUM'),
            (pl.col('is_drivinglayup')).sum().alias('DLUA'),
            # jumpshots
            (pl.col('is_jumpshot') & pl.col('is_made')).sum().alias('JSM'),
            (pl.col('is_jumpshot')).sum().alias('JSA'),
            (pl.col('is_pullupjumpshot') & pl.col('is_made')).sum().alias('JSPUM'),
            (pl.col('is_pullupjumpshot')).sum().alias('JSPUA'),
            (pl.col('is_stepbackjumpshot') & pl.col('is_made')).sum().alias('JSSBM'),
            (pl.col('is_stepbackjumpshot')).sum().alias('JSSBA'),
        ).with_columns(
            (pl.col('2PM') * 2).alias('2PTS'),
            (pl.col('3PM') * 3).alias('3PTS'),
            (pl.col('2PM') +  pl.col('3PM')).alias('FGM'), 
            (pl.col('2PA') +  pl.col('3PA')).alias('FGA'), 
            (pl.col('OReb') + pl.col('DReb')).alias('TReb'),
            (pl.col('JSM') + pl.col('JSPUM') + pl.col('JSSBM')).alias('TJSM'),
            (pl.col('JSA') + pl.col('JSPUA') + pl.col('JSSBA')).alias('TJSA'),
            (pl.col('LUM') + pl.col('DLUM')).alias('TLUM'),
            (pl.col('LUA') + pl.col('DLUA')).alias('TLUA'),
        )
        .with_columns(
            (pl.col('FT') + pl.col('2PTS') + pl.col('3PTS')).alias('PTS')
        )
        .sort('PTS', descending=True)
    )
    stats.filter(pl.col('player').str.contains('Jemel'))
    pl_df.filter(pl.col('description').str.contains('Jones')).filter(pl.col('is_shot')).select('description', 'is_freethrow', 'is_2pt', 'is_3pt', 'is_fg')

    stats

    pl.Config.set_tbl_width_chars(width=-1)



    # df_p.groupby('player').agg()

    __import__('ipdb').set_trace()
    # %%
