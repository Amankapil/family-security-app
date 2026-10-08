'use client';

import { Search } from 'lucide-react';

export default function FilterBar({ searchQuery, onSearchChange, activeFilter, onFilterChange }) {
  const filters = [
    { id: 'ALL', label: 'All' },
    { id: 'AT_HOME', label: '🏠 At Home' },
    { id: 'TRAVELLING', label: '🚗 Travelling' },
    { id: 'AT_WORK', label: '🏢 At Work' },
    { id: 'SOS', label: '🚨 SOS' }
  ];

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {/* Search Bar */}
      <div className="relative w-full sm:max-w-xs">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search family member..."
          className="w-full rounded-xl border border-card-border bg-card pl-10 pr-4 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition"
        />
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
        {filters.map((f) => {
          const isActive = activeFilter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => onFilterChange(f.id)}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition ${
                isActive
                  ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/30'
                  : 'border border-card-border bg-card text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
