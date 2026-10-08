const test = require('node:test');
const assert = require('node:assert');
const { connectDB, disconnectDB } = require('../src/config/db');
const { Family, User, FamilyMembership, Device, PairingToken, Geofence, Journey, DailySummary, Alert, Location, AuditLog } = require('../src/models');
const { clearGeofenceTrackers } = require('../src/services/geofenceService');
const app = require('../src/app');

const TEST_DB_URI = process.env.MONGODB_URI_JOURNEY || 'mongodb://127.0.0.1:27017/family_safety_test_journey';

function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const http = require('http');
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const url = `http://127.0.0.1:${port}${path}`;
      const fetchOpts = {
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {})
        }
      };
      if (options.body) {
        fetchOpts.body = JSON.stringify(options.body);
      }

      fetch(url, fetchOpts)
        .then(async (res) => {
          const body = await res.json();
          server.close();
          resolve({ status: res.status, body });
        })
        .catch((err) => {
          server.close();
          reject(err);
        });
    });
  });
}

test.before(async () => {
  await connectDB(TEST_DB_URI);
  clearGeofenceTrackers();
  await Promise.all([
    Family.deleteMany({}),
    User.deleteMany({}),
    FamilyMembership.deleteMany({}),
    Device.deleteMany({}),
    PairingToken.deleteMany({}),
    Geofence.deleteMany({}),
    Journey.deleteMany({}),
    DailySummary.deleteMany({}),
    Alert.deleteMany({}),
    Location.deleteMany({}),
    AuditLog.deleteMany({})
  ]);
  await Geofence.syncIndexes();
});

test.after(async () => {
  await Promise.all([
    Family.deleteMany({}),
    User.deleteMany({}),
    FamilyMembership.deleteMany({}),
    Device.deleteMany({}),
    PairingToken.deleteMany({}),
    Geofence.deleteMany({}),
    Journey.deleteMany({}),
    DailySummary.deleteMany({}),
    Alert.deleteMany({}),
    Location.deleteMany({}),
    AuditLog.deleteMany({})
  ]);
  await disconnectDB();
});

let ownerToken = null;
let dadMemberId = null;
let dadDeviceId = null;
let dadDeviceToken = null;

const HOME_LAT = 28.6315;
const HOME_LNG = 77.2167;

const OFFICE_LAT = 28.5355;
const OFFICE_LNG = 77.1500; // ~12 km away

test('Journey: Setup Family, Dad, and Geofences', async () => {
  const reg = await makeRequest('/api/v1/auth/register', {
    method: 'POST',
    body: {
      email: 'owner@journeytest.local',
      password: 'SecurePassword123!',
      fullName: 'Aman Kapil',
      familyName: 'Kapil Family'
    }
  });
  assert.strictEqual(reg.status, 201);
  ownerToken = reg.body.data.tokens.accessToken;

  const dadRes = await makeRequest('/api/v1/family/members', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ownerToken}` },
    body: { displayName: 'Dad', role: 'MEMBER' }
  });
  assert.strictEqual(dadRes.status, 201);
  dadMemberId = dadRes.body.data._id;

  const pairRes = await makeRequest('/api/v1/pairing/create', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ownerToken}` },
    body: { membershipId: dadMemberId }
  });
  assert.strictEqual(pairRes.status, 201);

  const completeRes = await makeRequest('/api/v1/pairing/complete', {
    method: 'POST',
    body: {
      pairingToken: pairRes.body.data.token,
      deviceName: "Dad's Galaxy Phone"
    }
  });
  assert.strictEqual(completeRes.status, 200);
  dadDeviceId = completeRes.body.data.deviceId;
  dadDeviceToken = completeRes.body.data.deviceToken;

  // Create Home geofence
  const homeRes = await makeRequest('/api/v1/geofences', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ownerToken}` },
    body: {
      name: 'Family Home',
      type: 'HOME',
      latitude: HOME_LAT,
      longitude: HOME_LNG,
      radius: 150,
      dwellTimeSeconds: 20
    }
  });
  assert.strictEqual(homeRes.status, 201);

  // Create Work geofence
  const officeRes = await makeRequest('/api/v1/geofences', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ownerToken}` },
    body: {
      name: "Dad's Office",
      type: 'WORK',
      latitude: OFFICE_LAT,
      longitude: OFFICE_LNG,
      radius: 150,
      dwellTimeSeconds: 20,
      membershipId: dadMemberId
    }
  });
  assert.strictEqual(officeRes.status, 201);
});

