# System Architecture Overview

## Overview
Family Safety Network connects native Android devices running a foreground location service to a central Vercel-hosted API and Next.js family dashboard.

## Key Subsystems
1. **Foreground Location Service (Android Kotlin):**
   - Implements `FusedLocationProviderClient` with `FOREGROUND_SERVICE_TYPE_LOCATION`.
   - Adapts location frequency between stationary dwell (5–10 min) and travel (30–60 sec).
   - Local offline buffering via Room SQLite database.
2. **Backend Engine (Node.js & MongoDB Atlas):**
   - GeoJSON 2dsphere indexing for high-speed spatial queries.
   - Journey Engine detecting departures, journeys in transit, and arrival events.
   - TTL indexing on raw locations to enforce 30-day retention policies automatically.
3. **Realtime Updates & Notifications:**
   - Pusher Channels fanout for instant dashboard markers.
   - Firebase Cloud Messaging for priority alerts and emergency SOS broadcasting.
