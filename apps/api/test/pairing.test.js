const test = require('node:test');
const assert = require('node:assert');
const { connectDB, disconnectDB } = require('../src/config/db');
const { Family, User, FamilyMembership, Device, PairingToken, Alert, AuditLog } = require('../src/models');
const app = require('../src/app');

const TEST_DB_URI = process.env.MONGODB_URI_PAIRING || 'mongodb://127.0.0.1:27017/family_safety_test_pairing';

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
    AuditLog.deleteMany({})
  ]);
});

test.after(async () => {
  await Promise.all([
    Family.deleteMany({}),
    User.deleteMany({}),
    FamilyMembership.deleteMany({}),
    Device.deleteMany({}),
    PairingToken.deleteMany({}),
    AuditLog.deleteMany({})
  ]);
  await disconnectDB();
});

let ownerToken = null;
let dadMemberId = null;
let generatedPairingToken = null;
let pairedDeviceId = null;
let pairedDeviceToken = null;

test('Pairing: Setup family and add Dad', async () => {
  // Register Admin
  const reg = await makeRequest('/api/v1/auth/register', {
    method: 'POST',
    body: {
      email: 'aman@pairingtest.local',
      password: 'SecurePassword123!',
      fullName: 'Aman Kapil',
      familyName: 'Kapil Family'
    }
  });
  assert.strictEqual(reg.status, 201);
  ownerToken = reg.body.data.tokens.accessToken;

  // Add Dad
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
});

test('Pairing: Admin generates short-lived Pairing Code / QR payload for Dad', async () => {
  const res = await makeRequest('/api/v1/pairing/create', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ownerToken}` },
    body: {
      membershipId: dadMemberId
    }
  });

  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.success, true);
  assert.ok(res.body.data.token.startsWith('PAIR-'));
  assert.ok(res.body.data.qrPayload);
  assert.strictEqual(res.body.data.memberName, 'Dad');

  generatedPairingToken = res.body.data.token;

  // Verify QR payload is valid JSON and contains the token
  const parsedQr = JSON.parse(res.body.data.qrPayload);
  assert.strictEqual(parsedQr.type, 'FAMILY_PAIRING');
  assert.strictEqual(parsedQr.token, generatedPairingToken);
});

test('Pairing: Android phone scans QR and completes pairing successfully', async () => {
  const res = await makeRequest('/api/v1/pairing/complete', {
    method: 'POST',
    body: {
      pairingToken: generatedPairingToken,
      deviceName: "Dad's Galaxy S23",
      manufacturer: 'Samsung',
      model: 'SM-S911B',
      androidVersion: '14',
      appVersion: '1.0.0',
      fcmToken: 'mock_fcm_token_dad_phone',
      permissions: {
        fineLocation: true,
        backgroundLocation: true,
        notifications: true,
        batteryOptimizationDisabled: true
      }
    }
  });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  assert.ok(res.body.data.deviceId);
  assert.ok(res.body.data.deviceToken);
  assert.strictEqual(res.body.data.member.displayName, 'Dad');

  pairedDeviceId = res.body.data.deviceId;
  pairedDeviceToken = res.body.data.deviceToken;
});

test('Pairing: Enforce one-time use (reusing token must be rejected)', async () => {
  const res = await makeRequest('/api/v1/pairing/complete', {
    method: 'POST',
    body: {
      pairingToken: generatedPairingToken,
      deviceName: 'Another Phone'
    }
  });

  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.success, false);
  assert.ok(res.body.error.includes('already been used'));
});

test('Pairing: Phone sends heartbeat with battery and network telemetry', async () => {
  const res = await makeRequest('/api/v1/devices/heartbeat', {
    method: 'POST',
    headers: {
      'x-device-id': pairedDeviceId,
      'x-device-token': pairedDeviceToken
    },
    body: {
      batteryLevel: 82,
      isCharging: true,
      networkType: '5G'
    }
  });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data.batteryLevel, 82);
  assert.strictEqual(res.body.data.isCharging, true);

  // Check that Dad's status reflects the device heartbeat
  const dad = await FamilyMembership.findById(dadMemberId);
  assert.strictEqual(dad.currentStatus.batteryLevel, 82);
  assert.strictEqual(dad.currentStatus.isCharging, true);
});

test('Safety: Android phone triggers SOS Emergency', async () => {
  const res = await makeRequest('/api/v1/sos', {
    method: 'POST',
    headers: {
      'x-device-id': pairedDeviceId,
      'x-device-token': pairedDeviceToken
    },
    body: {
      latitude: 28.6139,
      longitude: 77.2090,
      accuracy: 8.5,
      batteryLevel: 75,
      triggerType: 'MANUAL_SOS'
    }
  });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data.status, 'SOS_BROADCASTED');

  const dad = await FamilyMembership.findById(dadMemberId);
  assert.strictEqual(dad.currentStatus.state, 'SOS');

  // Verify Alert was created
  const sosAlert = await Alert.findOne({ membershipId: dadMemberId, type: 'SOS' });
  assert.ok(sosAlert);
  assert.ok(sosAlert.title.includes('EMERGENCY'));

  // Admin resolves SOS
  const resolveRes = await makeRequest(`/api/v1/sos/${sosAlert._id}/resolve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ownerToken}` }
  });
  assert.strictEqual(resolveRes.status, 200);

  const dadAfterResolve = await FamilyMembership.findById(dadMemberId);
  assert.strictEqual(dadAfterResolve.currentStatus.state, 'NORMAL');
});

test('Safety: Android phone sends I\'M OK confirmation', async () => {
  const res = await makeRequest('/api/v1/status/im-ok', {
    method: 'POST',
    headers: {
      'x-device-id': pairedDeviceId,
      'x-device-token': pairedDeviceToken
    },
    body: {
      note: 'Reached safely, I am OK.'
    }
  });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data.status, 'SAFE_CONFIRMED');
});

test('Pairing: Admin revokes device and subsequent device requests are blocked', async () => {
  // Admin revokes device
  const revokeRes = await makeRequest(`/api/v1/devices/${pairedDeviceId}/revoke`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ownerToken}` }
  });

  assert.strictEqual(revokeRes.status, 200);
  assert.strictEqual(revokeRes.body.success, true);

  // Revoked phone attempts heartbeat
  const blockedRes = await makeRequest('/api/v1/devices/heartbeat', {
    method: 'POST',
    headers: {
      'x-device-id': pairedDeviceId,
      'x-device-token': pairedDeviceToken
    },
    body: {
      batteryLevel: 50
    }
  });

  assert.strictEqual(blockedRes.status, 403);
  assert.strictEqual(blockedRes.body.success, false);
  assert.ok(blockedRes.body.error.includes('revoked'));
});
