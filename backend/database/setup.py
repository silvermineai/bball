import sqlite3
import os
from datetime import datetime

def create_database():
    """Create SQLite database with schema"""
    db_path = os.path.join(os.path.dirname(__file__), '../../data/basketball.db')
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    
    # Connect to database
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Read and execute schema
    schema_path = os.path.join(os.path.dirname(__file__), 'schema.sql')
    with open(schema_path, 'r') as f:
        schema = f.read()
        
    # SQLite doesn't support some PostgreSQL features, so we need to modify the schema
    schema = schema.replace('SERIAL', 'INTEGER')
    schema = schema.replace('VARCHAR(50)', 'TEXT')
    schema = schema.replace('VARCHAR(100)', 'TEXT')
    schema = schema.replace('VARCHAR(200)', 'TEXT')
    schema = schema.replace('VARCHAR(10)', 'TEXT')
    schema = schema.replace('VARCHAR(20)', 'TEXT')
    schema = schema.replace('VARCHAR(7)', 'TEXT')
    schema = schema.replace('DECIMAL(5,2)', 'REAL')
    schema = schema.replace('TIMESTAMP', 'DATETIME')
    schema = schema.replace('DEFAULT CURRENT_TIMESTAMP', "DEFAULT (datetime('now'))")
    schema = schema.replace('GENERATED ALWAYS AS (first_name || \' \' || last_name) STORED', '')
    
    # Execute schema
    cursor.executescript(schema)
    
    # Seed some initial data
    seed_data(cursor)
    
    conn.commit()
    conn.close()
    
    print(f"Database created successfully at: {db_path}")

def seed_data(cursor):
    """Seed initial data"""
    # Add conferences
    conferences = [
        ('acc', 'Atlantic Coast Conference', 'Division I'),
        ('big12', 'Big 12 Conference', 'Division I'),
        ('bigten', 'Big Ten Conference', 'Division I'),
        ('sec', 'Southeastern Conference', 'Division I'),
        ('pac12', 'Pac-12 Conference', 'Division I'),
        ('bigeast', 'Big East Conference', 'Division I'),
        ('aac', 'American Athletic Conference', 'Division I'),
        ('wcc', 'West Coast Conference', 'Division I'),
    ]
    
    cursor.executemany(
        "INSERT INTO conferences (id, name, division) VALUES (?, ?, ?)",
        conferences
    )
    
    # Add current season
    cursor.execute(
        "INSERT INTO seasons (id, name, start_date, end_date, is_current) VALUES (?, ?, ?, ?, ?)",
        ('2024-25', '2024-25', '2024-11-01', '2025-04-30', True)
    )
    
    # Add some sample teams
    teams = [
        ('duke', 'Duke', 'Blue Devils', 'DUKE', 'acc', 'Durham', 'NC', 'Cameron Indoor Stadium', '#003087', '#FFFFFF'),
        ('unc', 'North Carolina', 'Tar Heels', 'UNC', 'acc', 'Chapel Hill', 'NC', 'Dean Smith Center', '#7BAFD4', '#FFFFFF'),
        ('kansas', 'Kansas', 'Jayhawks', 'KU', 'big12', 'Lawrence', 'KS', 'Allen Fieldhouse', '#0051BA', '#E8000D'),
        ('kentucky', 'Kentucky', 'Wildcats', 'UK', 'sec', 'Lexington', 'KY', 'Rupp Arena', '#0033A0', '#FFFFFF'),
        ('ucla', 'UCLA', 'Bruins', 'UCLA', 'pac12', 'Los Angeles', 'CA', 'Pauley Pavilion', '#2D68C4', '#F2A900'),
        ('gonzaga', 'Gonzaga', 'Bulldogs', 'GONZ', 'wcc', 'Spokane', 'WA', 'McCarthey Athletic Center', '#002967', '#C8102E'),
    ]
    
    cursor.executemany(
        """INSERT INTO teams (id, name, mascot, abbreviation, conference_id, city, state, arena, primary_color, secondary_color) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        teams
    )
    
    print("Database seeded with initial data")

if __name__ == "__main__":
    create_database()