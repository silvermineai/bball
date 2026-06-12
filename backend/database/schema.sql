-- NCAA Basketball Analytics Database Schema

-- Conferences
CREATE TABLE conferences (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    division VARCHAR(50)
);

-- Teams
CREATE TABLE teams (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    mascot VARCHAR(100),
    abbreviation VARCHAR(10),
    conference_id VARCHAR(50) REFERENCES conferences(id),
    city VARCHAR(100),
    state VARCHAR(50),
    arena VARCHAR(100),
    primary_color VARCHAR(7),
    secondary_color VARCHAR(7),
    logo_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seasons
CREATE TABLE seasons (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    start_date DATE,
    end_date DATE,
    is_current BOOLEAN DEFAULT FALSE
);

-- Team Season Records
CREATE TABLE team_season_records (
    team_id VARCHAR(50) REFERENCES teams(id),
    season_id VARCHAR(50) REFERENCES seasons(id),
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    conference_wins INTEGER DEFAULT 0,
    conference_losses INTEGER DEFAULT 0,
    kenpom_rank INTEGER,
    net_rank INTEGER,
    PRIMARY KEY (team_id, season_id)
);

-- Players
CREATE TABLE players (
    id VARCHAR(50) PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    full_name VARCHAR(200) GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED,
    hometown VARCHAR(200),
    high_school VARCHAR(200),
    photo_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Player Team Seasons (handles transfers)
CREATE TABLE player_team_seasons (
    player_id VARCHAR(50) REFERENCES players(id),
    team_id VARCHAR(50) REFERENCES teams(id),
    season_id VARCHAR(50) REFERENCES seasons(id),
    jersey_number VARCHAR(10),
    position VARCHAR(10),
    height VARCHAR(10),
    weight INTEGER,
    class VARCHAR(20),
    PRIMARY KEY (player_id, team_id, season_id)
);

-- Games
CREATE TABLE games (
    id VARCHAR(50) PRIMARY KEY,
    date TIMESTAMP NOT NULL,
    season_id VARCHAR(50) REFERENCES seasons(id),
    home_team_id VARCHAR(50) REFERENCES teams(id),
    away_team_id VARCHAR(50) REFERENCES teams(id),
    home_score INTEGER,
    away_score INTEGER,
    status VARCHAR(20) DEFAULT 'scheduled',
    venue VARCHAR(200),
    attendance INTEGER,
    is_conference_game BOOLEAN DEFAULT FALSE,
    is_neutral_site BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Team Game Stats
CREATE TABLE team_game_stats (
    game_id VARCHAR(50) REFERENCES games(id),
    team_id VARCHAR(50) REFERENCES teams(id),
    is_home BOOLEAN,
    points INTEGER,
    field_goals_made INTEGER,
    field_goals_attempted INTEGER,
    field_goal_percentage DECIMAL(5,2),
    three_pointers_made INTEGER,
    three_pointers_attempted INTEGER,
    three_point_percentage DECIMAL(5,2),
    free_throws_made INTEGER,
    free_throws_attempted INTEGER,
    free_throw_percentage DECIMAL(5,2),
    offensive_rebounds INTEGER,
    defensive_rebounds INTEGER,
    total_rebounds INTEGER,
    assists INTEGER,
    steals INTEGER,
    blocks INTEGER,
    turnovers INTEGER,
    personal_fouls INTEGER,
    technical_fouls INTEGER,
    fast_break_points INTEGER,
    points_in_paint INTEGER,
    second_chance_points INTEGER,
    bench_points INTEGER,
    PRIMARY KEY (game_id, team_id)
);

-- Player Game Stats
CREATE TABLE player_game_stats (
    game_id VARCHAR(50) REFERENCES games(id),
    player_id VARCHAR(50) REFERENCES players(id),
    team_id VARCHAR(50) REFERENCES teams(id),
    minutes INTEGER,
    field_goals_made INTEGER,
    field_goals_attempted INTEGER,
    three_pointers_made INTEGER,
    three_pointers_attempted INTEGER,
    free_throws_made INTEGER,
    free_throws_attempted INTEGER,
    offensive_rebounds INTEGER,
    defensive_rebounds INTEGER,
    total_rebounds INTEGER,
    assists INTEGER,
    steals INTEGER,
    blocks INTEGER,
    turnovers INTEGER,
    personal_fouls INTEGER,
    points INTEGER,
    plus_minus INTEGER,
    PRIMARY KEY (game_id, player_id)
);

-- Play by Play
CREATE TABLE play_by_play (
    id SERIAL PRIMARY KEY,
    game_id VARCHAR(50) REFERENCES games(id),
    period INTEGER,
    time VARCHAR(10),
    team_id VARCHAR(50) REFERENCES teams(id),
    player_id VARCHAR(50) REFERENCES players(id),
    event_type VARCHAR(50),
    description TEXT,
    home_score INTEGER,
    away_score INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Shot Chart
CREATE TABLE shots (
    id SERIAL PRIMARY KEY,
    game_id VARCHAR(50) REFERENCES games(id),
    team_id VARCHAR(50) REFERENCES teams(id),
    player_id VARCHAR(50) REFERENCES players(id),
    x_coordinate DECIMAL(5,2),
    y_coordinate DECIMAL(5,2),
    made BOOLEAN,
    shot_type VARCHAR(50),
    shot_value INTEGER,
    period INTEGER,
    time VARCHAR(10),
    description TEXT
);

-- Player Season Stats (aggregated view)
CREATE TABLE player_season_stats (
    player_id VARCHAR(50) REFERENCES players(id),
    team_id VARCHAR(50) REFERENCES teams(id),
    season_id VARCHAR(50) REFERENCES seasons(id),
    games_played INTEGER DEFAULT 0,
    games_started INTEGER DEFAULT 0,
    minutes_per_game DECIMAL(5,2),
    field_goals_made DECIMAL(5,2),
    field_goals_attempted DECIMAL(5,2),
    field_goal_percentage DECIMAL(5,2),
    three_pointers_made DECIMAL(5,2),
    three_pointers_attempted DECIMAL(5,2),
    three_point_percentage DECIMAL(5,2),
    free_throws_made DECIMAL(5,2),
    free_throws_attempted DECIMAL(5,2),
    free_throw_percentage DECIMAL(5,2),
    offensive_rebounds DECIMAL(5,2),
    defensive_rebounds DECIMAL(5,2),
    total_rebounds DECIMAL(5,2),
    rebounds_per_game DECIMAL(5,2),
    assists DECIMAL(5,2),
    assists_per_game DECIMAL(5,2),
    steals DECIMAL(5,2),
    steals_per_game DECIMAL(5,2),
    blocks DECIMAL(5,2),
    blocks_per_game DECIMAL(5,2),
    turnovers DECIMAL(5,2),
    turnovers_per_game DECIMAL(5,2),
    personal_fouls DECIMAL(5,2),
    fouls_per_game DECIMAL(5,2),
    points DECIMAL(5,2),
    points_per_game DECIMAL(5,2),
    efficiency DECIMAL(5,2),
    PRIMARY KEY (player_id, team_id, season_id)
);

-- Team Season Stats (aggregated view)
CREATE TABLE team_season_stats (
    team_id VARCHAR(50) REFERENCES teams(id),
    season_id VARCHAR(50) REFERENCES seasons(id),
    offensive_efficiency DECIMAL(5,2),
    defensive_efficiency DECIMAL(5,2),
    net_efficiency DECIMAL(5,2),
    pace DECIMAL(5,2),
    effective_field_goal_percentage DECIMAL(5,2),
    turnover_percentage DECIMAL(5,2),
    offensive_rebound_percentage DECIMAL(5,2),
    free_throw_rate DECIMAL(5,2),
    true_shooting_percentage DECIMAL(5,2),
    assist_percentage DECIMAL(5,2),
    steal_percentage DECIMAL(5,2),
    block_percentage DECIMAL(5,2),
    PRIMARY KEY (team_id, season_id)
);

-- Indexes for performance
CREATE INDEX idx_games_date ON games(date);
CREATE INDEX idx_games_home_team ON games(home_team_id);
CREATE INDEX idx_games_away_team ON games(away_team_id);
CREATE INDEX idx_player_game_stats_player ON player_game_stats(player_id);
CREATE INDEX idx_team_game_stats_team ON team_game_stats(team_id);
CREATE INDEX idx_play_by_play_game ON play_by_play(game_id);
CREATE INDEX idx_shots_game ON shots(game_id);
CREATE INDEX idx_shots_player ON shots(player_id);