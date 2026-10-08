const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const mongoose = require('mongoose');
const crypto = require('crypto');
const app = require('../src/app');
const { connectDB } = require('../src/config/db');
const { User, Family, FamilyMembership, Device, Alert } = require('../src/models');
const { generateAccessToken } = require('../src/utils/token');
const { ROLES, ALERT_CATEGORIES } = require('@family-safety/shared-types');

const TEST_DB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/family_safety_test_diagnostics';

let server;
let port;
let baseUrl;

let ownerUser;
let family;
let ownerMember;
let dadMember;
let dadDevice;
let ownerToken;
let rawDadToken;

before(async () => {
  await connectDB(TEST_DB_URI);
  await mongoose.connection.dropDatabase();

  await new Promise((resolve) => {
    server = http.createServer(app).listen(0, () => {
      port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}/api/v1`;
      resolve();
    });
  });

  // Setup Family & Admin
  ownerUser = await User.create({
    email: 'aman@diagnostics.test',
    passwordHash: 'hash',
    fullName: 'Aman'
  });

  family = await Family.create({
    name: 'Kapil Family',
    ownerUserId: ownerUser._id
  });

  ownerMember = await FamilyMembership.create({
    familyId: family._id,
    userId: ownerUser._id,
    displayName: 'Aman',
    role: ROLES.OWNER
  });

  ownerToken = generateAccessToken({
    userId: ownerUser._id.toString(),
    email: ownerUser.email,
    familyId: family._id.toString(),
    membershipId: ownerMember._id.toString(),
    role: ROLES.OWNER
  });

  dadMember = await FamilyMembership.create({
    familyId: family._id,
    displayName: 'Dad',
    role: ROLES.MEMBER
  });

  rawDadToken = 'test_token_' + crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawDadToken).digest('hex');

  dadDevice = await Device.create({
    familyId: family._id,
    membershipId: dadMember._id,
    deviceName: "Dad's Samsung Galaxy S23",
    manufacturer: 'Samsung',
    model: 'SM-S911B',
    androidVersion: '14',
    appVersion: '1.2.0',
    deviceTokenHash: tokenHash,
    batteryLevel: 90,
    isCharging: false,
    networkType: '5G',
    permissions: {
      fineLocation: true,
      backgroundLocation: true,
      notifications: true,
      batteryOptimizationDisabled: true
    },
    isActive: true,
    lastSeenAt: new Date()
  });
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('Diagnostics: Fetch device diagnostic report returns optimal health score', async () => {
  const res = await fetch(`${baseUrl}/devices/${dadDevice._id}/diagnostics`, {
    headers: {
      Authorization: `Bearer ${ownerToken}`
    }
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.data.status, 'ONLINE');
  assert.equal(data.data.healthScore, 100);
  assert.equal(data.data.isHealthy, true);
  assert.equal(data.data.issues.length, 0);
  assert.equal(data.data.permissionStatus, 'OPTIMAL');
  assert.equal(data.data.battery.level, 90);
  assert.equal(data.data.member.displayName, 'Dad');
});

test('Diagnostics: Fetch member diagnostics endpoint by member ID', async () => {
  const res = await fetch(`${baseUrl}/devices/member/${dadMember._id}/diagnostics`, {
    headers: {
      Authorization: `Bearer ${ownerToken}`
    }
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.data.hasDevice, true);
  assert.equal(data.data.diagnostics.status, 'ONLINE');
  assert.equal(data.data.diagnostics.model, 'SM-S911B');
});

test('Diagnostics: Telemetry heartbeat detects restricted battery saver and flags degraded health', async () => {
  // Device reports battery optimization was re-enabled (restricting background sync)
  const heartbeatRes = await fetch(`${baseUrl}/devices/heartbeat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Device-Token': rawDadToken,
      'X-Device-Id': dadDevice._id.toString()
    },
    body: JSON.stringify({
      batteryLevel: 65,
      isCharging: false,
      permissions: {
        fineLocation: true,
        backgroundLocation: true,
        notifications: true,
        batteryOptimizationDisabled: false // Restricted by OS!
      }
    })
  });

  assert.equal(heartbeatRes.status, 200);

  // Re-fetch diagnostics report
  const diagRes = await fetch(`${baseUrl}/devices/${dadDevice._id}/diagnostics`, {
    headers: {
      Authorization: `Bearer ${ownerToken}`
    }
  });

  const diagData = await diagRes.json();
  assert.equal(diagData.data.permissionStatus, 'DEGRADED');
  assert.equal(diagData.data.healthScore, 70); // 100 - 30 penalty
  assert.equal(diagData.data.isHealthy, false);
  assert.ok(diagData.data.issues.includes('BATTERY_OPTIMIZATION_ACTIVE'));
  assert.ok(diagData.data.recommendations.some((r) => r.includes('Battery Optimization')));

  // Check alert was recorded
  const alert = await Alert.findOne({
    familyId: family._id,
    membershipId: dadMember._id,
    category: ALERT_CATEGORIES.PERMISSION_REVOKED
  });
  assert.ok(alert, 'PERMISSION_REVOKED alert should be created for battery saver restriction');
});

test('Diagnostics: Low battery heartbeat (< 15% not charging) triggers LOW_BATTERY alert', async () => {
  const heartbeatRes = await fetch(`${baseUrl}/devices/heartbeat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Device-Token': rawDadToken,
      'X-Device-Id': dadDevice._id.toString()
    },
    body: JSON.stringify({
      batteryLevel: 12, // Critical battery level
      isCharging: false
    })
  });

  assert.equal(heartbeatRes.status, 200);

  // Check Alert was triggered
  const alert = await Alert.findOne({
    familyId: family._id,
    membershipId: dadMember._id,
    category: ALERT_CATEGORIES.LOW_BATTERY
  });

  assert.ok(alert, 'LOW_BATTERY alert should be automatically generated');
  assert.equal(alert.metadata.batteryLevel, 12);

  // Verify diagnostic report flags BATTERY_CRITICAL
  const diagRes = await fetch(`${baseUrl}/devices/${dadDevice._id}/diagnostics`, {
    headers: {
      Authorization: `Bearer ${ownerToken}`
    }
  });
  const diagData = await diagRes.json();
  assert.equal(diagData.data.battery.status, 'CRITICAL');
  assert.ok(diagData.data.issues.includes('BATTERY_CRITICAL'));
});

test('Diagnostics: Anti-spam prevents duplicate low battery alert within throttle window', async () => {
  // Send another heartbeat at 10%
  const heartbeatRes = await fetch(`${baseUrl}/devices/heartbeat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Device-Token': rawDadToken,
      'X-Device-Id': dadDevice._id.toString()
    },
    body: JSON.stringify({
      batteryLevel: 10,
      isCharging: false
    })
  });

  assert.equal(heartbeatRes.status, 200);

  const alerts = await Alert.find({
    familyId: family._id,
    membershipId: dadMember._id,
    category: ALERT_CATEGORIES.LOW_BATTERY
  });

  // Should only have 1 alert recorded, not 2
  assert.equal(alerts.length, 1, 'Should throttle duplicate low-battery alerts');
});
