'use client';

import Link from 'next/link';
import { Battery, BatteryCharging, Wifi, Smartphone, ArrowRight, QrCode } from 'lucide-react';

export default function MemberCard({ member, onPairDevice }) {
  const {
    _id,
    displayName,
    role,
    currentStatus = {},
    activeDevice,
    locationSharingEnabled = true
  } = member;

  const state = currentStatus.state || 'NORMAL';
  const batteryLevel = currentStatus.batteryLevel ?? activeDevice?.batteryLevel ?? 100;
  const isCharging = currentStatus.isCharging ?? activeDevice?.isCharging ?? false;
  const networkType = activeDevice?.networkType || '5G';

  // Format Status Label & Pill Color
  function getStatusStyle() {
    switch (state) {
      case 'SOS':
        return {
          label: '🚨 SOS Emergency',
          bg: 'bg-red-500/10 text-red-400 border-red-500/30 animate-pulse'
        };
      case 'AT_HOME':
        return {
          label: '🏠 At Home',
          bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
        };
      case 'AT_WORK':
        return {
          label: '🏢 At Work',
          bg: 'bg-blue-500/10 text-blue-400 border-blue-500/20'
        };
      case 'AT_COLLEGE':
        return {
          label: '🎓 At College',
          bg: 'bg-purple-500/10 text-purple-400 border-purple-500/20'
        };
      case 'TRAVELLING':
        return {
          label: currentStatus.statusMessage || '🚗 Travelling',
          bg: 'bg-amber-500/10 text-amber-400 border-amber-500/20'
        };
      case 'POSSIBLE_ISSUE':
        return {
          label: '⚠️ Possible Issue',
          bg: 'bg-orange-500/10 text-orange-400 border-orange-500/30'
        };
      default:
        return {
          label: '🟢 Safe & Normal',
          bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
        };
    }
  }

  const statusStyle = getStatusStyle();

  return (
    <div className={`relative flex flex-col justify-between rounded-2xl border p-5 transition shadow-sm hover:shadow-md ${
      state === 'SOS'
        ? 'border-red-500/60 bg-red-950/20 shadow-red-500/10'
        : 'border-card-border bg-card hover:border-gray-700'
    }`}>
      <div>
        {/* Top Header: Avatar & Names */}
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className={`flex h-12 w-12 items-center justify-center rounded-2xl text-xl font-bold font-mono shadow-inner ${
              state === 'SOS'
                ? 'bg-red-600 text-white'
                : 'bg-gradient-to-tr from-slate-800 to-slate-700 text-emerald-400 border border-slate-700'
            }`}>
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-lg font-bold text-white leading-tight">{displayName}</h3>
                {role === 'OWNER' && (
                  <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-300">
                    Owner
                  </span>
                )}
                {role === 'ADMIN' && (
                  <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-blue-300">
                    Admin
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                {activeDevice ? activeDevice.deviceName : 'No Phone Paired'}
              </div>
            </div>
          </div>
        </div>

        {/* Live Status Pill */}
        <div className="mt-4">
          <span className={`inline-flex items-center rounded-xl border px-3 py-1 text-xs font-semibold ${statusStyle.bg}`}>
            {statusStyle.label}
          </span>
        </div>

        {/* Telemetry Row */}
        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-card-border/60 pt-3 text-xs text-gray-400">
          <div className="flex items-center space-x-1.5">
            {isCharging ? (
              <BatteryCharging className="h-4 w-4 text-emerald-400" />
            ) : (
              <Battery className={`h-4 w-4 ${batteryLevel <= 20 ? 'text-red-400' : 'text-gray-400'}`} />
            )}
            <span className={batteryLevel <= 20 ? 'text-red-400 font-semibold' : ''}>
              {batteryLevel}% {isCharging ? '(Charging)' : ''}
            </span>
          </div>

          <div className="flex items-center justify-end space-x-1.5">
            <Wifi className="h-4 w-4 text-gray-400" />
            <span>{networkType}</span>
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="mt-4 flex items-center justify-between border-t border-card-border/60 pt-3">
        {!activeDevice ? (
          <button
            onClick={() => onPairDevice(member)}
            className="flex items-center space-x-1.5 text-xs font-semibold text-amber-400 hover:text-amber-300 transition"
          >
            <QrCode className="h-4 w-4" />
            <span>Pair Android Phone</span>
          </button>
        ) : (
          <div className="text-[11px] text-gray-500">
            {locationSharingEnabled ? 'Live tracking active' : 'Tracking paused'}
          </div>
        )}

        <Link
          href={`/members/${_id}`}
          className="flex items-center space-x-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/10 transition"
        >
          <span>View Details</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
