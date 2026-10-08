'use client';

import { useState, useEffect } from 'react';
import { X, QrCode, Smartphone, Check, Copy } from 'lucide-react';
import { api } from '../lib/api';

export default function PairingModal({ isOpen, onClose, member }) {
  const [pairingData, setPairingData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen && member) {
      loadPairingToken();
    } else {
      setPairingData(null);
      setError('');
    }
  }, [isOpen, member]);

  async function loadPairingToken() {
    setLoading(true);
    setError('');
    try {
      const data = await api.createPairingToken(member._id);
      setPairingData(data);
    } catch (err) {
      setError(err.message || 'Failed to generate pairing QR code.');
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (pairingData?.token) {
      navigator.clipboard.writeText(pairingData.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-3xl border border-card-border bg-card p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-card-border/60 pb-4">
          <div className="flex items-center space-x-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
              <QrCode className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Pair {member?.displayName}&apos;s Phone</h3>
              <p className="text-xs text-gray-400">One-time secure pairing token</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
            <p className="mt-3 text-xs text-gray-400">Generating secure pairing token...</p>
          </div>
        ) : error ? (
          <div className="py-6 text-center">
            <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400">
              {error}
            </div>
            <button
              onClick={loadPairingToken}
              className="mt-4 rounded-xl bg-gray-800 px-4 py-2 text-xs font-semibold text-white hover:bg-gray-700"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="mt-5 flex flex-col items-center text-center">
            {/* Visual QR Representation Container */}
            <div className="relative flex flex-col items-center justify-center rounded-2xl border-2 border-emerald-500/40 bg-white p-6 shadow-inner">
              {/* QR Mock Matrix Pattern */}
              <div className="grid grid-cols-6 gap-2 w-44 h-44 p-2 bg-white">
                {Array.from({ length: 36 }).map((_, i) => (
                  <div
                    key={i}
                    className={`rounded-sm ${
                      i % 2 === 0 || i % 5 === 0 || i < 8 || i > 28
                        ? 'bg-gray-900'
                        : 'bg-emerald-600'
                    }`}
                  />
                ))}
              </div>
              <span className="mt-2 text-[10px] font-mono font-bold tracking-widest text-gray-800 uppercase">
                {pairingData?.token}
              </span>
            </div>

            {/* Token Copy Box */}
            <div className="mt-5 flex w-full items-center justify-between rounded-xl border border-card-border bg-[#0B111E] px-4 py-2.5">
              <span className="font-mono text-sm font-bold text-emerald-400 tracking-wider">
                {pairingData?.token}
              </span>
              <button
                onClick={handleCopy}
                className="flex items-center space-x-1 text-xs font-semibold text-gray-300 hover:text-white transition"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>

            {/* Instructions */}
            <div className="mt-4 text-left text-xs text-gray-400 space-y-1.5 w-full bg-slate-900/40 p-3.5 rounded-xl border border-card-border/50">
              <div className="font-semibold text-gray-200">Instructions:</div>
              <div>1. Open the Family Safety APK on {member?.displayName}&apos;s Android phone.</div>
              <div>2. Scan this QR code or type the pairing code above.</div>
              <div>3. Review and accept the non-surveillance consent.</div>
              <div className="text-amber-400 font-medium pt-1">
                ⏳ Expires in {pairingData?.expiresInMinutes || 15} minutes (Single-use).
              </div>
            </div>

            <button
              onClick={onClose}
              className="mt-5 w-full rounded-xl bg-gray-800 py-2.5 text-sm font-semibold text-white hover:bg-gray-700 transition"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
