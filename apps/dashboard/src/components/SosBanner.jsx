'use client';

import { useState } from 'react';
import { AlertOctagon, CheckCircle2, MapPin, Clock, Loader2 } from 'lucide-react';

export default function SosBanner({ alerts = [], onResolve }) {
  const [resolvingId, setResolvingId] = useState(null);

  const activeSos = alerts.filter(
    (a) => (a.alertType === 'SOS' || a.severity === 'CRITICAL') && a.status === 'ACTIVE'
  );

  if (activeSos.length === 0) return null;

  async function handleResolve(alertId) {
    try {
      setResolvingId(alertId);
      await onResolve(alertId);
    } catch (err) {
      console.error('Failed to resolve SOS alert:', err);
    } finally {
      setResolvingId(null);
    }
  }

  return (
    <div className="space-y-2 mb-6">
      {activeSos.map((alert) => {
        const memberName = alert.membershipId?.displayName || 'Family Member';
        const timeStr = alert.createdAt ? new Date(alert.createdAt).toLocaleTimeString() : 'Just now';
        const isResolving = resolvingId === alert._id;

        return (
          <div
            key={alert._id}
            className="relative overflow-hidden rounded-2xl border-2 border-red-500 bg-gradient-to-r from-red-950/90 via-red-900/80 to-red-950/90 p-4 text-white shadow-2xl shadow-red-500/20 backdrop-blur-md animate-pulse"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {/* Left Info */}
              <div className="flex items-start sm:items-center space-x-3.5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-600 shadow-lg text-white">
                  <AlertOctagon className="h-7 w-7 animate-bounce" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-black tracking-widest uppercase bg-red-800/80 border border-red-500 px-2 py-0.5 rounded-full">
                      EMERGENCY SOS ACTIVE
                    </span>
                    <span className="text-xs text-red-200 flex items-center space-x-1">
                      <Clock className="h-3.5 w-3.5" />
                      <span>{timeStr}</span>
                    </span>
                  </div>
                  <h3 className="text-lg font-black text-white mt-0.5 leading-tight">
                    {memberName} triggered an SOS Alert!
                  </h3>
                  <p className="text-xs text-red-200 mt-0.5">
                    {alert.message || 'Emergency distress button pressed. Check on their safety immediately.'}
                  </p>
                </div>
              </div>

              {/* Right Action */}
              <div className="flex items-center space-x-2 sm:self-center">
                <button
                  onClick={() => handleResolve(alert._id)}
                  disabled={isResolving}
                  className="flex items-center space-x-1.5 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-red-900 shadow-md hover:bg-red-50 transition active:scale-95 disabled:opacity-50"
                >
                  {isResolving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-red-900" />
                      <span>Resolving...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <span>Mark Resolved / Safe</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
