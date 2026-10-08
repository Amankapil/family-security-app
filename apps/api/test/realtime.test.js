const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const mongoose = require('mongoose');
const app = require('../src/app');
const { connectDB } = require('../src/config/db');
const { User, Family, FamilyMembership, Device, PairingToken, Alert } = require('../src/models');
const { generateAccessToken } = require('../src/utils/token');
const { ROLES, MEMBER_STATUS } = require('@family-safety/shared-types');
const crypto = require('crypto');

const TEST_DB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/family_safety_test_realtime';

let server;
let port;
let baseUrl;

let ownerUser;
let family;
let ownerMember;
let dadMember;
let dadDevice;
let ownerToken;
let rawDeviceToken;

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

  // Setup Family and Owner
  ownerUser = await User.create({
    email: 'admin@kapilfamily.test',
    passwordHash: 'hash',
    fullName: 'Aman Kapil'
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
    familyId: family._id.toString(),
    membershipId: ownerMember._id.toString(),
    role: ROLES.OWNER
  });

  // Setup Dad Member and Paired Device
  dadMember = await FamilyMembership.create({
    familyId: family._id,
    displayName: 'Dad',
    role: ROLES.MEMBER
  });

  rawDeviceToken = 'dad_secret_token_abc123';
  dadDevice = await Device.create({
    familyId: family._id,
    membershipId: dadMember._id,
    deviceName: "Dad's Phone",
    deviceModel: 'Pixel 8',
    deviceTokenHash: crypto.createHash('sha256').update(rawDeviceToken).digest('hex'),
    isActive: true
  });
  dadMember.activeDeviceId = dadDevice._id;
  await dadMember.save();
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await new Promise((resolve) => server.close(resolve));
});

test('Realtime SSE: Connect with query token and receive connection handshake', async () => {
  const chunks = [];
  let sseRes;

  const req = http.get(`${baseUrl}/realtime/stream?token=${ownerToken}`, (res) => {
    sseRes = res;
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'text/event-stream');

    res.on('data', (chunk) => {
      chunks.push(chunk.toString());
    });
  });

  // Wait for initial connected event
  await new Promise((resolve) => setTimeout(resolve, 300));
  req.destroy();
  if (sseRes) sseRes.destroy();

  const fullData = chunks.join('');
  assert.ok(fullData.includes('event: connected'));
  assert.ok(fullData.includes(family._id.toString()));
});

test('Realtime SSE: Ingesting GPS fix broadcasts location-updated event', async () => {
  const events = [];
  let sseRes;

  const sseReq = http.get(`${baseUrl}/realtime/stream?token=${ownerToken}`, (res) => {
    sseRes = res;
    res.on('data', (chunk) => {
      events.push(chunk.toString());
    });
  });

  // Wait for SSE handshake
  await new Promise((resolve) => setTimeout(resolve, 200));

  // Ingest location fix from Dad's phone via /locations
  const postRes = await fetch(`${baseUrl}/locations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Device-Id': dadDevice._id.toString(),
      'X-Device-Token': rawDeviceToken
    },
    body: JSON.stringify({
      latitude: 28.5355,
      longitude: 77.3910,
      accuracy: 12,
      speed: 15,
      batteryLevel: 88,
      timestamp: new Date().toISOString()
    })
  });

  assert.equal(postRes.status, 200);

  // Wait for SSE delivery
  await new Promise((resolve) => setTimeout(resolve, 300));
  sseReq.destroy();
  if (sseRes) sseRes.destroy();

  const combined = events.join('');
  assert.ok(combined.includes('event: location-updated'), 'Should contain location-updated event');
  assert.ok(combined.includes('28.5355'), 'Should contain latitude');
  assert.ok(combined.includes('77.391'), 'Should contain longitude');
});

test('Realtime SSE: Triggering SOS broadcasts sos-triggered event', async () => {
  const events = [];
  let sseRes;

  const sseReq = http.get(`${baseUrl}/realtime/stream?token=${ownerToken}`, (res) => {
    sseRes = res;
    res.on('data', (chunk) => {
      events.push(chunk.toString());
    });
  });

  await new Promise((resolve) => setTimeout(resolve, 200));

  // Dad triggers SOS
  const sosRes = await fetch(`${baseUrl}/sos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Device-Id': dadDevice._id.toString(),
      'X-Device-Token': rawDeviceToken
    },
    body: JSON.stringify({
      latitude: 28.5355,
      longitude: 77.3910,
      accuracy: 8,
      batteryLevel: 85,
      triggerType: 'MANUAL_SOS'
    })
  });

  assert.equal(sosRes.status, 200);
  const sosData = await sosRes.json();
  const alertId = sosData.data.alertId;

  await new Promise((resolve) => setTimeout(resolve, 300));
  sseReq.destroy();
  if (sseRes) sseRes.destroy();

  const combined = events.join('');
  assert.ok(combined.includes('event: sos-triggered'), 'Should contain sos-triggered event');
  assert.ok(combined.includes('Dad'), 'Should contain member name');
  assert.ok(combined.includes(alertId), 'Should contain alert ID');
});

test('Realtime SSE: Resolving SOS broadcasts sos-resolved event', async () => {
  // Create an active SOS alert
  const alert = await Alert.create({
    familyId: family._id,
    membershipId: dadMember._id,
    type: 'SOS',
    category: 'SOS',
    title: 'Dad in danger',
    message: 'SOS triggered'
  });

  const events = [];
  let sseRes;

  const sseReq = http.get(`${baseUrl}/realtime/stream?token=${ownerToken}`, (res) => {
    sseRes = res;
    res.on('data', (chunk) => {
      events.push(chunk.toString());
    });
  });

  await new Promise((resolve) => setTimeout(resolve, 200));

  // Resolve SOS via admin dashboard
  const resolveRes = await fetch(`${baseUrl}/sos/${alert._id}/resolve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ownerToken}`
    }
  });

  assert.equal(resolveRes.status, 200);

  await new Promise((resolve) => setTimeout(resolve, 300));
  sseReq.destroy();
  if (sseRes) sseRes.destroy();

  const combined = events.join('');
  assert.ok(combined.includes('event: sos-resolved'), 'Should contain sos-resolved event');
  assert.ok(combined.includes(alert._id.toString()), 'Should contain resolved alert ID');
});
