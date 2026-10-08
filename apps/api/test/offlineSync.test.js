const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const mongoose = require('mongoose');
const app = require('../src/app');
const { connectDB } = require('../src/config/db');
const { User, Family, FamilyMembership, Device, Location } = require('../src/models');
const { generateAccessToken } = require('../src/utils/token');
const { ROLES } = require('@family-safety/shared-types');
const crypto = require('crypto');

const TEST_DB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/family_safety_test_offline_sync';

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
    email: 'aman@offline-sync.test',
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
    familyId: family._id.toString(),
    membershipId: ownerMember._id.toString(),
    role: ROLES.OWNER
  });

  // Setup Dad & Device
  dadMember = await FamilyMembership.create({
    familyId: family._id,
    displayName: 'Dad',
    role: ROLES.MEMBER
  });

  rawDadToken = 'dad_secret_token_sync_123';
  dadDevice = await Device.create({
    familyId: family._id,
    membershipId: dadMember._id,
    deviceName: "Dad's Phone",
    deviceModel: 'Pixel 8',
    deviceTokenHash: crypto.createHash('sha256').update(rawDadToken).digest('hex'),
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

test('Offline Sync: Ingests batch of 30 buffered historical location fixes', async () => {
  const baseTime = Date.now() - 3600000; // 1 hour ago
  const fixes = [];

  // Generate 30 consecutive fixes simulating commute through a tunnel
  for (let i = 0; i < 30; i++) {
    const fixTime = new Date(baseTime + i * 60000).toISOString(); // 1 minute apart
    fixes.push({
      latitude: 28.5355 + i * 0.001,
      longitude: 77.3910 + i * 0.001,
      accuracy: 10 + (i % 5),
      speed: 12.0, // ~43 km/h
      heading: 45.0,
      batteryLevel: Math.max(20, 90 - Math.floor(i / 3)),
      timestamp: fixTime
    });
  }

  // Upload bulk batch simulating WorkManager flush
  const res = await fetch(`${baseUrl}/locations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Device-Id': dadDevice._id.toString(),
      'X-Device-Token': rawDadToken
    },
    body: JSON.stringify({ locations: fixes })
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.data.ingestedCount, 30);
  assert.equal(data.data.droppedCount, 0);

  // Verify in MongoDB
  const storedCount = await Location.countDocuments({
    familyId: family._id,
    membershipId: dadMember._id
  });
  assert.equal(storedCount, 30);

  // Verify live member state resolved to the newest chronological fix
  const refreshedMember = await FamilyMembership.findById(dadMember._id);
  const newestFix = fixes[29];

  assert.equal(refreshedMember.currentStatus.lastLocation.latitude, newestFix.latitude);
  assert.equal(refreshedMember.currentStatus.lastLocation.longitude, newestFix.longitude);
  assert.equal(refreshedMember.currentStatus.batteryLevel, newestFix.batteryLevel);
});

test('Offline Sync: Breadcrumbs history returns all 30 points in chronological order', async () => {
  const res = await fetch(`${baseUrl}/members/${dadMember._id}/locations?order=asc`, {
    headers: {
      Authorization: `Bearer ${ownerToken}`
    }
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.ok(Array.isArray(data.data));
  assert.equal(data.data.length, 30);

  // Verify timestamps are ordered chronologically
  const locations = data.data;
  for (let i = 1; i < locations.length; i++) {
    const prevTime = new Date(locations[i - 1].timestamp).getTime();
    const currTime = new Date(locations[i].timestamp).getTime();
    assert.ok(currTime >= prevTime, `Location index ${i} must be chronologically after or equal to index ${i-1}`);
  }
});

test('Offline Sync: Out-of-order arrival does not overwrite newer member state', async () => {
  // Submit an older fix (recorded 2 hours ago)
  const olderTimestamp = new Date(Date.now() - 7200000).toISOString();
  const olderFix = {
    latitude: 27.9999,
    longitude: 76.9999,
    accuracy: 10,
    speed: 5.0,
    timestamp: olderTimestamp
  };

  const res = await fetch(`${baseUrl}/locations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Device-Id': dadDevice._id.toString(),
      'X-Device-Token': rawDadToken
    },
    body: JSON.stringify(olderFix)
  });

  assert.equal(res.status, 200);

  // Verify member's lastLocation did NOT revert to the 2-hour-old point
  const refreshedMember = await FamilyMembership.findById(dadMember._id);
  assert.notEqual(refreshedMember.currentStatus.lastLocation.latitude, 27.9999);
});
