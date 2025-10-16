import React from 'react';

export default function GameCard({ title, description, icon, onStart, difficulty, players, duration, badgeColor }) {
  return (
    <div className="bg-[#181825] rounded-2xl border border-[#232336] shadow-[0_0_24px_0_rgba(236,72,153,0.15)] p-6 hover:shadow-[0_0_32px_0_rgba(236,72,153,0.25)] transition-all duration-300">
      <div className="flex items-center gap-3 mb-4">
        <div className="text-3xl">{icon}</div>
        <div>
          <h3 className="text-xl font-bold text-white">{title}</h3>
          <p className="text-sm text-gray-400">{description}</p>
        </div>
      </div>
      
      <div className="flex flex-wrap gap-2 mb-4">
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${badgeColor} text-white`}>
          {difficulty}
        </span>
        <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-600 bg-opacity-20 text-blue-400">
          {players}
        </span>
        <span className="px-2 py-1 rounded-full text-xs font-medium bg-purple-600 bg-opacity-20 text-purple-400">
          {duration}
        </span>
      </div>
      
      <button
        onClick={onStart}
        className="w-full bg-gradient-to-r from-[#a259ff] to-[#f246a9] text-white font-semibold py-3 px-6 rounded-xl hover:from-[#8a4fd8] hover:to-[#d63d8f] transition-all duration-300 shadow-[0_4px_24px_0_rgba(236,72,153,0.3)] hover:shadow-[0_6px_32px_0_rgba(236,72,153,0.4)]"
      >
        Start Game
      </button>
    </div>
  );
} 