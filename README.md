# Basketball Analytics Platform 🏀

AI-powered college basketball analytics for coaches, built with NextJS and Python.

## Quick Start

### 1. Install Dependencies

```bash
# Backend (Python)
pip3 install -r requirements.txt

# Frontend (NextJS)
cd frontend
npm install
```

### 2. Setup Database

```bash
cd backend/database
python3 setup.py
```

### 3. Start the Backend API

```bash
cd backend
python3 api.py
```

The API will run on http://localhost:5000

### 4. Start the Frontend

In a new terminal:

```bash
cd frontend
npm run dev
```

The app will open at http://localhost:3000

## Features

- **Team Analytics**: Browse all NCAA teams with rankings and stats
- **Game Dashboard**: Live scores, box scores, and detailed analytics
- **Player Statistics**: Individual player performance tracking
- **Advanced Metrics**: Four Factors, efficiency ratings, pace analysis
- **Data Scraping**: Automated NCAA website data collection

## Project Structure

```
bball.silvermine.ai/
├── frontend/          # NextJS app
│   ├── app/          # App router pages
│   ├── components/   # React components
│   ├── lib/          # API client
│   └── types/        # TypeScript types
├── backend/          # Python backend
│   ├── api.py        # Flask API server
│   ├── scraper.py    # NCAA data scraper
│   └── database/     # Database schema
└── data/             # Data storage
```

## Usage

1. **Browse Teams**: Go to http://localhost:3000/teams to see all teams
2. **View Games**: Check http://localhost:3000/games for today's games
3. **Team Details**: Click any team to see roster and statistics
4. **Game Analytics**: Click any game for detailed box scores

## Scraping Data

To populate with real NCAA data:

```bash
cd backend
python3 scraper.py
```

## Development

- Frontend uses NextJS 15 with App Router
- Backend uses Flask with SQLite
- Data scraping with BeautifulSoup4
- Styled with Tailwind CSS

## Environment Variables

Create a `.env.local` file in the frontend directory:

```
NEXT_PUBLIC_API_URL=http://localhost:5000
```