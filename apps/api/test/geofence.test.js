const test = require('node:test');
const assert = require('node:assert');
const { connectDB, disconnectDB } = require('../src/config/db');
const { Family, User, FamilyMembership, Device, PairingToken, Geofence, Alert, Location, AuditLog } = require('../src/models');
const { clearGeofenceTrackers } = require('../src/services/geofenceService');
const app = require('../src/app');

const TEST_DB_URI = process.env.MONGODB_URI_GEOFENCE || 'mongodb://127.0.0.1:27017/family_safety_test_geofence';

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
let homeGeofenceId = null;
let officeGeofenceId = null;

// Home coordinates (Connaught Place, New Delhi)
const HOME_LAT = 28.6315;
const HOME_LNG = 77.2167;

// Office coordinates (Cyber City, Gurugram ~25km away)
const OFFICE_LAT = 28.4950;
const OFFICE_LNG = 77.0895;

test('Geofence: Setup family and pair Dad phone', async () => {
  const reg = await makeRequest('/api/v1/auth/register', {
    method: 'POST',
    body: {
      email: 'owner@geotest.local',
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
      deviceName: "Dad's Phone"
    }
  });
  assert.strictEqual(completeRes.status, 200);
  dadDeviceId = completeRes.body.data.deviceId;
  dadDeviceToken = completeRes.body.data.deviceToken;
});

test('Geofence: Admin creates Family Home (shared) and Dad Office (member-specific)', async () => {
  // 1. Create Family Home (membershipId = null -> shared family place)
  const homeRes = await makeRequest('/api/v1/geofences', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ownerToken}` },
    body: {
      name: 'Family Home',
      type: 'HOME',
      latitude: HOME_LAT,
      longitude: HOME_LNG,
      radius: 150,
      dwellTimeSeconds: 30 // Set to 30s for fast testing
    }
  });
  assert.strictEqual(homeRes.status, 201);
  assert.strictEqual(homeRes.body.data.name, 'Family Home');
  assert.strictEqual(homeRes.body.data.isFamilyWide, true);
  homeGeofenceId = homeRes.body.data.id;

  // 2. Create Dad's Office (membershipId = dadMemberId)
  const officeRes = await makeRequest('/api/v1/geofences', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ownerToken}` },
    body: {
      name: "Dad's Office",
      type: 'WORK',
      latitude: OFFICE_LAT,
      longitude: OFFICE_LNG,
      radius: 200,
      dwellTimeSeconds: 30,
      membershipId: dadMemberId
    }
  });
  assert.strictEqual(officeRes.status, 201);
  assert.strictEqual(officeRes.body.data.name, "Dad's Office");
  assert.strictEqual(officeRes.body.data.isFamilyWide, false);
  officeGeofenceId = officeRes.body.data.id;
});

test('Geofence: Query geofences for Dad', async () => {
  const res = await makeRequest(`/api/v1/members/${dadMemberId}/geofences`, {
    headers: { Authorization: `Bearer ${ownerToken}` }
  });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data.length, 2); // Includes Family Home + Dad's Office
  const names = res.body.data.map((g) => g.name);
  assert.ok(names.includes('Family Home'));
  assert.ok(names.includes("Dad's Office"));
});

test('Geofence: Ingest location inside Home and confirm AT_HOME after dwell debounce', async () => {
  const now = Date.now();

  // First fix: Just entered Home (T = 0s)
  const fix1Res = await makeRequest('/api/v1/locations', {
    method: 'POST',
    headers: {
      'x-device-id': dadDeviceId,
      'x-device-token': dadDeviceToken
    },
    body: {
      latitude: HOME_LAT,
      longitude: HOME_LNG,
      accuracy: 10.0,
      timestamp: new Date(now).toISOString()
    }
  });
  assert.strictEqual(fix1Res.status, 200);

  // Second fix: Still inside Home after 35 seconds (dwell window was 30s)
  const fix2Res = await makeRequest('/api/v1/locations', {
    method: 'POST',
    headers: {
      'x-device-id': dadDeviceId,
      'x-device-token': dadDeviceToken
    },
    body: {
      latitude: HOME_LAT + 0.0001, // ~11 meters away, comfortably inside 150m radius
      longitude: HOME_LNG,
      accuracy: 10.0,
      timestamp: new Date(now + 35000).toISOString()
    }
  });
  assert.strictEqual(fix2Res.status, 200);

  // Verify Dad's status transitioned to AT_HOME
  const dad = await FamilyMembership.findById(dadMemberId);
  assert.strictEqual(dad.currentStatus.state, 'AT_HOME');
  assert.strictEqual(dad.currentStatus.geofenceId.toString(), homeGeofenceId);

  // Verify Alert was created
  const alert = await Alert.findOne({ membershipId: dadMemberId, type: 'INFO' });
  assert.ok(alert);
  assert.ok(alert.title.includes('reached Family Home'));
});

test('Geofence: Ingest location definitely outside Home and confirm EXIT transition', async () => {
  const now = Date.now() + 100000;

  // First fix outside Home (500m away, T = 0)
  await makeRequest('/api/v1/locations', {
    method: 'POST',
    headers: {
      'x-device-id': dadDeviceId,
      'x-device-token': dadDeviceToken
    },
    body: {
      latitude: HOME_LAT + 0.005, // ~550m away
      longitude: HOME_LNG,
      accuracy: 10.0,
      timestamp: new Date(now).toISOString()
    }
  });

  // Second fix outside Home after 35 seconds
  await makeRequest('/api/v1/locations', {
    method: 'POST',
    headers: {
      'x-device-id': dadDeviceId,
      'x-device-token': dadDeviceToken
    },
    body: {
      latitude: HOME_LAT + 0.008, // ~900m away
      longitude: HOME_LNG,
      accuracy: 10.0,
      timestamp: new Date(now + 35000).toISOString()
    }
  });

  // Verify Dad's status transitioned to NORMAL and cleared geofenceId
  const dad = await FamilyMembership.findById(dadMemberId);
  assert.strictEqual(dad.currentStatus.state, 'NORMAL');
  assert.strictEqual(dad.currentStatus.geofenceId, null);

  // Verify Exit Alert was created
  const exitAlert = await Alert.findOne({
    membershipId: dadMemberId,
    title: { $regex: /left Family Home/ }
  });
  assert.ok(exitAlert);
});

test('Geofence: Dad arrives at Office and transitions to AT_WORK', async () => {
  // 30 minutes later (realistic travel time for 25km from Home to Cyber City)
  const now = Date.now() + 1800000;

  // Arrival at Office
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
      timestamp: new Date(now).toISOString()
    }
  });

  // Confirmed dwell inside Office after 35s
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
      timestamp: new Date(now + 35000).toISOString()
    }
  });

  const dad = await FamilyMembership.findById(dadMemberId);
  assert.strictEqual(dad.currentStatus.state, 'AT_WORK');
  assert.strictEqual(dad.currentStatus.geofenceId.toString(), officeGeofenceId);
});
