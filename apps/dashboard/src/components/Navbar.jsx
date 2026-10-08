'use client';

import Link from 'next/link';
import { Shield, UserPlus, LogOut, HeartHandshake } from 'lucide-react';

export default function Navbar({ familyName, onAddMember, onLogout }) {
  return (
    <header className="sticky top-0 z-40 border-b border-card-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center space-x-3 group">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 text-white shadow-lg shadow-emerald-500/20 group-hover:scale-105 transition">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs font-semibold tracking-wider text-emerald-400 uppercase">
              Family Safety Network
            </div>
            <div className="text-lg font-bold text-white leading-tight">
              {familyName || 'My Family'}
            </div>
          </div>
        </Link>

        <div className="flex items-center space-x-3">
          <button
            onClick={onAddMember}
            className="flex items-center space-x-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-500 transition active:scale-95"
          >
            <UserPlus className="h-4 w-4" />
            <span className="hidden sm:inline">Add Member</span>
          </button>

          {onLogout && (
            <button
              onClick={onLogout}
              title="Sign Out"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-card-border bg-card text-gray-400 hover:text-white hover:bg-gray-800 transition"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
