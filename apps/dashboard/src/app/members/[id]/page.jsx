'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Shield,
  Smartphone,
  Battery,
  BatteryCharging,
  Wifi,
  MapPin,
  Clock,
  Navigation,
  CheckCircle2,
  AlertTriangle,
  QrCode,
  Eye,
  EyeOff,
  RefreshCw,
  Compass
} from 'lucide-react';
import { api } from '../../../lib/api';
import PairingModal from '../../../components/PairingModal';
import { useRealtime } from '../../../hooks/useRealtime';

export default function MemberDetailPage() {
  const params = useParams();
  const router = useRouter();
  const memberId = params?.id;

  const [loading, setLoading] = useState(true);
  const [member, setMember] = useState(null);
  const [locations, setLocations] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [journeys, setJourneys] = useState([]);
  const [diagnostics, setDiagnostics] = useState(null);
  const [error, setError] = useState('');
  const [isPairingOpen, setIsPairingOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const loadMemberData = useCallback(async () => {
    if (!memberId) return;
    try {
      setLoading(true);
      const [memberData, locData, timelineData, journeysData, diagData] = await Promise.all([
        api.getMember(memberId),
        api.getMemberLocations(memberId).catch(() => []),
        api.getMemberTimeline(memberId).catch(() => null),
        api.getMemberJourneys(memberId).catch(() => []),
        api.getMemberDiagnostics(memberId).catch(() => null)
      ]);

      setMember(memberData);
      setLocations(Array.isArray(locData) ? locData : []);
      setTimeline(timelineData?.timelineEvents || []);
      setJourneys(Array.isArray(journeysData) ? journeysData : []);
      setDiagnostics(diagData?.diagnostics || null);
      setError('');
    } catch (err) {
      console.error('Failed to load member detail:', err);
      setError(err.message || 'Unable to retrieve member profile.');
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => {
    loadMemberData();
  }, [loadMemberData]);

  // Realtime updates for this member
  const handleLocationUpdate = useCallback((data) => {
    if (data.memberId === memberId) {
      setMember((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          currentStatus: {
            ...prev.currentStatus,
            lastLocation: {
              latitude: data.latitude,
              longitude: data.longitude,
              accuracy: data.accuracy,
              updatedAt: data.recordedAt || new Date().toISOString()
            },
            batteryLevel: data.batteryLevel !== undefined ? data.batteryLevel : prev.currentStatus?.batteryLevel,
            state: data.state || prev.currentStatus?.state
          }
        };
      });
    }
  }, [memberId]);

  const handleStatusChange = useCallback((data) => {
    if (data.memberId === memberId) {
      setMember((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          currentStatus: {
            ...prev.currentStatus,
            state: data.state || prev.currentStatus?.state,
            statusMessage: data.statusMessage || prev.currentStatus?.statusMessage
          }
        };
      });
    }
  }, [memberId]);

  const handleJourneyEvent = useCallback((event) => {
    if (event.memberId === memberId) {
      loadMemberData();
    }
  }, [memberId, loadMemberData]);

  useRealtime({
    familyId: member?.familyId,
    onLocationUpdate: handleLocationUpdate,
    onStatusChange: handleStatusChange,
    onJourneyEvent: handleJourneyEvent
  });

  async function handleToggleLocationSharing() {
    if (!member) return;
    try {
      setActionLoading(true);
      const newStatus = !member.locationSharingEnabled;
      const updated = await api.updateMember(member._id, {
        locationSharingEnabled: newStatus
      });
      setMember(updated);
    } catch (err) {
      alert(`Failed to update privacy settings: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#090D16] text-gray-300">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-600/10 border border-emerald-500/20 shadow-2xl mb-4">
          <Shield className="h-8 w-8 text-emerald-400 animate-pulse" />
        </div>
        <p className="text-sm font-semibold tracking-wide text-gray-400">Loading member diagnostics...</p>
      </div>
    );
  }

  if (!member || error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#090D16] p-6 text-gray-300">
        <div className="max-w-md text-center">
          <h2 className="text-lg font-bold text-white">Member Not Found</h2>
          <p className="mt-1 text-xs text-gray-400">{error || 'This family member profile does not exist.'}</p>
          <Link
            href="/"
            className="mt-4 inline-flex items-center space-x-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Return to Dashboard</span>
          </Link>
        </div>
      </div>
    );
  }

  const { displayName, role, currentStatus = {}, activeDevice, locationSharingEnabled } = member;
  const state = currentStatus.state || 'NORMAL';
  const lastLocation = currentStatus.lastLocation;
  const batteryLevel = currentStatus.batteryLevel ?? activeDevice?.batteryLevel ?? 100;
  const isCharging = currentStatus.isCharging ?? activeDevice?.isCharging ?? false;
  const networkType = activeDevice?.networkType || '5G';

  return (
    <div className="min-h-screen bg-[#090D16] text-gray-100 flex flex-col">
      {/* Top Header */}
      <header className="sticky top-0 z-40 border-b border-card-border bg-[#090D16]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link
            href="/"
            className="flex items-center space-x-2 text-sm font-semibold text-gray-400 hover:text-white transition"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Family Radar</span>
          </Link>

          <button
            onClick={() => loadMemberData()}
            className="flex items-center space-x-1.5 rounded-xl border border-card-border bg-card px-3 py-1.5 text-xs font-semibold text-gray-300 hover:text-white"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 space-y-6">
        {/* Profile & Privacy Banner */}
        <div className="rounded-3xl border border-card-border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-slate-800 to-slate-700 text-2xl font-bold font-mono text-emerald-400 border border-slate-700 shadow-md">
                {displayName.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h1 className="text-xl font-bold text-white sm:text-2xl">{displayName}</h1>
                  <span className="rounded bg-indigo-500/20 px-2 py-0.5 text-xs font-semibold text-indigo-300">
                    {role}
                  </span>
                </div>
                <div className="mt-1 flex items-center space-x-2">
                  <span className={`inline-flex items-center rounded-lg px-2.5 py-0.5 text-xs font-bold ${
                    state === 'SOS'
                      ? 'bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse'
                      : state === 'TRAVELLING'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  }`}>
                    {state === 'SOS' ? '🚨 SOS EMERGENCY' : state}
                  </span>
                  <span className="text-xs text-gray-400">
                    {currentStatus.statusMessage || 'All systems safe'}
                  </span>
                </div>
              </div>
            </div>

            {/* Privacy & Pairing Actions */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleToggleLocationSharing}
                disabled={actionLoading}
                className={`flex items-center space-x-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold transition ${
                  locationSharingEnabled
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
                }`}
              >
                {locationSharingEnabled ? (
                  <>
                    <Eye className="h-4 w-4" />
                    <span>Location Sharing ON</span>
                  </>
                ) : (
                  <>
                    <EyeOff className="h-4 w-4" />
                    <span>Sharing Paused</span>
                  </>
                )}
              </button>

              <button
                onClick={() => setIsPairingOpen(true)}
                className="flex items-center space-x-1.5 rounded-xl border border-card-border bg-slate-800 px-3.5 py-2 text-xs font-semibold text-gray-200 hover:text-white hover:bg-slate-700 transition"
              >
                <QrCode className="h-4 w-4 text-amber-400" />
                <span>{activeDevice ? 'Re-Pair Device' : 'Pair Android Phone'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* 2-Column Grid: Device Health & Live Location */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Card 1: Device Diagnostics */}
          <div className="rounded-3xl border border-card-border bg-card p-6 shadow-sm">
            <div className="flex items-center justify-between border-b border-card-border/60 pb-3 mb-4">
              <div className="flex items-center space-x-2">
                <Smartphone className="h-5 w-5 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">Paired Phone Diagnostics</h3>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                activeDevice?.isActive ? 'bg-emerald-500/20 text-emerald-300' : 'bg-gray-800 text-gray-400'
              }`}>
                {activeDevice ? (activeDevice.isActive ? 'ONLINE' : 'OFFLINE') : 'NO DEVICE'}
              </span>
            </div>

            {activeDevice ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-2xl bg-slate-900/80 px-4 py-2.5 border border-card-border/80">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-gray-400">Device Health Score:</span>
                    <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded-full ${
                      (diagnostics?.healthScore ?? 100) >= 80
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : (diagnostics?.healthScore ?? 100) >= 50
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-red-500/20 text-red-300'
                    }`}>
                      {diagnostics?.healthScore ?? 100} / 100
                    </span>
                  </div>
                  <span className="text-[11px] text-gray-400">
                    Status: <span className="text-white font-medium">{diagnostics?.status || (activeDevice.isActive ? 'ONLINE' : 'OFFLINE')}</span>
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-2xl border border-card-border/80 bg-slate-900/60 p-3.5">
                    <div className="text-xs text-gray-400">Device Model</div>
                    <div className="text-sm font-bold text-white mt-1">
                      {activeDevice.deviceModel || activeDevice.deviceName || 'Android Device'}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-card-border/80 bg-slate-900/60 p-3.5">
                    <div className="text-xs text-gray-400">Battery Level</div>
                    <div className="flex items-center space-x-1.5 mt-1">
                      {isCharging ? (
                        <BatteryCharging className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <Battery className={`h-4 w-4 ${batteryLevel <= 20 ? 'text-red-400' : 'text-emerald-400'}`} />
                      )}
                      <span className="text-sm font-bold text-white">
                        {batteryLevel}% {isCharging ? '(Charging)' : ''}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-card-border/80 bg-slate-900/60 p-3.5">
                    <div className="text-xs text-gray-400">Network Type</div>
                    <div className="flex items-center space-x-1.5 mt-1">
                      <Wifi className="h-4 w-4 text-blue-400" />
                      <span className="text-sm font-bold text-white">{networkType}</span>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-card-border/80 bg-slate-900/60 p-3.5">
                    <div className="text-xs text-gray-400">App Version</div>
                    <div className="text-sm font-bold text-white mt-1">
                      v{activeDevice.appVersion || '1.0.0'} (API {activeDevice.androidVersion || activeDevice.osVersion || '34'})
                    </div>
                  </div>
                </div>

                {/* Android OS Protection Audit */}
                {diagnostics?.permissions && (
                  <div className="rounded-2xl border border-card-border/80 bg-slate-900/40 p-3.5 space-y-2">
                    <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                      Android Safety & Background Sync Audit
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex items-center space-x-1.5">
                        <span className={diagnostics.permissions.batteryOptimizationDisabled ? 'text-emerald-400' : 'text-amber-400'}>
                          {diagnostics.permissions.batteryOptimizationDisabled ? '✓' : '⚠'}
                        </span>
                        <span className="text-gray-300">
                          {diagnostics.permissions.batteryOptimizationDisabled ? 'Battery Saver Unrestricted' : 'Battery Saver Active'}
                        </span>
                      </div>

                      <div className="flex items-center space-x-1.5">
                        <span className={diagnostics.permissions.backgroundLocation ? 'text-emerald-400' : 'text-amber-400'}>
                          {diagnostics.permissions.backgroundLocation ? '✓' : '⚠'}
                        </span>
                        <span className="text-gray-300">
                          {diagnostics.permissions.backgroundLocation ? 'Always-On Location' : 'Background Location Missing'}
                        </span>
                      </div>

                      <div className="flex items-center space-x-1.5">
                        <span className={diagnostics.permissions.fineLocation ? 'text-emerald-400' : 'text-red-400'}>
                          {diagnostics.permissions.fineLocation ? '✓' : '✗'}
                        </span>
                        <span className="text-gray-300">
                          {diagnostics.permissions.fineLocation ? 'Fine GPS Precise' : 'Precise GPS Missing'}
                        </span>
                      </div>

                      <div className="flex items-center space-x-1.5">
                        <span className={diagnostics.permissions.notifications ? 'text-emerald-400' : 'text-amber-400'}>
                          {diagnostics.permissions.notifications ? '✓' : '⚠'}
                        </span>
                        <span className="text-gray-300">
                          {diagnostics.permissions.notifications ? 'Notifications Active' : 'Notifications Muted'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Recommendations Banner if issues detected */}
                {diagnostics?.issues && diagnostics.issues.length > 0 && (
                  <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs">
                    <div className="flex items-center space-x-1.5 font-bold text-amber-300 mb-1">
                      <AlertTriangle className="h-4 w-4" />
                      <span>Safety Attention Required</span>
                    </div>
                    <ul className="list-disc list-inside space-y-0.5 text-amber-200/90">
                      {diagnostics.recommendations.map((rec, idx) => (
                        <li key={idx}>{rec}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="rounded-2xl border border-card-border/80 bg-slate-900/60 p-3.5 text-xs text-gray-400 flex items-center justify-between">
                  <span>Last Heartbeat Sync:</span>
                  <span className="font-mono text-gray-200">
                    {diagnostics?.telemetry?.lastSeenAt
                      ? new Date(diagnostics.telemetry.lastSeenAt).toLocaleTimeString()
                      : activeDevice.lastSeenAt
                      ? new Date(activeDevice.lastSeenAt).toLocaleTimeString()
                      : 'Recent'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-card-border p-6 text-center text-xs text-gray-400">
                No Android phone is paired with this profile yet. Click "Pair Android Phone" above to scan QR.
              </div>
            )}
          </div>

          {/* Card 2: Live Location Fix */}
          <div className="rounded-3xl border border-card-border bg-card p-6 shadow-sm">
            <div className="flex items-center justify-between border-b border-card-border/60 pb-3 mb-4">
              <div className="flex items-center space-x-2">
                <Navigation className="h-5 w-5 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">Latest GPS Telemetry</h3>
              </div>
              {lastLocation?.accuracy && (
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  ±{Math.round(lastLocation.accuracy)}m accuracy
                </span>
              )}
            </div>

            {lastLocation?.latitude ? (
              <div className="space-y-4">
                <div className="relative h-44 w-full rounded-2xl border border-card-border/80 bg-[#0B111E] overflow-hidden flex flex-col items-center justify-center p-4">
                  <div className="absolute inset-0 bg-[radial-gradient(#1E293B_1px,transparent_1px)] [background-size:16px_16px] opacity-40 pointer-events-none" />
                  
                  <div className="relative flex flex-col items-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white shadow-xl animate-bounce">
                      <MapPin className="h-6 w-6" />
                    </div>
                    <div className="mt-2 text-xs font-bold text-white bg-slate-900/90 border border-card-border px-3 py-1 rounded-xl shadow-md">
                      {displayName}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-xl border border-card-border/80 bg-slate-900/60 p-3">
                    <span className="text-gray-400">Coordinates:</span>
                    <div className="font-mono text-white mt-1">
                      {lastLocation.latitude.toFixed(5)}, {lastLocation.longitude.toFixed(5)}
                    </div>
                  </div>

                  <div className="rounded-xl border border-card-border/80 bg-slate-900/60 p-3">
                    <span className="text-gray-400">Last Fix Recorded:</span>
                    <div className="font-mono text-white mt-1">
                      {lastLocation.recordedAt ? new Date(lastLocation.recordedAt).toLocaleTimeString() : 'Just now'}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-card-border p-6 text-center text-xs text-gray-400">
                No GPS location fixes recorded yet for this member.
              </div>
            )}
          </div>
        </div>

        {/* Today's Journey & Activity Timeline */}
        <div className="rounded-3xl border border-card-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-card-border/60 pb-3 mb-4">
            <div className="flex items-center space-x-2">
              <Clock className="h-5 w-5 text-emerald-400" />
              <h3 className="text-sm font-bold text-white">Today's Safety & Travel Timeline</h3>
            </div>
            <span className="text-xs text-gray-400">
              {timeline.length} Events Logged Today
            </span>
          </div>

          {timeline.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-card-border p-8 text-center text-xs text-gray-500">
              No journey or safety events recorded today. As the member commutes between geofences, departures and arrivals will be automatically logged here.
            </div>
          ) : (
            <div className="relative border-l border-emerald-500/30 ml-4 space-y-6 py-2">
              {timeline.map((event, idx) => (
                <div key={idx} className="relative pl-6">
                  {/* Timeline Dot */}
                  <div className="absolute -left-1.5 top-1.5 h-3 w-3 rounded-full border-2 border-emerald-500 bg-[#090D16]" />

                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <span className="text-xs font-bold text-white">{event.eventType}</span>
                      <p className="text-xs text-gray-300 mt-0.5">{event.description}</p>
                    </div>
                    <span className="text-[11px] font-mono text-gray-400 mt-1 sm:mt-0">
                      {event.timestamp ? new Date(event.timestamp).toLocaleTimeString() : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Pairing Modal */}
      <PairingModal
        isOpen={isPairingOpen}
        member={member}
        onClose={() => {
          setIsPairingOpen(false);
          loadMemberData();
        }}
      />
    </div>
  );
}
