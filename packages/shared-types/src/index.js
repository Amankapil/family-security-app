/**
 * FAMILY SAFETY NETWORK - SHARED DOMAIN CONSTANTS & ENUMS
 * Canonical source of truth across Backend API, Dashboard, and Android mapping.
 */

// User / Membership Roles
const ROLES = Object.freeze({
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  MEMBER: 'MEMBER'
});

// Real-time Family Member Status
const MEMBER_STATUS = Object.freeze({
  AT_HOME: 'AT_HOME',
  AT_WORK: 'AT_WORK',
  AT_COLLEGE: 'AT_COLLEGE',
  AT_DESTINATION: 'AT_DESTINATION',
  TRAVELLING: 'TRAVELLING',
  LAST_KNOWN: 'LAST_KNOWN',
  POSSIBLE_ISSUE: 'POSSIBLE_ISSUE',
  SOS: 'SOS',
  OFFLINE: 'OFFLINE',
  NORMAL: 'NORMAL'
});

// Geofence Types
const GEOFENCE_TYPES = Object.freeze({
  HOME: 'HOME',
  WORK: 'WORK',
  COLLEGE: 'COLLEGE',
  CUSTOM: 'CUSTOM'
});

// Journey Statuses
const JOURNEY_STATUS = Object.freeze({
  STARTING: 'STARTING',
  TRAVELLING: 'TRAVELLING',
  DELAYED: 'DELAYED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  UNKNOWN: 'UNKNOWN',
  SOS: 'SOS'
});

// Alert Severity Levels
const ALERT_LEVELS = Object.freeze({
  INFO: 'INFO',
  WARNING: 'WARNING',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
  SOS: 'SOS'
});

// Alert Categories
const ALERT_CATEGORIES = Object.freeze({
  JOURNEY_DELAYED: 'JOURNEY_DELAYED',
  LOCATION_STALE: 'LOCATION_STALE',
  LOW_BATTERY: 'LOW_BATTERY',
  GEOFENCE_EVENT: 'GEOFENCE_EVENT',
  SOS: 'SOS',
  PERMISSION_REVOKED: 'PERMISSION_REVOKED',
  PROLONGED_STOP: 'PROLONGED_STOP'
});

// Network Connection Types
const NETWORK_TYPES = Object.freeze({
  WIFI: 'WIFI',
  CELLULAR_5G: '5G',
  CELLULAR_4G: '4G',
  CELLULAR_3G: '3G',
  CELLULAR_2G: '2G',
  OFFLINE: 'OFFLINE',
  UNKNOWN: 'UNKNOWN'
});

// System Defaults & Safety Constraints
const SAFETY_CONFIG = Object.freeze({
  MAX_ALLOWED_SPEED_KMH: 160,          // Filter crazy GPS teleportation spikes
  MAX_GPS_ACCURACY_METERS: 65,         // Drop imprecise GPS fixes
  DEFAULT_GEOFENCE_RADIUS_METERS: 150, // Standard geofence bubble
  MIN_GEOFENCE_RADIUS_METERS: 60,
  GEOFENCE_DWELL_SECONDS: 180,         // 3 minutes debounce for enter/exit
  STALE_LOCATION_THRESHOLD_MINUTES: 15,// Triggers warning if travelling and silent
  CRITICAL_BATTERY_PERCENT: 15,        // Threshold for low battery alert
  PAIRING_TOKEN_EXPIRY_MINUTES: 15,
  RAW_LOCATION_RETENTION_DAYS: 30
});

/**
 * Calculates distance between two GPS coordinates using the Haversine formula
 * @param {number} lat1 Latitude of point 1 in degrees
 * @param {number} lon1 Longitude of point 1 in degrees
 * @param {number} lat2 Latitude of point 2 in degrees
 * @param {number} lon2 Longitude of point 2 in degrees
 * @returns {number} Distance in meters
 */
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  if (lat1 === lat2 && lon1 === lon2) return 0;
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Validates a GPS coordinate pair
 * @param {number} lat 
 * @param {number} lng 
 * @returns {boolean}
 */
function isValidCoordinate(lat, lng) {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    !isNaN(lat) &&
    !isNaN(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(lat === 0 && lng === 0) // Null Island check
  );
}

module.exports = {
  ROLES,
  MEMBER_STATUS,
  GEOFENCE_TYPES,
  JOURNEY_STATUS,
  ALERT_LEVELS,
  ALERT_CATEGORIES,
  NETWORK_TYPES,
  SAFETY_CONFIG,
  calculateHaversineDistance,
  isValidCoordinate
};
