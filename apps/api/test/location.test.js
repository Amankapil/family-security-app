const test = require('node:test');
const assert = require('node:assert');
const { connectDB, disconnectDB } = require('../src/config/db');
const { Family, User, FamilyMembership, Device, PairingToken, Location, AuditLog } = require('../src/models');
const app = require('../src/app');

const TEST_DB_URI = process.env.MONGODB_URI_LOCATION || 'mongodb://127.0.0.1:27017/family_safety_test_location';

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
  await Promise.all([
    Family.deleteMany({}),
    User.deleteMany({}),
    FamilyMembership.deleteMany({}),
    Device.deleteMany({}),
    PairingToken.deleteMany({}),
    Location.deleteMany({}),
    AuditLog.deleteMany({})
  ]);
  await Location.syncIndexes();
});

test.after(async () => {
  await Promise.all([
    Family.deleteMany({}),
    User.deleteMany({}),
    FamilyMembership.deleteMany({}),
    Device.deleteMany({}),
    PairingToken.deleteMany({}),
    Location.deleteMany({}),
    AuditLog.deleteMany({})
  ]);
  await disconnectDB();
});

let ownerToken = null;
let dadMemberId = null;
let dadDeviceId = null;
let dadDeviceToken = null;

test('Location: Setup family and pair Dad phone', async () => {
  // 1. Register Owner
  const reg = await makeRequest('/api/v1/auth/register', {
    method: 'POST',
    body: {
      email: 'owner@loctest.local',
      password: 'SecurePassword123!',
      fullName: 'Aman Kapil',
      familyName: 'Kapil Family'
    }
  });
  assert.strictEqual(reg.status, 201);
  ownerToken = reg.body.data.tokens.accessToken;

  // 2. Add Dad
  const dadRes = await makeRequest('/api/v1/family/members', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ownerToken}` },
    body: {
      displayName: 'Dad',
      role: 'MEMBER'
    }
  });
  assert.strictEqual(dadRes.status, 201);
  dadMemberId = dadRes.body.data._id;

  // 3. Generate Pairing Token
  const pairRes = await makeRequest('/api/v1/pairing/create', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ownerToken}` },
    body: { membershipId: dadMemberId }
  });
  assert.strictEqual(pairRes.status, 201);
  const token = pairRes.body.data.token;

  // 4. Complete Pairing
  const completeRes = await makeRequest('/api/v1/pairing/complete', {
    method: 'POST',
    body: {
      pairingToken: token,
      deviceName: "Dad's Phone"
    }
  });
  assert.strictEqual(completeRes.status, 200);
  dadDeviceId = completeRes.body.data.deviceId;
  dadDeviceToken = completeRes.body.data.deviceToken;
});

test('Location: Upload valid GPS fixes and update live member state', async () => {
  const res = await makeRequest('/api/v1/locations', {
    method: 'POST',
    headers: {
      'x-device-id': dadDeviceId,
      'x-device-token': dadDeviceToken
    },
    body: {
      latitude: 28.6139,
      longitude: 77.2090,
      accuracy: 12.0,
      speed: 8.5, // ~30 km/h
      heading: 90.0,
      batteryLevel: 88,
      networkType: '5G'
    }
  });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data.ingestedCount, 1);
  assert.strictEqual(res.body.data.droppedCount, 0);

  // Verify member live state in database
  const dad = await FamilyMembership.findById(dadMemberId);
  assert.strictEqual(dad.currentStatus.lastLocation.latitude, 28.6139);
  assert.strictEqual(dad.currentStatus.lastLocation.longitude, 77.2090);
  assert.strictEqual(dad.currentStatus.batteryLevel, 88);
});

test('Location: Drop GPS fixes with unacceptable accuracy (> 65m)', async () => {
  const res = await makeRequest('/api/v1/locations', {
    method: 'POST',
    headers: {
      'x-device-id': dadDeviceId,
      'x-device-token': dadDeviceToken
    },
    body: {
      latitude: 28.6145,
      longitude: 77.2095,
      accuracy: 150.0 // Terribly inaccurate GPS fix
    }
  });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.ingestedCount, 0);
  assert.strictEqual(res.body.data.droppedCount, 1);
});

test('Location: Drop invalid coordinates (Null Island and out-of-range)', async () => {
  const res = await makeRequest('/api/v1/locations', {
    method: 'POST',
    headers: {
      'x-device-id': dadDeviceId,
      'x-device-token': dadDeviceToken
    },
    body: {
      latitude: 0,
      longitude: 0,
      accuracy: 10.0
    }
  });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.ingestedCount, 0);
  assert.strictEqual(res.body.data.droppedCount, 1);
});

test('Location: Drop impossible speed anomalies (> 160 km/h)', async () => {
  const res = await makeRequest('/api/v1/locations', {
    method: 'POST',
    headers: {
      'x-device-id': dadDeviceId,
      'x-device-token': dadDeviceToken
    },
    body: {
      latitude: 28.7000,
      longitude: 77.3000,
      accuracy: 10.0,
      speed: 60.0 // 60 m/s = 216 km/h!
    }
  });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.ingestedCount, 0);
  assert.strictEqual(res.body.data.droppedCount, 1);
});

test('Location: Fetch latest location for member via Dashboard API', async () => {
  const res = await makeRequest(`/api/v1/members/${dadMemberId}/location`, {
    headers: { Authorization: `Bearer ${ownerToken}` }
  });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data.displayName, 'Dad');
  assert.strictEqual(res.body.data.sharingStatus, 'ACTIVE');
  assert.strictEqual(res.body.data.lastLocation.latitude, 28.6139);
});

test('Location: Fetch breadcrumb history', async () => {
  const res = await makeRequest(`/api/v1/members/${dadMemberId}/locations`, {
    headers: { Authorization: `Bearer ${ownerToken}` }
  });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  assert.ok(Array.isArray(res.body.data));
  assert.strictEqual(res.body.data.length, 1); // Only the valid fix was recorded
  assert.strictEqual(res.body.data[0].latitude, 28.6139);
});

test('Location Privacy: Member pauses location sharing', async () => {
  // Dad updates privacy setting: locationSharingEnabled = false
  await FamilyMembership.findByIdAndUpdate(dadMemberId, {
    locationSharingEnabled: false,
    allowAdminsToView: false
  });

  const res = await makeRequest(`/api/v1/members/${dadMemberId}/location`, {
    headers: { Authorization: `Bearer ${ownerToken}` }
  });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.sharingStatus, 'PAUSED');
  assert.strictEqual(res.body.data.location, null);
  assert.ok(res.body.data.message.includes('paused'));
});
