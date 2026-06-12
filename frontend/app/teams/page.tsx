"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Team {
  id: string;
  name: string;
  mascot: string;
  conference: string;
  wins: number;
  losses: number;
  confWins: number;
  confLosses: number;
  kenpomRank?: number;
  netRank?: number;
  offensiveRating: number;
  defensiveRating: number;
}

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedConference, setSelectedConference] = useState("all");
  const [sortBy, setSortBy] = useState<keyof Team>("wins");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Mock data - replace with API call
  useEffect(() => {
    const mockTeams: Team[] = [
      { id: "1", name: "Duke", mascot: "Blue Devils", conference: "ACC", wins: 25, losses: 6, confWins: 14, confLosses: 6, kenpomRank: 8, netRank: 10, offensiveRating: 115.2, defensiveRating: 92.3 },
      { id: "2", name: "North Carolina", mascot: "Tar Heels", conference: "ACC", wins: 23, losses: 8, confWins: 13, confLosses: 7, kenpomRank: 15, netRank: 12, offensiveRating: 112.5, defensiveRating: 95.1 },
      { id: "3", name: "Kansas", mascot: "Jayhawks", conference: "Big 12", wins: 27, losses: 4, confWins: 16, confLosses: 2, kenpomRank: 3, netRank: 2, offensiveRating: 118.3, defensiveRating: 89.7 },
      { id: "4", name: "Kentucky", mascot: "Wildcats", conference: "SEC", wins: 22, losses: 9, confWins: 12, confLosses: 6, kenpomRank: 18, netRank: 20, offensiveRating: 110.8, defensiveRating: 96.4 },
      { id: "5", name: "UCLA", mascot: "Bruins", conference: "Pac-12", wins: 24, losses: 7, confWins: 15, confLosses: 5, kenpomRank: 11, netRank: 9, offensiveRating: 114.1, defensiveRating: 93.8 },
      { id: "6", name: "Gonzaga", mascot: "Bulldogs", conference: "WCC", wins: 28, losses: 3, confWins: 17, confLosses: 1, kenpomRank: 1, netRank: 1, offensiveRating: 120.5, defensiveRating: 88.2 },
      { id: "7", name: "Michigan State", mascot: "Spartans", conference: "Big Ten", wins: 21, losses: 10, confWins: 11, confLosses: 9, kenpomRank: 25, netRank: 28, offensiveRating: 108.9, defensiveRating: 98.3 },
      { id: "8", name: "Arizona", mascot: "Wildcats", conference: "Pac-12", wins: 26, losses: 5, confWins: 16, confLosses: 4, kenpomRank: 5, netRank: 4, offensiveRating: 116.7, defensiveRating: 91.2 },
    ];
    setTeams(mockTeams);
  }, []);

  const conferences = ["all", ...new Set(teams.map(t => t.conference))];

  const filteredTeams = teams
    .filter(team => 
      (selectedConference === "all" || team.conference === selectedConference) &&
      (team.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
       team.mascot.toLowerCase().includes(searchTerm.toLowerCase()))
    )
    .sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortOrder === "asc" ? aVal - bVal : bVal - aVal;
      }
      return 0;
    });

  const handleSort = (field: keyof Team) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-8">College Basketball Teams</h1>

        <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Search Teams</label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by team name or mascot..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Conference</label>
              <select
                value={selectedConference}
                onChange={(e) => setSelectedConference(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                {conferences.map(conf => (
                  <option key={conf} value={conf}>
                    {conf === "all" ? "All Conferences" : conf}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Teams Found</label>
              <div className="text-2xl font-bold text-blue-600">{filteredTeams.length}</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Team
                  </th>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort("conference")}
                  >
                    Conference {sortBy === "conference" && (sortOrder === "asc" ? "↑" : "↓")}
                  </th>
                  <th 
                    className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort("wins")}
                  >
                    Record {sortBy === "wins" && (sortOrder === "asc" ? "↑" : "↓")}
                  </th>
                  <th 
                    className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort("confWins")}
                  >
                    Conf Record {sortBy === "confWins" && (sortOrder === "asc" ? "↑" : "↓")}
                  </th>
                  <th 
                    className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort("kenpomRank")}
                  >
                    KenPom {sortBy === "kenpomRank" && (sortOrder === "asc" ? "↑" : "↓")}
                  </th>
                  <th 
                    className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort("netRank")}
                  >
                    NET {sortBy === "netRank" && (sortOrder === "asc" ? "↑" : "↓")}
                  </th>
                  <th 
                    className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort("offensiveRating")}
                  >
                    ORtg {sortBy === "offensiveRating" && (sortOrder === "asc" ? "↑" : "↓")}
                  </th>
                  <th 
                    className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort("defensiveRating")}
                  >
                    DRtg {sortBy === "defensiveRating" && (sortOrder === "asc" ? "↑" : "↓")}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredTeams.map((team) => (
                  <tr key={team.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Link href={`/teams/${team.id}`} className="text-blue-600 hover:text-blue-800">
                        <div className="text-sm font-medium">{team.name}</div>
                        <div className="text-sm text-gray-500">{team.mascot}</div>
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {team.conference}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                      {team.wins}-{team.losses}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                      {team.confWins}-{team.confLosses}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                      {team.kenpomRank}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                      {team.netRank}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                      {team.offensiveRating.toFixed(1)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                      {team.defensiveRating.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-2">Top Offensive Teams</h3>
            <ol className="space-y-1 text-sm">
              {teams.sort((a, b) => b.offensiveRating - a.offensiveRating).slice(0, 5).map((team, idx) => (
                <li key={team.id}>{idx + 1}. {team.name} ({team.offensiveRating.toFixed(1)})</li>
              ))}
            </ol>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-2">Top Defensive Teams</h3>
            <ol className="space-y-1 text-sm">
              {teams.sort((a, b) => a.defensiveRating - b.defensiveRating).slice(0, 5).map((team, idx) => (
                <li key={team.id}>{idx + 1}. {team.name} ({team.defensiveRating.toFixed(1)})</li>
              ))}
            </ol>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-2">Best Records</h3>
            <ol className="space-y-1 text-sm">
              {teams.sort((a, b) => (b.wins / (b.wins + b.losses)) - (a.wins / (a.wins + a.losses))).slice(0, 5).map((team, idx) => (
                <li key={team.id}>{idx + 1}. {team.name} ({team.wins}-{team.losses})</li>
              ))}
            </ol>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-2">Conference Leaders</h3>
            <ul className="space-y-1 text-sm">
              {Array.from(new Set(teams.map(t => t.conference))).map(conf => {
                const leader = teams
                  .filter(t => t.conference === conf)
                  .sort((a, b) => b.confWins - a.confWins)[0];
                return leader ? (
                  <li key={conf}>{conf}: {leader.name}</li>
                ) : null;
              })}
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}