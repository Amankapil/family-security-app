'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, RefreshCw, AlertCircle, Plus } from 'lucide-react';
import { api, clearToken } from '../lib/api';
import Navbar from '../components/Navbar';
import StatsBar from '../components/StatsBar';
import FilterBar from '../components/FilterBar';
import MemberCard from '../components/MemberCard';
import FamilyMap from '../components/FamilyMap';
import SosBanner from '../components/SosBanner';
import AddMemberModal from '../components/AddMemberModal';
import PairingModal from '../components/PairingModal';
import { useRealtime } from '../hooks/useRealtime';

export default function DashboardPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const [family, setFamily] = useState(null);
  const [members, setMembers] = useState([]);
  const [alerts, setAlerts] = useState([]);

  // UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [pairingMember, setPairingMember] = useState(null);

  // Fetch all dashboard data
  const loadDashboardData = useCallback(async (isBackground = false) => {
    try {
      if (!isBackground) setRefreshing(true);

      const [familyData, membersData, alertsData] = await Promise.all([
        api.getFamily().catch((err) => {
          if (err.message?.includes('token') || err.message?.includes('Unauthorized')) {
            clearToken();
            router.push('/login');
          }
          throw err;
        }),
        api.getMembers().catch(() => []),
        api.getAlerts().catch(() => [])
      ]);

      if (familyData) setFamily(familyData);
      if (Array.isArray(membersData)) setMembers(membersData);
      if (Array.isArray(alertsData)) setAlerts(alertsData);
      setError('');
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
      if (!isBackground) {
        setError(err.message || 'Unable to connect to Family Safety network.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  // Initial mount & periodic polling
  useEffect(() => {
    // Check if token exists
    const token = typeof window !== 'undefined' ? localStorage.getItem('family_access_token') : null;
    if (!token) {
      router.push('/login');
      return;
    }

    loadDashboardData();

    // 25-second live refresh polling
    const interval = setInterval(() => {
      loadDashboardData(true);
    }, 25000);

    return () => clearInterval(interval);
  }, [loadDashboardData, router]);

  function handleLogout() {
    clearToken();
    router.push('/login');
  }

  async function handleResolveSos(alertId) {
    try {
      await api.resolveSos(alertId);
      await loadDashboardData(true);
    } catch (err) {
      alert(`Could not resolve alert: ${err.message}`);
    }
  }

  // Realtime Live Event Callbacks
  const handleLocationUpdate = useCallback((data) => {
    setMembers((prev) =>
      prev.map((m) => {
        if (m._id === data.memberId) {
          return {
            ...m,
            currentStatus: {
              ...m.currentStatus,
              lastLocation: {
                latitude: data.latitude,
                longitude: data.longitude,
                accuracy: data.accuracy,
                updatedAt: data.recordedAt || new Date().toISOString()
              },
              batteryLevel: data.batteryLevel !== undefined ? data.batteryLevel : m.currentStatus.batteryLevel,
              state: data.state || m.currentStatus.state
            }
          };
        }
        return m;
      })
    );
  }, []);

  const handleStatusChange = useCallback((data) => {
    setMembers((prev) =>
      prev.map((m) => {
        if (m._id === data.memberId) {
          return {
            ...m,
            currentStatus: {
              ...m.currentStatus,
              state: data.state || m.currentStatus.state,
              statusMessage: data.statusMessage || m.currentStatus.statusMessage
            }
          };
        }
        return m;
      })
    );
  }, []);

  const handleSosTriggered = useCallback((alertData) => {
    setAlerts((prev) => {
      const exists = prev.some((a) => a._id === alertData.alertId);
      if (exists) return prev;
      return [
        {
          _id: alertData.alertId,
          alertType: 'SOS',
          severity: 'CRITICAL',
          status: 'ACTIVE',
          message: alertData.message,
          createdAt: alertData.timestamp,
          membershipId: { displayName: alertData.displayName }
        },
        ...prev
      ];
    });

    if (alertData.memberId) {
      setMembers((prev) =>
        prev.map((m) =>
          m._id === alertData.memberId
            ? { ...m, currentStatus: { ...m.currentStatus, state: 'SOS' } }
            : m
        )
      );
    }
  }, []);

  const handleSosResolved = useCallback((data) => {
    setAlerts((prev) => prev.filter((a) => a._id !== data.alertId));
    if (data.memberId) {
      setMembers((prev) =>
        prev.map((m) =>
          m._id === data.memberId
            ? { ...m, currentStatus: { ...m.currentStatus, state: 'NORMAL', statusMessage: 'Safe' } }
            : m
        )
      );
    }
  }, []);

  const handleJourneyEvent = useCallback(() => {
    loadDashboardData(true);
  }, [loadDashboardData]);

  // Connect live updates
  useRealtime({
    familyId: family?._id,
    onLocationUpdate: handleLocationUpdate,
    onStatusChange: handleStatusChange,
    onSosTriggered: handleSosTriggered,
    onSosResolved: handleSosResolved,
    onJourneyEvent: handleJourneyEvent
  });

  // Filter members
  const filteredMembers = members.filter((member) => {
    const matchesSearch =
      !searchQuery.trim() ||
      member.displayName.toLowerCase().includes(searchQuery.toLowerCase().trim());

    if (!matchesSearch) return false;

    if (activeFilter === 'ALL') return true;
    const state = member.currentStatus?.state || 'NORMAL';
    if (activeFilter === 'SOS') return state === 'SOS';
    if (activeFilter === 'TRAVELLING') return state === 'TRAVELLING';
    if (activeFilter === 'AT_HOME') return state === 'AT_HOME';
    if (activeFilter === 'AT_WORK') return state === 'AT_WORK';

    return true;
  });

  // Calculate statistics
  const stats = {
    total: members.length,
    normal: members.filter((m) =>
      ['NORMAL', 'AT_HOME', 'AT_WORK', 'AT_COLLEGE'].includes(m.currentStatus?.state || 'NORMAL')
    ).length,
    travelling: members.filter((m) => m.currentStatus?.state === 'TRAVELLING').length,
    critical: members.filter((m) =>
      ['SOS', 'POSSIBLE_ISSUE'].includes(m.currentStatus?.state)
    ).length + alerts.filter((a) => a.alertType === 'SOS' && a.status === 'ACTIVE').length
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#090D16] text-gray-300">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-600/10 border border-emerald-500/20 shadow-2xl mb-4">
          <Shield className="h-8 w-8 text-emerald-400 animate-pulse" />
        </div>
        <p className="text-sm font-semibold tracking-wide text-gray-400">Loading Family Safety Hub...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#090D16] text-gray-100 flex flex-col">
      {/* Top Navigation */}
      <Navbar
        familyName={family?.name}
        onAddMember={() => setIsAddModalOpen(true)}
        onLogout={handleLogout}
      />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 space-y-6">
        {/* Error Alert Bar */}
        {error && (
          <div className="flex items-center justify-between rounded-2xl border border-red-500/30 bg-red-950/40 p-4 text-xs font-medium text-red-300">
            <div className="flex items-center space-x-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
            <button
              onClick={() => loadDashboardData()}
              className="rounded-lg bg-red-900/60 px-3 py-1 font-semibold text-white hover:bg-red-800 transition"
            >
              Retry
            </button>
          </div>
        )}

        {/* SOS Emergency Banner (if any) */}
        <SosBanner alerts={alerts} onResolve={handleResolveSos} />

        {/* Top Summary Stats */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
              Family Radar & Safety Overview
            </h1>
            <button
              onClick={() => loadDashboardData()}
              disabled={refreshing}
              className="flex items-center space-x-1.5 rounded-xl border border-card-border bg-card px-3 py-1.5 text-xs font-semibold text-gray-300 hover:text-white hover:bg-gray-800 transition disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-emerald-400' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>

          <StatsBar stats={stats} />
        </div>

        {/* Live Family Map Radar */}
        <FamilyMap members={members} />

        {/* Filter & Search Bar */}
        <div className="pt-2">
          <FilterBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
          />
        </div>

        {/* Family Member Cards Grid */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-200">
              Family Members ({filteredMembers.length})
            </h2>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition flex items-center space-x-1"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Member</span>
            </button>
          </div>

          {filteredMembers.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-card-border bg-card/40 p-12 text-center">
              <p className="text-sm font-semibold text-gray-300">No family members found</p>
              <p className="mt-1 text-xs text-gray-500">
                {searchQuery || activeFilter !== 'ALL'
                  ? 'Try clearing the search or filter to see all members.'
                  : 'Get started by adding your first family member.'}
              </p>
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-emerald-500 transition"
              >
                Add Member
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredMembers.map((member) => (
                <MemberCard
                  key={member._id}
                  member={member}
                  onPairDevice={(m) => setPairingMember(m)}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Add Member Modal */}
      <AddMemberModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onMemberAdded={() => loadDashboardData(true)}
      />

      {/* Device Pairing QR Modal */}
      <PairingModal
        isOpen={!!pairingMember}
        member={pairingMember}
        onClose={() => setPairingMember(null)}
      />
    </div>
  );
}
