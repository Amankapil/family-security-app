'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MapPin, Navigation, Battery, Smartphone, ShieldCheck } from 'lucide-react';

export default function FamilyMap({ members, selectedMember, onSelectMember }) {
  const [activePin, setActivePin] = useState(null);

  // Filter members who have valid locations and sharing enabled
  const mappedMembers = (members || []).filter(
    (m) =>
      m.locationSharingEnabled &&
      m.currentStatus?.lastLocation?.latitude &&
      m.currentStatus?.lastLocation?.longitude
  );

  return (
    <div className="relative h-[420px] w-full overflow-hidden rounded-3xl border border-card-border bg-[#0B111E] shadow-inner">
      {/* Background Map Grid Effect */}
      <div className="absolute inset-0 bg-[radial-gradient(#1E293B_1px,transparent_1px)] [background-size:24px_24px] opacity-40 pointer-events-none" />

      {/* Top Overlay Badge */}
      <div className="absolute left-4 top-4 z-10 flex items-center space-x-2 rounded-xl border border-card-border/80 bg-card/90 px-3.5 py-1.5 backdrop-blur-md shadow-lg">
        <div className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
        <span className="text-xs font-semibold text-gray-200">
          Live Family Radar ({mappedMembers.length} Active on Map)
        </span>
      </div>

      {/* Map Surface & Pins */}
      {mappedMembers.length === 0 ? (
        <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-card border border-card-border text-gray-500 mb-3 shadow-lg">
            <Navigation className="h-7 w-7 text-emerald-400 animate-pulse" />
          </div>
          <h4 className="text-base font-bold text-gray-200">No Live Location Fixes Yet</h4>
          <p className="mt-1 max-w-sm text-xs text-gray-400">
            Once family members install and pair the Android APK, their real-time journey pins will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="relative h-full w-full">
          {mappedMembers.map((m, index) => {
            const loc = m.currentStatus.lastLocation;
            const isSos = m.currentStatus.state === 'SOS';
            const isTravelling = m.currentStatus.state === 'TRAVELLING';

            // Layout pins across the canvas based on normalized offset
            const leftPct = 25 + (index * 22) % 60;
            const topPct = 30 + (index * 18) % 50;

            const isSelected = activePin?._id === m._id;

            return (
              <div
                key={m._id}
                style={{ left: `${leftPct}%`, top: `${topPct}%` }}
                className="absolute -translate-x-1/2 -translate-y-1/2 z-20 cursor-pointer"
                onClick={() => setActivePin(isSelected ? null : m)}
              >
                {/* Marker Pin */}
                <div className="group relative flex flex-col items-center">
                  {/* Status Callout Pill */}
                  <div className={`mb-1.5 flex items-center space-x-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold shadow-lg transition backdrop-blur-md ${
                    isSos
                      ? 'border-red-500 bg-red-600 text-white animate-bounce'
                      : isTravelling
                      ? 'border-amber-500/40 bg-amber-950/80 text-amber-300'
                      : 'border-emerald-500/40 bg-slate-900/90 text-emerald-300'
                  }`}>
                    <span>{m.displayName}</span>
                  </div>

                  {/* Pin Dot */}
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full border-2 text-white shadow-xl transition transform group-hover:scale-110 ${
                    isSos
                      ? 'border-white bg-red-600 animate-sos-pulse'
                      : isTravelling
                      ? 'border-amber-400 bg-amber-600'
                      : 'border-emerald-400 bg-emerald-600'
                  }`}>
                    <MapPin className="h-5 w-5" />
                  </div>
                </div>

                {/* Popover Card */}
                {isSelected && (
                  <div className="absolute left-1/2 top-14 -translate-x-1/2 z-30 w-56 rounded-2xl border border-card-border bg-card p-4 shadow-2xl backdrop-blur-md">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-white">{m.displayName}</span>
                      <span className="text-[10px] text-gray-400">
                        {m.currentStatus.state}
                      </span>
                    </div>

                    <div className="mt-2 text-xs text-gray-300">
                      📍 {loc.latitude.toFixed(4)}, {loc.longitude.toFixed(4)}
                    </div>

                    <div className="mt-2 flex items-center justify-between text-xs text-gray-400 border-t border-card-border/60 pt-2">
                      <div className="flex items-center space-x-1">
                        <Battery className="h-3.5 w-3.5 text-emerald-400" />
                        <span>{m.currentStatus.batteryLevel ?? 100}%</span>
                      </div>
                      <Link
                        href={`/members/${m._id}`}
                        className="font-semibold text-emerald-400 hover:underline"
                      >
                        Details →
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
