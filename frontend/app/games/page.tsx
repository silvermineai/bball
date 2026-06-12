"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Game {
  id: string;
  date: string;
  homeTeam: {
    id: string;
    name: string;
    mascot: string;
    score: number;
  };
  awayTeam: {
    id: string;
    name: string;
    mascot: string;
    score: number;
  };
  status: "scheduled" | "in_progress" | "final";
  venue: string;
}

export default function GamesPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [filterConference, setFilterConference] = useState("all");

  // Mock data - replace with API call
  useEffect(() => {
    const mockGames: Game[] = [
      {
        id: "1",
        date: selectedDate,
        homeTeam: { id: "duke", name: "Duke", mascot: "Blue Devils", score: 78 },
        awayTeam: { id: "unc", name: "North Carolina", mascot: "Tar Heels", score: 75 },
        status: "final",
        venue: "Cameron Indoor Stadium"
      },
      {
        id: "2",
        date: selectedDate,
        homeTeam: { id: "kansas", name: "Kansas", mascot: "Jayhawks", score: 82 },
        awayTeam: { id: "kentucky", name: "Kentucky", mascot: "Wildcats", score: 77 },
        status: "final",
        venue: "Allen Fieldhouse"
      },
      {
        id: "3",
        date: selectedDate,
        homeTeam: { id: "ucla", name: "UCLA", mascot: "Bruins", score: 0 },
        awayTeam: { id: "gonzaga", name: "Gonzaga", mascot: "Bulldogs", score: 0 },
        status: "scheduled",
        venue: "Pauley Pavilion"
      },
      {
        id: "4",
        date: selectedDate,
        homeTeam: { id: "michigan", name: "Michigan", mascot: "Wolverines", score: 45 },
        awayTeam: { id: "msu", name: "Michigan State", mascot: "Spartans", score: 42 },
        status: "in_progress",
        venue: "Crisler Center"
      },
    ];
    setGames(mockGames);
  }, [selectedDate]);

  const handleDateChange = (days: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + days);
    setSelectedDate(newDate.toISOString().split('T')[0]);
  };

  const completedGames = games.filter(g => g.status === "final");
  const inProgressGames = games.filter(g => g.status === "in_progress");
  const upcomingGames = games.filter(g => g.status === "scheduled");

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-8">College Basketball Games</h1>

        <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => handleDateChange(-1)}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Previous Day
            </button>
            
            <div className="text-center">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-sm text-gray-600 mt-1">
                {new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>
            
            <button
              onClick={() => handleDateChange(1)}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Next Day
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-3xl font-bold text-blue-600">{games.length}</div>
              <div className="text-gray-600">Total Games</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-green-600">{completedGames.length}</div>
              <div className="text-gray-600">Completed</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-orange-600">{inProgressGames.length}</div>
              <div className="text-gray-600">In Progress</div>
            </div>
          </div>
        </div>

        {inProgressGames.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Live Games</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {inProgressGames.map((game) => (
                <GameCard key={game.id} game={game} isLive={true} />
              ))}
            </div>
          </div>
        )}

        {completedGames.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Final Scores</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {completedGames.map((game) => (
                <GameCard key={game.id} game={game} />
              ))}
            </div>
          </div>
        )}

        {upcomingGames.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Upcoming Games</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {upcomingGames.map((game) => (
                <GameCard key={game.id} game={game} />
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function GameCard({ game, isLive = false }: { game: Game; isLive?: boolean }) {
  const isHomeWinner = game.status === "final" && game.homeTeam.score > game.awayTeam.score;
  const isAwayWinner = game.status === "final" && game.awayTeam.score > game.homeTeam.score;

  return (
    <Link href={`/games/${game.id}`}>
      <div className={`bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow cursor-pointer ${isLive ? 'border-2 border-red-500' : ''}`}>
        {isLive && (
          <div className="flex items-center justify-center mb-2">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800">
              <span className="animate-pulse mr-2">●</span>
              LIVE
            </span>
          </div>
        )}
        
        <div className="space-y-3">
          <div className={`flex justify-between items-center ${isAwayWinner ? 'font-bold' : ''}`}>
            <div className="flex items-center space-x-2">
              <span className="text-gray-600">@</span>
              <span>{game.awayTeam.name}</span>
            </div>
            {game.status !== "scheduled" && (
              <span className="text-2xl">{game.awayTeam.score}</span>
            )}
          </div>
          
          <div className={`flex justify-between items-center ${isHomeWinner ? 'font-bold' : ''}`}>
            <div className="flex items-center space-x-2">
              <span className="text-gray-600">vs</span>
              <span>{game.homeTeam.name}</span>
            </div>
            {game.status !== "scheduled" && (
              <span className="text-2xl">{game.homeTeam.score}</span>
            )}
          </div>
        </div>
        
        <div className="mt-4 text-sm text-gray-600 text-center">
          {game.venue}
          {game.status === "scheduled" && (
            <div className="mt-1">7:00 PM ET</div>
          )}
        </div>
      </div>
    </Link>
  );
}