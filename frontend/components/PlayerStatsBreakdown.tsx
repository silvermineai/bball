'use client';

import React from 'react';

interface PlayerStat {
  player: string;
  team: string;
  minutes: string;
  points: number;
  fgm: number;
  fga: number;
  fg_pct: number;
  tpm: number;
  tpa: number;
  tp_pct: number;
  ftm: number;
  fta: number;
  ft_pct: number;
  oreb: number;
  dreb: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  to: number;
  pf: number;
  plus_minus?: number;
}

interface PlayerStatsBreakdownProps {
  players: PlayerStat[];
  teamName: string;
  teamColor?: string;
}

const PlayerStatsBreakdown: React.FC<PlayerStatsBreakdownProps> = ({ 
  players, 
  teamName,
  teamColor = 'blue'
}) => {
  // Sort players by minutes played
  const sortedPlayers = [...players].sort((a, b) => {
    const aMinutes = parseInt(a.minutes.split(':')[0]);
    const bMinutes = parseInt(b.minutes.split(':')[0]);
    return bMinutes - aMinutes;
  });

  const teamTotals = players.reduce((acc, player) => ({
    points: acc.points + player.points,
    fgm: acc.fgm + player.fgm,
    fga: acc.fga + player.fga,
    tpm: acc.tpm + player.tpm,
    tpa: acc.tpa + player.tpa,
    ftm: acc.ftm + player.ftm,
    fta: acc.fta + player.fta,
    oreb: acc.oreb + player.oreb,
    dreb: acc.dreb + player.dreb,
    reb: acc.reb + player.reb,
    ast: acc.ast + player.ast,
    stl: acc.stl + player.stl,
    blk: acc.blk + player.blk,
    to: acc.to + player.to,
    pf: acc.pf + player.pf,
  }), {
    points: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0,
    oreb: 0, dreb: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0, pf: 0
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className={`text-xl font-bold text-${teamColor}-600`}>{teamName}</h3>
        <div className="text-sm text-gray-500">
          Team Total: {teamTotals.points} pts
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr className="text-xs text-gray-500 uppercase tracking-wider">
              <th className="px-3 py-3 text-left font-medium">Player</th>
              <th className="px-3 py-3 text-center font-medium">MIN</th>
              <th className="px-3 py-3 text-center font-medium">PTS</th>
              <th className="px-3 py-3 text-center font-medium">FG</th>
              <th className="px-3 py-3 text-center font-medium">3PT</th>
              <th className="px-3 py-3 text-center font-medium">FT</th>
              <th className="px-3 py-3 text-center font-medium">REB</th>
              <th className="px-3 py-3 text-center font-medium">AST</th>
              <th className="px-3 py-3 text-center font-medium">STL</th>
              <th className="px-3 py-3 text-center font-medium">BLK</th>
              <th className="px-3 py-3 text-center font-medium">TO</th>
              <th className="px-3 py-3 text-center font-medium">PF</th>
              <th className="px-3 py-3 text-center font-medium">+/-</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedPlayers.map((player, index) => (
              <tr key={index} className="hover:bg-gray-50">
                <td className="px-3 py-4 text-sm font-medium text-gray-900">
                  {player.player}
                </td>
                <td className="px-3 py-4 text-sm text-center text-gray-500">
                  {player.minutes}
                </td>
                <td className="px-3 py-4 text-sm text-center font-semibold">
                  {player.points}
                </td>
                <td className="px-3 py-4 text-sm text-center text-gray-500">
                  {player.fgm}-{player.fga}
                  <div className="text-xs text-gray-400">
                    {player.fga > 0 ? `${player.fg_pct.toFixed(1)}%` : '-'}
                  </div>
                </td>
                <td className="px-3 py-4 text-sm text-center text-gray-500">
                  {player.tpm}-{player.tpa}
                  <div className="text-xs text-gray-400">
                    {player.tpa > 0 ? `${player.tp_pct.toFixed(1)}%` : '-'}
                  </div>
                </td>
                <td className="px-3 py-4 text-sm text-center text-gray-500">
                  {player.ftm}-{player.fta}
                  <div className="text-xs text-gray-400">
                    {player.fta > 0 ? `${player.ft_pct.toFixed(1)}%` : '-'}
                  </div>
                </td>
                <td className="px-3 py-4 text-sm text-center">
                  {player.reb}
                  <div className="text-xs text-gray-400">
                    {player.oreb}-{player.dreb}
                  </div>
                </td>
                <td className="px-3 py-4 text-sm text-center">{player.ast}</td>
                <td className="px-3 py-4 text-sm text-center">{player.stl}</td>
                <td className="px-3 py-4 text-sm text-center">{player.blk}</td>
                <td className="px-3 py-4 text-sm text-center">{player.to}</td>
                <td className="px-3 py-4 text-sm text-center">{player.pf}</td>
                <td className="px-3 py-4 text-sm text-center font-medium">
                  {player.plus_minus !== undefined && (
                    <span className={player.plus_minus > 0 ? 'text-green-600' : player.plus_minus < 0 ? 'text-red-600' : ''}>
                      {player.plus_minus > 0 ? '+' : ''}{player.plus_minus}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            <tr className="bg-gray-100 font-semibold">
              <td className="px-3 py-4 text-sm">Team Totals</td>
              <td className="px-3 py-4 text-sm text-center">200:00</td>
              <td className="px-3 py-4 text-sm text-center">{teamTotals.points}</td>
              <td className="px-3 py-4 text-sm text-center">
                {teamTotals.fgm}-{teamTotals.fga}
                <div className="text-xs">
                  {teamTotals.fga > 0 ? `${(teamTotals.fgm / teamTotals.fga * 100).toFixed(1)}%` : '-'}
                </div>
              </td>
              <td className="px-3 py-4 text-sm text-center">
                {teamTotals.tpm}-{teamTotals.tpa}
                <div className="text-xs">
                  {teamTotals.tpa > 0 ? `${(teamTotals.tpm / teamTotals.tpa * 100).toFixed(1)}%` : '-'}
                </div>
              </td>
              <td className="px-3 py-4 text-sm text-center">
                {teamTotals.ftm}-{teamTotals.fta}
                <div className="text-xs">
                  {teamTotals.fta > 0 ? `${(teamTotals.ftm / teamTotals.fta * 100).toFixed(1)}%` : '-'}
                </div>
              </td>
              <td className="px-3 py-4 text-sm text-center">
                {teamTotals.reb}
                <div className="text-xs">
                  {teamTotals.oreb}-{teamTotals.dreb}
                </div>
              </td>
              <td className="px-3 py-4 text-sm text-center">{teamTotals.ast}</td>
              <td className="px-3 py-4 text-sm text-center">{teamTotals.stl}</td>
              <td className="px-3 py-4 text-sm text-center">{teamTotals.blk}</td>
              <td className="px-3 py-4 text-sm text-center">{teamTotals.to}</td>
              <td className="px-3 py-4 text-sm text-center">{teamTotals.pf}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Points Leader"
          value={sortedPlayers[0]?.player || '-'}
          subtitle={`${sortedPlayers[0]?.points || 0} pts`}
        />
        <StatCard
          title="Rebounds Leader"
          value={[...players].sort((a, b) => b.reb - a.reb)[0]?.player || '-'}
          subtitle={`${[...players].sort((a, b) => b.reb - a.reb)[0]?.reb || 0} reb`}
        />
        <StatCard
          title="Assists Leader"
          value={[...players].sort((a, b) => b.ast - a.ast)[0]?.player || '-'}
          subtitle={`${[...players].sort((a, b) => b.ast - a.ast)[0]?.ast || 0} ast`}
        />
        <StatCard
          title="Efficiency"
          value={`${(teamTotals.fgm + teamTotals.tpm * 0.5) / teamTotals.fga * 100 || 0}%`}
          subtitle="Effective FG%"
        />
      </div>
    </div>
  );
};

function StatCard({ title, value, subtitle }: { title: string; value: string; subtitle: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <div className="text-xs text-gray-500 uppercase">{title}</div>
      <div className="text-lg font-semibold mt-1">{value}</div>
      <div className="text-sm text-gray-600">{subtitle}</div>
    </div>
  );
}

export default PlayerStatsBreakdown;