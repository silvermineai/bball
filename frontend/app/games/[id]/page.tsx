"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import ShotChart from "@/components/ShotChart";
import ShotHeatmap from "@/components/ShotHeatmap";

interface GameDetails {
  id: string;
  date: string;
  homeTeam: {
    id: string;
    name: string;
    mascot: string;
    score: number;
    stats: TeamStats;
    players: PlayerGameStats[];
  };
  awayTeam: {
    id: string;
    name: string;
    mascot: string;
    score: number;
    stats: TeamStats;
    players: PlayerGameStats[];
  };
  status: string;
  venue: string;
  attendance: number;
}

interface TeamStats {
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  fieldGoalPercentage: number;
  threePointersMade: number;
  threePointersAttempted: number;
  threePointPercentage: number;
  freeThrowsMade: number;
  freeThrowsAttempted: number;
  freeThrowPercentage: number;
  offensiveRebounds: number;
  defensiveRebounds: number;
  totalRebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fouls: number;
  fastBreakPoints: number;
  pointsInPaint: number;
  secondChancePoints: number;
  benchPoints: number;
}

interface PlayerGameStats {
  id: string;
  name: string;
  number: string;
  position: string;
  minutes: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fouls: number;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  threePointersMade: number;
  threePointersAttempted: number;
  freeThrowsMade: number;
  freeThrowsAttempted: number;
}

