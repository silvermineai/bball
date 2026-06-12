# NCAA Basketball Scraper

A comprehensive Python package for scraping NCAA basketball data and generating analytics.

## Features

- Scrape game data from NCAA website
- Extract shot charts and player statistics
- Generate plotly visualizations
- Export data in multiple formats

## Installation

```bash
pip install -e .
```

## Usage

```python
from ncaa_scraper import GameScraper, ShotChart

# Scrape a game
scraper = GameScraper()
game_data = scraper.scrape_game("5728620")

# Generate shot chart
chart = ShotChart(game_data.shots)
fig = chart.create_visualization()
fig.show()
```