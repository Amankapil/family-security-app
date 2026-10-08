# Family Safety Network

A private, consent-driven family safety application designed to help family members stay informed about each other's safety during daily journeys.

## Principles

1. **Family-Centric, Not Surveillance:** Built for mutual care between trusted family members (Dad, Mom, Brother, Sister, You, etc.). Explicit consent required.
2. **Reliability > Features:** Resilient offline queue, foreground GPS service, network transition handling.
3. **Battery Efficiency:** Adaptive sampling rates (low frequency inside known geofences, 30–60s in transit).
4. **False Positive Reduction:** Debounced geofence transitions and multi-factor safety evaluations.

## Project Structure

```
family-safety/
├── apps/
│   ├── api/             # Backend API (Express / Serverless on Vercel)
│   ├── dashboard/       # Web Dashboard (Next.js 14/15 + Tailwind CSS + Google Maps)
│   └── family-android/  # Native Android App (Kotlin, Foreground Service, Room)
├── packages/
│   └── shared-types/    # Domain models, enums, geocoding math, validation rules
└── docs/                # Architecture, API specifications, and deployment guides
```

## Quick Start

### 1. Prerequisites
- Node.js 20+
- MongoDB Atlas cluster (or local MongoDB for development)
- Java 17 & Android Studio (for native Android builds)

### 2. Install Dependencies
```bash
npm install
```

### 3. Run All Integration Tests (100% Pass Rate)
```bash
npm test
```
*Runs all 67 integration tests across domain math (`shared-types`), express server (`api`), geofencing, journeys, SSE realtime, FCM notifications, offline SQLite sync, telemetry diagnostics, and security hardening.*

### 4. Run Development Servers
```bash
# Start backend API (http://localhost:5000)
npm run dev:api

# Start Next.js dashboard (http://localhost:3000)
npm run dev:dashboard
```

---

## Architecture & Completed Engines

| Engine | Technology | Key Capabilities |
| :--- | :--- | :--- |
| **Monorepo & Domain Core** | Node.js, Mongoose, Shared Types | Multi-tenant isolation, GeoJSON spatial indexes, 11 schemas, Haversine math. |
| **Dynamic Membership** | JWT Auth + Role-Based Access | Zero hardcoded names (Dad, Mom, Brother, Sister, etc.), single-use QR pairing. |
| **Foreground Location Service** | Android Kotlin, FusedLocationClient | Adaptive GPS (35s transit, 5m stationary, 10s SOS), >65m anomaly drop, >160km/h reject. |
| **Geofencing & Debouncing** | MongoDB Spatial `$nearSphere` | 180s dwell debounce, 40m hysteresis buffer, automatic transition state mapping. |
| **Journey Detection & Timeline** | Heuristic State Machine | Auto-departure detection, ETA calculation, arrival detection, unexpected stop alerts. |
| **Offline Resilience** | Android SQLite FIFO + WorkManager | 5,000 fix offline buffer, automatic flush on reconnect, out-of-order timestamp protection. |
| **Device Health Diagnostics** | Telemetry Classifier | Battery health (<15% alert), Android battery saver optimization audit, permission health score. |
| **Realtime Web Dashboard** | Next.js 14, Tailwind, Pusher & SSE | Live radar map, emergency banner, member detail profile, instant status sync. |
| **Push Notifications** | Firebase Cloud Messaging (FCM) | High-priority SOS distress alerts, geofence arrivals/departures, low battery push. |
| **Security & Hardening** | Helmet, Rate Limiter, Sanitizer | Brute-force rate limits, NoSQL operator sanitizer, immutable audit logs. |

---

## Deployment Guide

### Vercel Deployment (API & Dashboard)
1. **API (`apps/api`)**:
   - Set Root Directory to `apps/api`.
   - Environment variables: `MONGODB_URI`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CORS_ORIGINS`.
   - Vercel automatically deploys the serverless handler via `apps/api/vercel.json`.
2. **Dashboard (`apps/dashboard`)**:
   - Set Root Directory to `apps/dashboard`.
   - Environment variables: `NEXT_PUBLIC_API_URL` (points to your deployed API URL).
   - Vercel automatically deploys via Next.js framework preset.

### Android Application (`apps/family-android`)
1. Open `apps/family-android` in **Android Studio Hedgehog / Iguana / Jellyfish**.
2. Sync Gradle with project files.
3. Configure API base URL in `ApiClient.kt` (e.g. `https://your-api.vercel.app/api/v1/` or `http://10.0.2.2:5000/api/v1/` for local emulator).
4. Run on physical device or emulator via `Run 'app'`.
