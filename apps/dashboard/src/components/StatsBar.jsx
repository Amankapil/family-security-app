'use client';

import { Users, CheckCircle2, Car, AlertTriangle } from 'lucide-react';

export default function StatsBar({ stats }) {
  const { total = 0, normal = 0, travelling = 0, critical = 0 } = stats || {};

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:gap-4">
      {/* Total Members */}
      <div className="flex items-center space-x-3 rounded-2xl border border-card-border bg-card p-4 shadow-sm">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-800 text-slate-300">
          <Users className="h-5 w-5" />
        </div>
        <div>
          <div className="text-2xl font-bold text-white leading-none">{total}</div>
          <div className="text-xs font-medium text-gray-400 mt-1">Total Members</div>
        </div>
      </div>

      {/* Normal Status */}
      <div className="flex items-center space-x-3 rounded-2xl border border-card-border bg-card p-4 shadow-sm">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
          <CheckCircle2 className="h-5 w-5" />
        </div>
        <div>
          <div className="text-2xl font-bold text-emerald-400 leading-none">{normal}</div>
          <div className="text-xs font-medium text-gray-400 mt-1">Normal & Safe</div>
        </div>
      </div>

      {/* In Transit */}
      <div className="flex items-center space-x-3 rounded-2xl border border-card-border bg-card p-4 shadow-sm">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
          <Car className="h-5 w-5" />
        </div>
        <div>
          <div className="text-2xl font-bold text-amber-400 leading-none">{travelling}</div>
          <div className="text-xs font-medium text-gray-400 mt-1">Travelling</div>
        </div>
      </div>

      {/* Critical / SOS */}
      <div className={`flex items-center space-x-3 rounded-2xl border p-4 shadow-sm transition ${
        critical > 0
          ? 'border-red-500/50 bg-red-950/20 text-red-400 animate-pulse'
          : 'border-card-border bg-card text-gray-400'
      }`}>
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${
          critical > 0 ? 'bg-red-500/20 text-red-400' : 'bg-gray-800 text-gray-400'
        }`}>
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div>
          <div className={`text-2xl font-bold leading-none ${critical > 0 ? 'text-red-400' : 'text-gray-300'}`}>
            {critical}
          </div>
          <div className="text-xs font-medium mt-1">Critical / SOS</div>
        </div>
      </div>
    </div>
  );
}