test('Journey: Auto-detect departure and start journey (Home → Dad\'s Office)', async () => {
  const t0 = Date.now();

  // Ingest moving fix departing Home (speed = 8.3 m/s = 30 km/h, distance = 400m from Home)
  const res = await makeRequest('/api/v1/locations', {
    method: 'POST',
    headers: {
      'x-device-id': dadDeviceId,
      'x-device-token': dadDeviceToken
    },
    body: {
      latitude: HOME_LAT + 0.003, // ~330m from Home
      longitude: HOME_LNG,
      accuracy: 10.0,
      speed: 8.3,
      timestamp: new Date(t0).toISOString()
    }
  });

  assert.strictEqual(res.status, 200);

  // Verify journey was automatically initialized
  const activeJourney = await Journey.findOne({
    membershipId: dadMemberId,
    status: 'TRAVELLING'
  });
  assert.ok(activeJourney, 'Journey must be active');
  assert.strictEqual(activeJourney.originName, 'Family Home');
  assert.strictEqual(activeJourney.destinationName, "Dad's Office");

  // Verify Member state
  const dad = await FamilyMembership.findById(dadMemberId);
  assert.strictEqual(dad.currentStatus.state, 'TRAVELLING');
  assert.strictEqual(dad.currentStatus.journeyId.toString(), activeJourney._id.toString());

  // Verify Departure Alert
  const alert = await Alert.findOne({
    membershipId: dadMemberId,
    title: { $regex: /started travelling to Dad's Office/ }
  });
  assert.ok(alert);
});

test('Journey: Auto-detect arrival at Office and complete journey', async () => {
  // Travel duration = 25 minutes later
  const tArrival = Date.now() + 1500000;

  // 1. Arrives at Office (first fix within Office geofence)
  await makeRequest('/api/v1/locations', {
    method: 'POST',
    headers: {
      'x-device-id': dadDeviceId,
      'x-device-token': dadDeviceToken
    },
    body: {
      latitude: OFFICE_LAT,
      longitude: OFFICE_LNG,
      accuracy: 12.0,
      speed: 3.0,
      timestamp: new Date(tArrival).toISOString()
    }
  });

  // 2. Dwells in Office (second fix after 25 seconds, dwell window was 20s)
  await makeRequest('/api/v1/locations', {
    method: 'POST',
    headers: {
      'x-device-id': dadDeviceId,
      'x-device-token': dadDeviceToken
    },
    body: {
      latitude: OFFICE_LAT,
      longitude: OFFICE_LNG,
      accuracy: 10.0,
      speed: 0.2,
      timestamp: new Date(tArrival + 25000).toISOString()
    }
  });

  // Verify Journey is now COMPLETED
  const completedJourney = await Journey.findOne({
    membershipId: dadMemberId,
    status: 'COMPLETED'
  });
  assert.ok(completedJourney, 'Journey must be completed');
  assert.strictEqual(completedJourney.destinationName, "Dad's Office");
  assert.ok(completedJourney.actualDurationMinutes >= 20);

  // Verify Member status
  const dad = await FamilyMembership.findById(dadMemberId);
  assert.strictEqual(dad.currentStatus.state, 'AT_WORK');
  assert.strictEqual(dad.currentStatus.journeyId, null);

  // Verify Safe Arrival Alert
  const arrivalAlert = await Alert.findOne({
    membershipId: dadMemberId,
    title: { $regex: /reached Dad's Office safely/ }
  });
  assert.ok(arrivalAlert);
});

test('Journey: Fetch member journeys and today timeline', async () => {
  // Query journeys list
  const journeysRes = await makeRequest(`/api/v1/members/${dadMemberId}/journeys`, {
    headers: { Authorization: `Bearer ${ownerToken}` }
  });
  assert.strictEqual(journeysRes.status, 200);
  assert.strictEqual(journeysRes.body.data.length, 1);
  assert.strictEqual(journeysRes.body.data[0].status, 'COMPLETED');

  // Query timeline
  const timelineRes = await makeRequest(`/api/v1/members/${dadMemberId}/timeline`, {
    headers: { Authorization: `Bearer ${ownerToken}` }
  });
  assert.strictEqual(timelineRes.status, 200);
  assert.strictEqual(timelineRes.body.data.displayName, 'Dad');
  assert.ok(timelineRes.body.data.timelineEvents.length >= 2);

  const eventTypes = timelineRes.body.data.timelineEvents.map((e) => e.eventType);
  assert.ok(eventTypes.includes('JOURNEY_STARTED'));
  assert.ok(eventTypes.includes('JOURNEY_COMPLETED'));
});
