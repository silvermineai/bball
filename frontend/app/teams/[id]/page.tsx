"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

interface Player {
  id: string;
  name: string;
  number: string;
  position: string;
  height: string;
  weight: number;
  class: string;
  hometown: string;
  ppg: number;
  rpg: number;
  apg: number;
  fg_pct: number;
  three_pct: number;
  ft_pct: number;
}

interface Game {
  id: string;
  date: string;
  opponent: string;
  isHome: boolean;
  result: "W" | "L";
  score: string;
  teamScore: number;
  oppScore: number;
}

interface TeamDetails {
  id: string;
  name: string;
  mascot: string;
  conference: string;
  city: string;
  state: string;
  arena: string;
  coach: string;
  wins: number;
  losses: number;
  confWins: number;
  confLosses: number;
  kenpomRank: number;
  netRank: number;
  offensiveRating: number;
  defensiveRating: number;
  pace: number;
  roster: Player[];
  schedule: Game[];
}

export default function TeamDetailPage() {
  const params = useParams();
  const [team, setTeam] = useState<TeamDetails | null>(null);
  const [activeTab, setActiveTab] = useState<"roster" | "schedule" | "stats">("roster");

  useEffect(() => {
    // Mock data - replace with API call
    const mockTeam: TeamDetails = {
      id: params.id as string,
      name: "Duke",
      mascot: "Blue Devils",
      conference: "ACC",
      city: "Durham",
      state: "NC",
      arena: "Cameron Indoor Stadium",
      coach: "Jon Scheyer",
      wins: 25,
      losses: 6,
      confWins: 14,
      confLosses: 6,
      kenpomRank: 8,
      netRank: 10,
      offensiveRating: 115.2,
      defensiveRating: 92.3,
      pace: 68.5,
      roster: [
        { id: "1", name: "Kyle Filipowski", number: "30", position: "C", height: "7-0", weight: 248, class: "Junior", hometown: "Westtown, NY", ppg: 17.1, rpg: 8.3, apg: 2.8, fg_pct: 50.5, three_pct: 34.8, ft_pct: 67.2 },
        { id: "2", name: "Jeremy Roach", number: "3", position: "PG", height: "6-2", weight: 180, class: "Senior", hometown: "Leesburg, VA", ppg: 14.0, rpg: 3.3, apg: 3.1, fg_pct: 42.9, three_pct: 31.2, ft_pct: 85.7 },
        { id: "3", name: "Mark Mitchell", number: "25", position: "SF", height: "6-9", weight: 235, class: "Sophomore", hometown: "Overland Park, KS", ppg: 11.6, rpg: 5.9, apg: 1.8, fg_pct: 46.5, three_pct: 29.2, ft_pct: 69.4 },
        { id: "4", name: "Tyrese Proctor", number: "5", position: "SG", height: "6-5", weight: 181, class: "Sophomore", hometown: "Sydney, Australia", ppg: 9.4, rpg: 3.3, apg: 3.7, fg_pct: 39.5, three_pct: 31.1, ft_pct: 79.5 },
        { id: "5", name: "Ryan Young", number: "15", position: "C", height: "6-10", weight: 240, class: "Graduate", hometown: "Garnet Valley, PA", ppg: 6.0, rpg: 4.1, apg: 0.8, fg_pct: 57.8, three_pct: 0.0, ft_pct: 65.2 },
      ],
      schedule: [
        { id: "1", date: "2024-11-06", opponent: "Dartmouth", isHome: true, result: "W", score: "92-54", teamScore: 92, oppScore: 54 },
        { id: "2", date: "2024-11-10", opponent: "Lafayette", isHome: true, result: "W", score: "88-66", teamScore: 88, oppScore: 66 },
        { id: "3", date: "2024-11-14", opponent: "South Carolina State", isHome: true, result: "W", score: "84-60", teamScore: 84, oppScore: 60 },
        { id: "4", date: "2024-11-20", opponent: "Arizona", isHome: false, result: "L", score: "71-78", teamScore: 71, oppScore: 78 },
        { id: "5", date: "2024-11-24", opponent: "Michigan State", isHome: false, result: "W", score: "74-73", teamScore: 74, oppScore: 73 },
      ]
    };
    setTeam(mockTeam);
  }, [params.id]);

  if (!team) {
    return <div>Loading...</div>;
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="bg-blue-900 text-white py-8">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold">{team.name} {team.mascot}</h1>
              <p className="text-xl mt-2">{team.conference} Conference</p>
              <p className="mt-1">{team.city}, {team.state} • {team.arena}</p>
              <p className="mt-1">Head Coach: {team.coach}</p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold">{team.wins}-{team.losses}</div>
              <div className="text-lg">({team.confWins}-{team.confLosses} Conf)</div>
              <div className="mt-2 space-y-1">
                <div>KenPom: #{team.kenpomRank}</div>
                <div>NET: #{team.netRank}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-lg mb-8">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              <button
                onClick={() => setActiveTab("roster")}
                className={`py-4 px-6 text-sm font-medium ${
                  activeTab === "roster"
                    ? "border-b-2 border-blue-500 text-blue-600"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Roster
              </button>
              <button
                onClick={() => setActiveTab("schedule")}
                className={`py-4 px-6 text-sm font-medium ${
                  activeTab === "schedule"
                    ? "border-b-2 border-blue-500 text-blue-600"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Schedule
              </button>
              <button
                onClick={() => setActiveTab("stats")}
                className={`py-4 px-6 text-sm font-medium ${
                  activeTab === "stats"
                    ? "border-b-2 border-blue-500 text-blue-600"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Team Stats
              </button>
            </nav>
          </div>

          <div className="p-6">
            {activeTab === "roster" && (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">#</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pos</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Height</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Weight</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Class</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hometown</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">PPG</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">RPG</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">APG</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">FG%</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">3P%</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">FT%</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {team.roster.map((player) => (
                      <tr key={player.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900">{player.number}</td>
                        <td className="px-4 py-3 text-sm">
                          <Link href={`/players/${player.id}`} className="text-blue-600 hover:text-blue-800">
                            {player.name}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">{player.position}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{player.height}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{player.weight}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{player.class}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{player.hometown}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-center">{player.ppg.toFixed(1)}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-center">{player.rpg.toFixed(1)}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-center">{player.apg.toFixed(1)}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-center">{player.fg_pct.toFixed(1)}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-center">{player.three_pct.toFixed(1)}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-center">{player.ft_pct.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === "schedule" && (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Opponent</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Result</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Score</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {team.schedule.map((game) => (
                      <tr key={game.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {new Date(game.date).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <Link href={`/games/${game.id}`} className="text-blue-600 hover:text-blue-800">
                            {game.opponent}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-center">
                          {game.isHome ? "Home" : "Away"}
                        </td>
                        <td className="px-4 py-3 text-sm text-center">
                          <span className={`px-2 py-1 rounded ${
                            game.result === "W" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                          }`}>
                            {game.result}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-center">
                          {game.score}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === "stats" && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="bg-gray-50 rounded-lg p-6">
                  <h3 className="text-lg font-semibold mb-4">Offensive Stats</h3>
                  <dl className="space-y-2">
                    <div className="flex justify-between">
                      <dt className="text-gray-600">Offensive Rating</dt>
                      <dd className="font-medium">{team.offensiveRating.toFixed(1)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-600">Points Per Game</dt>
                      <dd className="font-medium">78.5</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-600">Field Goal %</dt>
                      <dd className="font-medium">46.2%</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-600">3-Point %</dt>
                      <dd className="font-medium">35.8%</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-600">Free Throw %</dt>
                      <dd className="font-medium">72.4%</dd>
                    </div>
                  </dl>
                </div>

                <div className="bg-gray-50 rounded-lg p-6">
                  <h3 className="text-lg font-semibold mb-4">Defensive Stats</h3>
                  <dl className="space-y-2">
                    <div className="flex justify-between">
                      <dt className="text-gray-600">Defensive Rating</dt>
                      <dd className="font-medium">{team.defensiveRating.toFixed(1)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-600">Opp Points Per Game</dt>
                      <dd className="font-medium">65.3</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-600">Steals Per Game</dt>
                      <dd className="font-medium">7.8</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-600">Blocks Per Game</dt>
                      <dd className="font-medium">4.2</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-600">Def Rebounds/Game</dt>
                      <dd className="font-medium">28.5</dd>
                    </div>
                  </dl>
                </div>

                <div className="bg-gray-50 rounded-lg p-6">
                  <h3 className="text-lg font-semibold mb-4">Other Stats</h3>
                  <dl className="space-y-2">
                    <div className="flex justify-between">
                      <dt className="text-gray-600">Pace</dt>
                      <dd className="font-medium">{team.pace.toFixed(1)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-600">Assists Per Game</dt>
                      <dd className="font-medium">15.2</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-600">Turnovers Per Game</dt>
                      <dd className="font-medium">11.8</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-600">Assist/Turnover</dt>
                      <dd className="font-medium">1.29</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-600">Rebound Margin</dt>
                      <dd className="font-medium">+5.3</dd>
                    </div>
                  </dl>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}