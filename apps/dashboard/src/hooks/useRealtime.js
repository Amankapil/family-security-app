'use client';

import { useEffect, useRef } from 'react';
import Pusher from 'pusher-js';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api/v1';
const PUSHER_KEY = process.env.NEXT_PUBLIC_PUSHER_KEY;
const PUSHER_CLUSTER = process.env.NEXT_PUBLIC_PUSHER_CLUSTER || 'mt1';

/**
 * useRealtime hook
 * Provides instant live updates to the web dashboard.
 * Supports Pusher Channels (Vercel serverless) and built-in SSE stream fallback.
 */
export function useRealtime({
  familyId,
  onLocationUpdate,
  onStatusChange,
  onSosTriggered,
  onSosResolved,
  onJourneyEvent,
  onDeviceHeartbeat,
  onDeviceHealthAlert
}) {
  const pusherRef = useRef(null);
  const sseRef = useRef(null);

  useEffect(() => {
    if (!familyId) return;

    // Strategy 1: Pusher Channels (if env key configured)
    if (PUSHER_KEY) {
      try {
        const pusher = new Pusher(PUSHER_KEY, {
          cluster: PUSHER_CLUSTER,
          forceTLS: true
        });
        pusherRef.current = pusher;

        const channel = pusher.subscribe(`family-${familyId}`);

        if (onLocationUpdate) channel.bind('location-updated', onLocationUpdate);
        if (onStatusChange) channel.bind('status-changed', onStatusChange);
        if (onSosTriggered) channel.bind('sos-triggered', onSosTriggered);
        if (onSosResolved) channel.bind('sos-resolved', onSosResolved);
        if (onJourneyEvent) channel.bind('journey-event', onJourneyEvent);
        if (onDeviceHeartbeat) channel.bind('device-heartbeat', onDeviceHeartbeat);
        if (onDeviceHealthAlert) channel.bind('device-health-alert', onDeviceHealthAlert);

        return () => {
          channel.unbind_all();
          pusher.unsubscribe(`family-${familyId}`);
          pusher.disconnect();
        };
      } catch (err) {
        console.warn('[useRealtime] Pusher init failed, falling back to SSE:', err);
      }
    }

    // Strategy 2: Built-in Server-Sent Events (SSE) Fallback
    const token = typeof window !== 'undefined' ? localStorage.getItem('family_access_token') : null;
    if (!token) return;

    try {
      const streamUrl = `${API_BASE}/realtime/stream?token=${encodeURIComponent(token)}`;
      const es = new EventSource(streamUrl);
      sseRef.current = es;

      if (onLocationUpdate) {
        es.addEventListener('location-updated', (e) => {
          try {
            onLocationUpdate(JSON.parse(e.data));
          } catch (err) {
            console.error('Failed to parse location-updated data:', err);
          }
        });
      }

      if (onStatusChange) {
        es.addEventListener('status-changed', (e) => {
          try {
            onStatusChange(JSON.parse(e.data));
          } catch (err) {
            console.error('Failed to parse status-changed data:', err);
          }
        });
      }

      if (onSosTriggered) {
        es.addEventListener('sos-triggered', (e) => {
          try {
            onSosTriggered(JSON.parse(e.data));
          } catch (err) {
            console.error('Failed to parse sos-triggered data:', err);
          }
        });
      }

      if (onSosResolved) {
        es.addEventListener('sos-resolved', (e) => {
          try {
            onSosResolved(JSON.parse(e.data));
          } catch (err) {
            console.error('Failed to parse sos-resolved data:', err);
          }
        });
      }

      if (onJourneyEvent) {
        es.addEventListener('journey-event', (e) => {
          try {
            onJourneyEvent(JSON.parse(e.data));
          } catch (err) {
            console.error('Failed to parse journey-event data:', err);
          }
        });
      }

      if (onDeviceHeartbeat) {
        es.addEventListener('device-heartbeat', (e) => {
          try {
            onDeviceHeartbeat(JSON.parse(e.data));
          } catch (err) {
            console.error('Failed to parse device-heartbeat data:', err);
          }
        });
      }

      if (onDeviceHealthAlert) {
        es.addEventListener('device-health-alert', (e) => {
          try {
            onDeviceHealthAlert(JSON.parse(e.data));
          } catch (err) {
            console.error('Failed to parse device-health-alert data:', err);
          }
        });
      }

      es.onerror = (err) => {
        // SSE auto-reconnects natively; log debug info
        console.debug('[useRealtime] SSE stream reconnecting...');
      };

      return () => {
        es.close();
      };
    } catch (err) {
      console.warn('[useRealtime] SSE stream connection failed:', err);
    }
  }, [
    familyId,
    onLocationUpdate,
    onStatusChange,
    onSosTriggered,
    onSosResolved,
    onJourneyEvent,
    onDeviceHeartbeat,
    onDeviceHealthAlert
  ]);
}
