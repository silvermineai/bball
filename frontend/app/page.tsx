import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8 text-center">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">Basketball Analytics Portal</h1>
          <p className="text-xl text-gray-600">AI-Powered College Basketball Insights for Coaches</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          <Link href="/teams" className="bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow">
            <div className="text-blue-600 mb-4">
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold mb-2">Teams</h2>
            <p className="text-gray-600">Browse and analyze college basketball teams, rosters, and performance metrics</p>
          </Link>

          <Link href="/players" className="bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow">
            <div className="text-green-600 mb-4">
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold mb-2">Players</h2>
            <p className="text-gray-600">Individual player stats, trends, and performance analysis</p>
          </Link>

          <Link href="/games" className="bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow">
            <div className="text-purple-600 mb-4">
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold mb-2">Games</h2>
            <p className="text-gray-600">Game results, box scores, and play-by-play analysis</p>
          </Link>

          <Link href="/analytics" className="bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow">
            <div className="text-red-600 mb-4">
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold mb-2">Analytics</h2>
            <p className="text-gray-600">Advanced statistics, trends, and predictive insights</p>
          </Link>

          <Link href="/matchups" className="bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow">
            <div className="text-orange-600 mb-4">
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold mb-2">Matchups</h2>
            <p className="text-gray-600">Head-to-head comparisons and game planning tools</p>
          </Link>

          <Link href="/scouting" className="bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow">
            <div className="text-indigo-600 mb-4">
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold mb-2">Scouting</h2>
            <p className="text-gray-600">Opponent analysis and strategic insights</p>
          </Link>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-8">
          <h2 className="text-3xl font-bold mb-6">Quick Stats</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="text-4xl font-bold text-blue-600">358</div>
              <div className="text-gray-600 mt-2">Teams Tracked</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-green-600">4,521</div>
              <div className="text-gray-600 mt-2">Active Players</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-purple-600">1,245</div>
              <div className="text-gray-600 mt-2">Games This Season</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-red-600">98.5%</div>
              <div className="text-gray-600 mt-2">Data Accuracy</div>
            </div>
          </div>
        </div>

        <div className="mt-8 bg-blue-100 rounded-lg p-6">
          <h3 className="text-xl font-semibold mb-2">Recent Updates</h3>
          <ul className="space-y-2 text-gray-700">
            <li>• New advanced metrics added for shot quality analysis</li>
            <li>• Player tracking data integrated for movement patterns</li>
            <li>• Updated matchup predictor with 2024 season data</li>
            <li>• Enhanced scouting reports with AI-generated insights</li>
          </ul>
        </div>
      </div>
    </main>
  );
}