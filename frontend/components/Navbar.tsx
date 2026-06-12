"use client";

import Link from "next/link";
import { useState } from "react";

export default function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <nav className="bg-blue-900 text-white shadow-lg">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center py-4">
          <Link href="/" className="text-2xl font-bold">
            🏀 Basketball Analytics
          </Link>
          
          <div className="hidden md:flex space-x-8">
            <Link href="/" className="hover:text-blue-200 transition">Dashboard</Link>
            <Link href="/teams" className="hover:text-blue-200 transition">Teams</Link>
            <Link href="/players" className="hover:text-blue-200 transition">Players</Link>
            <Link href="/games" className="hover:text-blue-200 transition">Games</Link>
            <Link href="/analytics" className="hover:text-blue-200 transition">Analytics</Link>
            <Link href="/matchups" className="hover:text-blue-200 transition">Matchups</Link>
          </div>

          <button 
            className="md:hidden"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d={isMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
            </svg>
          </button>
        </div>

        {isMenuOpen && (
          <div className="md:hidden py-4 border-t border-blue-800">
            <Link href="/" className="block py-2 hover:text-blue-200">Dashboard</Link>
            <Link href="/teams" className="block py-2 hover:text-blue-200">Teams</Link>
            <Link href="/players" className="block py-2 hover:text-blue-200">Players</Link>
            <Link href="/games" className="block py-2 hover:text-blue-200">Games</Link>
            <Link href="/analytics" className="block py-2 hover:text-blue-200">Analytics</Link>
            <Link href="/matchups" className="block py-2 hover:text-blue-200">Matchups</Link>
          </div>
        )}
      </div>
    </nav>
  );
}