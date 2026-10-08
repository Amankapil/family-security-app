'use client';

import { useState } from 'react';
import { X, UserPlus } from 'lucide-react';

export default function AddMemberModal({ isOpen, onClose, onAddSuccess }) {
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState('MEMBER');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!displayName.trim()) {
      setError('Please provide a name (e.g. Dad, Mom, Brother, Sister).');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await onAddSuccess({
        displayName: displayName.trim(),
        role,
        phone: phone.trim() || undefined
      });
      setDisplayName('');
      setPhone('');
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to add member.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-3xl border border-card-border bg-card p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-card-border/60 pb-4">
          <div className="flex items-center space-x-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
              <UserPlus className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-bold text-white">Add Family Member</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-300">
              Name or Relation *
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Dad, Mom, Brother, Sister, Me"
              className="mt-1.5 w-full rounded-xl border border-card-border bg-[#0B111E] px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300">
              Role in Family
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-card-border bg-[#0B111E] px-4 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition"
            >
              <option value="MEMBER">Member (Location & Safety Protected)</option>
              <option value="ADMIN">Admin (Can manage settings and devices)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300">
              Phone Number (Optional)
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91..."
              className="mt-1.5 w-full rounded-xl border border-card-border bg-[#0B111E] px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition"
            />
          </div>

          <div className="mt-6 flex items-center justify-end space-x-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-gray-400 hover:bg-gray-800 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center space-x-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-600/30 hover:bg-emerald-500 transition disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Member'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