export default function GameDetailPage() {
  const params = useParams();
  const [game, setGame] = useState<GameDetails | null>(null);
  const [activeTab, setActiveTab] = useState<"box-score" | "team-stats" | "analytics" | "shot-chart">("box-score");
  const [chartType, setChartType] = useState<"full" | "half" | "heatmap">("half");

  useEffect(() => {
    // Mock data - replace with API call
    const mockGame: GameDetails = {
      id: params.id as string,
      date: "2024-01-20",
      homeTeam: {
        id: "duke",
        name: "Duke",
        mascot: "Blue Devils",
        score: 78,
        stats: {
          fieldGoalsMade: 28,
          fieldGoalsAttempted: 62,
          fieldGoalPercentage: 45.2,
          threePointersMade: 8,
          threePointersAttempted: 22,
          threePointPercentage: 36.4,
          freeThrowsMade: 14,
          freeThrowsAttempted: 18,
          freeThrowPercentage: 77.8,
          offensiveRebounds: 10,
          defensiveRebounds: 25,
          totalRebounds: 35,
          assists: 16,
          steals: 7,
          blocks: 4,
          turnovers: 12,
          fouls: 16,
          fastBreakPoints: 12,
          pointsInPaint: 32,
          secondChancePoints: 14,
          benchPoints: 22
        },
        players: [
          {
            id: "1",
            name: "Kyle Filipowski",
            number: "30",
            position: "C",
            minutes: 32,
            points: 22,
            rebounds: 11,
            assists: 3,
            steals: 1,
            blocks: 2,
            turnovers: 2,
            fouls: 3,
            fieldGoalsMade: 8,
            fieldGoalsAttempted: 14,
            threePointersMade: 2,
            threePointersAttempted: 4,
            freeThrowsMade: 4,
            freeThrowsAttempted: 5
          },
          {
            id: "2",
            name: "Jeremy Roach",
            number: "3",
            position: "PG",
            minutes: 28,
            points: 16,
            rebounds: 3,
            assists: 5,
            steals: 2,
            blocks: 0,
            turnovers: 3,
            fouls: 2,
            fieldGoalsMade: 6,
            fieldGoalsAttempted: 13,
            threePointersMade: 2,
            threePointersAttempted: 6,
            freeThrowsMade: 2,
            freeThrowsAttempted: 2
          }
        ]
      },
      awayTeam: {
        id: "unc",
        name: "North Carolina",
        mascot: "Tar Heels",
        score: 75,
        stats: {
          fieldGoalsMade: 27,
          fieldGoalsAttempted: 65,
          fieldGoalPercentage: 41.5,
          threePointersMade: 6,
          threePointersAttempted: 20,
          threePointPercentage: 30.0,
          freeThrowsMade: 15,
          freeThrowsAttempted: 20,
          freeThrowPercentage: 75.0,
          offensiveRebounds: 12,
          defensiveRebounds: 23,
          totalRebounds: 35,
          assists: 14,
          steals: 5,
          blocks: 3,
          turnovers: 14,
          fouls: 18,
          fastBreakPoints: 8,
          pointsInPaint: 28,
          secondChancePoints: 16,
          benchPoints: 18
        },
        players: [
          {
            id: "3",
            name: "Armando Bacot",
            number: "5",
            position: "C",
            minutes: 30,
            points: 18,
            rebounds: 12,
            assists: 2,
            steals: 0,
            blocks: 1,
            turnovers: 3,
            fouls: 4,
            fieldGoalsMade: 7,
            fieldGoalsAttempted: 12,
            threePointersMade: 0,
            threePointersAttempted: 0,
            freeThrowsMade: 4,
            freeThrowsAttempted: 6
          }
        ]
      },
      status: "final",
      venue: "Cameron Indoor Stadium",
      attendance: 9314
    };
    setGame(mockGame);
  }, [params.id]);

  if (!game) {
    return <div>Loading...</div>;
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="bg-gray-900 text-white py-8">
        <div className="container mx-auto px-4">
          <div className="text-center mb-4">
            <p className="text-lg">
              {new Date(game.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
            <p className="text-sm text-gray-400">{game.venue} • Attendance: {game.attendance.toLocaleString()}</p>
          </div>
          
          <div className="flex items-center justify-center space-x-8">
            <div className="text-center">
              <Link href={`/teams/${game.awayTeam.id}`} className="hover:text-blue-300">
                <h2 className="text-2xl font-bold">{game.awayTeam.name}</h2>
                <p className="text-gray-400">{game.awayTeam.mascot}</p>
              </Link>
              <div className="text-5xl font-bold mt-4">{game.awayTeam.score}</div>
            </div>
            
            <div className="text-3xl font-bold text-gray-500">vs</div>
            
            <div className="text-center">
              <Link href={`/teams/${game.homeTeam.id}`} className="hover:text-blue-300">
                <h2 className="text-2xl font-bold">{game.homeTeam.name}</h2>
                <p className="text-gray-400">{game.homeTeam.mascot}</p>
              </Link>
              <div className="text-5xl font-bold mt-4">{game.homeTeam.score}</div>
            </div>
          </div>
          
          <div className="text-center mt-6">
            <span className="inline-block px-4 py-2 bg-gray-800 rounded-full text-sm">
              FINAL
            </span>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-lg">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              <button
                onClick={() => setActiveTab("box-score")}
                className={`py-4 px-6 text-sm font-medium ${
                  activeTab === "box-score"
                    ? "border-b-2 border-blue-500 text-blue-600"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Box Score
              </button>
              <button
                onClick={() => setActiveTab("team-stats")}
                className={`py-4 px-6 text-sm font-medium ${
                  activeTab === "team-stats"
                    ? "border-b-2 border-blue-500 text-blue-600"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Team Stats
              </button>
              <button
                onClick={() => setActiveTab("analytics")}
                className={`py-4 px-6 text-sm font-medium ${
                  activeTab === "analytics"
                    ? "border-b-2 border-blue-500 text-blue-600"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Analytics
              </button>
              <button
                onClick={() => setActiveTab("shot-chart")}
                className={`py-4 px-6 text-sm font-medium ${
                  activeTab === "shot-chart"
                    ? "border-b-2 border-blue-500 text-blue-600"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Shot Chart
              </button>
            </nav>
          </div>

          <div className="p-6">
            {activeTab === "box-score" && (
              <div className="space-y-8">
                <BoxScoreTable team={game.awayTeam} teamName={game.awayTeam.name} />
                <BoxScoreTable team={game.homeTeam} teamName={game.homeTeam.name} />
              </div>
            )}

            {activeTab === "team-stats" && (
              <TeamStatsComparison homeTeam={game.homeTeam} awayTeam={game.awayTeam} />
            )}

            {activeTab === "analytics" && (
              <GameAnalytics game={game} />
            )}

            {activeTab === "shot-chart" && (
              <ShotChartView chartType={chartType} setChartType={setChartType} />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function BoxScoreTable({ team, teamName }: { team: any; teamName: string }) {
  return (
    <div>
      <h3 className="text-xl font-bold mb-4">{teamName}</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead>
            <tr className="text-xs text-gray-500 uppercase">
              <th className="px-2 py-2 text-left">Player</th>
              <th className="px-2 py-2 text-center">MIN</th>
              <th className="px-2 py-2 text-center">PTS</th>
              <th className="px-2 py-2 text-center">REB</th>
              <th className="px-2 py-2 text-center">AST</th>
              <th className="px-2 py-2 text-center">STL</th>
              <th className="px-2 py-2 text-center">BLK</th>
              <th className="px-2 py-2 text-center">TO</th>
              <th className="px-2 py-2 text-center">FG</th>
              <th className="px-2 py-2 text-center">3PT</th>
              <th className="px-2 py-2 text-center">FT</th>
              <th className="px-2 py-2 text-center">PF</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {team.players.map((player: PlayerGameStats) => (
              <tr key={player.id} className="text-sm">
                <td className="px-2 py-2">
                  <Link href={`/players/${player.id}`} className="text-blue-600 hover:text-blue-800">
                    {player.name} <span className="text-gray-500">#{player.number} {player.position}</span>
                  </Link>
                </td>
                <td className="px-2 py-2 text-center">{player.minutes}</td>
                <td className="px-2 py-2 text-center font-semibold">{player.points}</td>
                <td className="px-2 py-2 text-center">{player.rebounds}</td>
                <td className="px-2 py-2 text-center">{player.assists}</td>
                <td className="px-2 py-2 text-center">{player.steals}</td>
                <td className="px-2 py-2 text-center">{player.blocks}</td>
                <td className="px-2 py-2 text-center">{player.turnovers}</td>
                <td className="px-2 py-2 text-center text-xs">
                  {player.fieldGoalsMade}-{player.fieldGoalsAttempted}
                </td>
                <td className="px-2 py-2 text-center text-xs">
                  {player.threePointersMade}-{player.threePointersAttempted}
                </td>
                <td className="px-2 py-2 text-center text-xs">
                  {player.freeThrowsMade}-{player.freeThrowsAttempted}
                </td>
                <td className="px-2 py-2 text-center">{player.fouls}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TeamStatsComparison({ homeTeam, awayTeam }: { homeTeam: any; awayTeam: any }) {
  const stats = [
    { label: "Field Goals", away: `${awayTeam.stats.fieldGoalsMade}/${awayTeam.stats.fieldGoalsAttempted}`, home: `${homeTeam.stats.fieldGoalsMade}/${homeTeam.stats.fieldGoalsAttempted}` },
    { label: "Field Goal %", away: `${awayTeam.stats.fieldGoalPercentage.toFixed(1)}%`, home: `${homeTeam.stats.fieldGoalPercentage.toFixed(1)}%` },
    { label: "3-Pointers", away: `${awayTeam.stats.threePointersMade}/${awayTeam.stats.threePointersAttempted}`, home: `${homeTeam.stats.threePointersMade}/${homeTeam.stats.threePointersAttempted}` },
    { label: "3-Point %", away: `${awayTeam.stats.threePointPercentage.toFixed(1)}%`, home: `${homeTeam.stats.threePointPercentage.toFixed(1)}%` },
    { label: "Free Throws", away: `${awayTeam.stats.freeThrowsMade}/${awayTeam.stats.freeThrowsAttempted}`, home: `${homeTeam.stats.freeThrowsMade}/${homeTeam.stats.freeThrowsAttempted}` },
    { label: "Free Throw %", away: `${awayTeam.stats.freeThrowPercentage.toFixed(1)}%`, home: `${homeTeam.stats.freeThrowPercentage.toFixed(1)}%` },
    { label: "Rebounds", away: awayTeam.stats.totalRebounds, home: homeTeam.stats.totalRebounds },
    { label: "Offensive Reb", away: awayTeam.stats.offensiveRebounds, home: homeTeam.stats.offensiveRebounds },
    { label: "Assists", away: awayTeam.stats.assists, home: homeTeam.stats.assists },
    { label: "Steals", away: awayTeam.stats.steals, home: homeTeam.stats.steals },
    { label: "Blocks", away: awayTeam.stats.blocks, home: homeTeam.stats.blocks },
    { label: "Turnovers", away: awayTeam.stats.turnovers, home: homeTeam.stats.turnovers },
    { label: "Fast Break Pts", away: awayTeam.stats.fastBreakPoints, home: homeTeam.stats.fastBreakPoints },
    { label: "Points in Paint", away: awayTeam.stats.pointsInPaint, home: homeTeam.stats.pointsInPaint },
    { label: "2nd Chance Pts", away: awayTeam.stats.secondChancePoints, home: homeTeam.stats.secondChancePoints },
    { label: "Bench Points", away: awayTeam.stats.benchPoints, home: homeTeam.stats.benchPoints },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="grid grid-cols-3 gap-4 text-center mb-6">
        <div className="font-semibold">{awayTeam.name}</div>
        <div></div>
        <div className="font-semibold">{homeTeam.name}</div>
      </div>
      
      {stats.map((stat, index) => (
        <div key={index} className="grid grid-cols-3 gap-4 py-3 border-b border-gray-200">
          <div className="text-right">{stat.away}</div>
          <div className="text-center font-medium">{stat.label}</div>
          <div className="text-left">{stat.home}</div>
        </div>
      ))}
    </div>
  );
}

function GameAnalytics({ game }: { game: GameDetails }) {
  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-xl font-bold mb-4">Key Insights</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-gray-50 rounded-lg p-6">
            <h4 className="font-semibold mb-2">Shooting Efficiency</h4>
            <p className="text-sm text-gray-600">
              {game.homeTeam.name} shot {game.homeTeam.stats.fieldGoalPercentage.toFixed(1)}% from the field compared to {game.awayTeam.name}'s {game.awayTeam.stats.fieldGoalPercentage.toFixed(1)}%.
              The home team's superior shooting efficiency was a key factor in their victory.
            </p>
          </div>
          
          <div className="bg-gray-50 rounded-lg p-6">
            <h4 className="font-semibold mb-2">Rebounding Battle</h4>
            <p className="text-sm text-gray-600">
              Both teams grabbed {game.homeTeam.stats.totalRebounds} rebounds. 
              {game.homeTeam.stats.offensiveRebounds > game.awayTeam.stats.offensiveRebounds ? game.homeTeam.name : game.awayTeam.name} dominated
              the offensive glass with {Math.max(game.homeTeam.stats.offensiveRebounds, game.awayTeam.stats.offensiveRebounds)} offensive rebounds.
            </p>
          </div>
          
          <div className="bg-gray-50 rounded-lg p-6">
            <h4 className="font-semibold mb-2">Turnover Margin</h4>
            <p className="text-sm text-gray-600">
              {game.homeTeam.name} committed {game.homeTeam.stats.turnovers} turnovers while forcing {game.awayTeam.stats.turnovers} from {game.awayTeam.name}.
              This {Math.abs(game.homeTeam.stats.turnovers - game.awayTeam.stats.turnovers)} turnover differential contributed to the final outcome.
            </p>
          </div>
          
          <div className="bg-gray-50 rounded-lg p-6">
            <h4 className="font-semibold mb-2">Bench Production</h4>
            <p className="text-sm text-gray-600">
              {game.homeTeam.name}'s bench contributed {game.homeTeam.stats.benchPoints} points compared to {game.awayTeam.stats.benchPoints} from {game.awayTeam.name}.
              Depth played a {game.homeTeam.stats.benchPoints > 20 ? 'significant' : 'moderate'} role in this matchup.
            </p>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-xl font-bold mb-4">Four Factors Analysis</h3>
        <div className="grid grid-cols-2 gap-8">
          <div className="space-y-4">
            <h4 className="font-semibold text-center">{game.awayTeam.name}</h4>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Effective FG%</span>
                <span className="font-medium">
                  {((game.awayTeam.stats.fieldGoalsMade + 0.5 * game.awayTeam.stats.threePointersMade) / game.awayTeam.stats.fieldGoalsAttempted * 100).toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Turnover Rate</span>
                <span className="font-medium">
                  {(game.awayTeam.stats.turnovers / (game.awayTeam.stats.fieldGoalsAttempted + 0.44 * game.awayTeam.stats.freeThrowsAttempted + game.awayTeam.stats.turnovers) * 100).toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Off Reb Rate</span>
                <span className="font-medium">
                  {(game.awayTeam.stats.offensiveRebounds / (game.awayTeam.stats.offensiveRebounds + game.homeTeam.stats.defensiveRebounds) * 100).toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">FT Rate</span>
                <span className="font-medium">
                  {(game.awayTeam.stats.freeThrowsAttempted / game.awayTeam.stats.fieldGoalsAttempted).toFixed(3)}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="font-semibold text-center">{game.homeTeam.name}</h4>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Effective FG%</span>
                <span className="font-medium">
                  {((game.homeTeam.stats.fieldGoalsMade + 0.5 * game.homeTeam.stats.threePointersMade) / game.homeTeam.stats.fieldGoalsAttempted * 100).toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Turnover Rate</span>
                <span className="font-medium">
                  {(game.homeTeam.stats.turnovers / (game.homeTeam.stats.fieldGoalsAttempted + 0.44 * game.homeTeam.stats.freeThrowsAttempted + game.homeTeam.stats.turnovers) * 100).toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Off Reb Rate</span>
                <span className="font-medium">
                  {(game.homeTeam.stats.offensiveRebounds / (game.homeTeam.stats.offensiveRebounds + game.awayTeam.stats.defensiveRebounds) * 100).toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">FT Rate</span>
                <span className="font-medium">
                  {(game.homeTeam.stats.freeThrowsAttempted / game.homeTeam.stats.fieldGoalsAttempted).toFixed(3)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ShotChartView({ chartType, setChartType }: { chartType: string; setChartType: (type: "full" | "half" | "heatmap") => void }) {
  // Mock shot data - replace with real data from API
  const mockShots = [
    { x: 77.08, y: 46.5, made: true, player: "Kyle Filipowski", team: "Duke", time: "19:45", is_three: false, x_oneside: 16.92, y_oneside: 3.5 },
    { x: 19.74, y: 35.0, made: false, player: "Jeremy Roach", team: "Duke", time: "19:14", is_three: false, x_oneside: 19.74, y_oneside: 35.0 },
    { x: 90.0, y: 25.0, made: true, player: "Mark Mitchell", team: "Duke", time: "18:30", is_three: true, x_oneside: 4.0, y_oneside: 25.0 },
    { x: 15.0, y: 15.0, made: true, player: "Armando Bacot", team: "UNC", time: "17:45", is_three: false, x_oneside: 15.0, y_oneside: 15.0 },
    { x: 85.0, y: 40.0, made: false, player: "RJ Davis", team: "UNC", time: "16:20", is_three: true, x_oneside: 9.0, y_oneside: 40.0 },
    { x: 50.0, y: 20.0, made: true, player: "Caleb Love", team: "UNC", time: "15:30", is_three: false, x_oneside: 44.0, y_oneside: 20.0 },
    { x: 25.0, y: 45.0, made: false, player: "Tyrese Proctor", team: "Duke", time: "14:15", is_three: true, x_oneside: 25.0, y_oneside: 45.0 },
    { x: 82.0, y: 10.0, made: true, player: "Kyle Filipowski", team: "Duke", time: "12:30", is_three: false, x_oneside: 12.0, y_oneside: 10.0 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-center space-x-4">
        <button
          onClick={() => setChartType("full")}
          className={`px-4 py-2 rounded-lg ${
            chartType === "full"
              ? "bg-blue-500 text-white"
              : "bg-gray-200 text-gray-700 hover:bg-gray-300"
          }`}
        >
          Full Court
        </button>
        <button
          onClick={() => setChartType("half")}
          className={`px-4 py-2 rounded-lg ${
            chartType === "half"
              ? "bg-blue-500 text-white"
              : "bg-gray-200 text-gray-700 hover:bg-gray-300"
          }`}
        >
          Half Court
        </button>
        <button
          onClick={() => setChartType("heatmap")}
          className={`px-4 py-2 rounded-lg ${
            chartType === "heatmap"
              ? "bg-blue-500 text-white"
              : "bg-gray-200 text-gray-700 hover:bg-gray-300"
          }`}
        >
          Heatmap
        </button>
      </div>

      <div className="flex justify-center">
        {chartType === "full" && (
          <ShotChart shots={mockShots} width={940} height={500} halfCourt={false} />
        )}
        {chartType === "half" && (
          <ShotChart shots={mockShots} width={470} height={500} halfCourt={true} />
        )}
        {chartType === "heatmap" && (
          <ShotHeatmap shots={mockShots} width={470} height={500} halfCourt={true} />
        )}
      </div>

      <div className="mt-6">
        <h4 className="text-lg font-semibold mb-3">Shot Summary</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-green-600">
              {mockShots.filter(s => s.made).length}/{mockShots.length}
            </div>
            <div className="text-sm text-gray-600">Total FG</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">
              {mockShots.filter(s => s.made && s.is_three).length}/{mockShots.filter(s => s.is_three).length}
            </div>
            <div className="text-sm text-gray-600">3-Pointers</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold">
              {((mockShots.filter(s => s.made).length / mockShots.length) * 100).toFixed(1)}%
            </div>
            <div className="text-sm text-gray-600">FG Percentage</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold">
              {mockShots.filter(s => s.is_three).length > 0
                ? ((mockShots.filter(s => s.made && s.is_three).length / mockShots.filter(s => s.is_three).length) * 100).toFixed(1)
                : 0}%
            </div>
            <div className="text-sm text-gray-600">3PT Percentage</div>
          </div>
        </div>
      </div>
    </div>
  );
}