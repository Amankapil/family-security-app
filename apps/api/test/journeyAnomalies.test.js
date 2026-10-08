const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const mongoose = require('mongoose');
const crypto = require('crypto');
const app = require('../src/app');
const { connectDB } = require('../src/config/db');
const { User, Family, FamilyMembership, Device, Geofence, Journey, Alert } = require('../src/models');
const { generateAccessToken } = require('../src/utils/token');
const { ROLES, GEOFENCE_TYPES, JOURNEY_STATUS, MEMBER_STATUS, ALERT_CATEGORIES } = require('@family-safety/shared-types');
const { detectStaleJourneys } = require('../src/services/journeyService');

const TEST_DB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/family_safety_test_journey_anomalies';

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
let homeGeofence;
let officeGeofence;

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
    email: 'aman@anomalies.test',
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
    deviceName: "Dad's Phone",
    deviceTokenHash: tokenHash,
    batteryLevel: 85,
    isCharging: false,
    networkType: '5G',
    isActive: true,
    lastSeenAt: new Date()
  });

  // Setup Home & Office Geofences
  homeGeofence = await Geofence.create({
    familyId: family._id,
    name: 'Home',
    type: GEOFENCE_TYPES.HOME,
    location: { type: 'Point', coordinates: [77.2090, 28.6139] },
    radiusMeters: 100,
    enabled: true
  });

  officeGeofence = await Geofence.create({
    familyId: family._id,
    name: "Dad's Office",
    type: GEOFENCE_TYPES.WORK,
    membershipId: dadMember._id,
    location: { type: 'Point', coordinates: [77.2300, 28.6300] },
    radiusMeters: 100,
    enabled: true
  });
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('Journey Anomalies: Departure starts journey and updates status to TRAVELLING', async () => {
  // Fix 1: Moving outside Home at 12 m/s (~43 km/h)
  const departureFix = {
    latitude: 28.6170,
    longitude: 28.6170 > 0 ? 77.2130 : 77.2130,
    accuracy: 8,
    speed: 12.0,
    heading: 45,
    timestamp: new Date().toISOString()
  };

  const res = await fetch(`${baseUrl}/locations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Device-Token': rawDadToken,
      'X-Device-Id': dadDevice._id.toString()
    },
    body: JSON.stringify([departureFix])
  });

  assert.equal(res.status, 200);

  const activeJourney = await Journey.findOne({
    membershipId: dadMember._id,
    status: JOURNEY_STATUS.TRAVELLING
  });

  assert.ok(activeJourney, 'Active journey should be created');
  assert.equal(activeJourney.destinationName, "Dad's Office");

  const refreshedMember = await FamilyMembership.findById(dadMember._id);
  assert.equal(refreshedMember.currentStatus.state, MEMBER_STATUS.TRAVELLING);
});

test('Journey Anomalies: Prolonged stop (>15m stationary mid-journey) triggers PROLONGED_STOP alert', async () => {
  const activeJourney = await Journey.findOne({
    membershipId: dadMember._id,
    status: JOURNEY_STATUS.TRAVELLING
  });
  assert.ok(activeJourney);

  // Initial stationary fix (traffic halt / breakdown at 0 speed)
  const stoppedStartTime = new Date(Date.now() - 20 * 60 * 1000); // 20 minutes ago
  const stopStartFix = {
    latitude: 28.6210,
    longitude: 77.2200,
    accuracy: 6,
    speed: 0.1, // Near zero
    timestamp: stoppedStartTime.toISOString()
  };

  await fetch(`${baseUrl}/locations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Device-Token': rawDadToken,
      'X-Device-Id': dadDevice._id.toString()
    },
    body: JSON.stringify([stopStartFix])
  });

  // Current stationary fix 20 minutes later
  const stopCurrentFix = {
    latitude: 28.6210,
    longitude: 77.2200,
    accuracy: 5,
    speed: 0.0,
    timestamp: new Date().toISOString()
  };

  await fetch(`${baseUrl}/locations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Device-Token': rawDadToken,
      'X-Device-Id': dadDevice._id.toString()
    },
    body: JSON.stringify([stopCurrentFix])
  });

  // Verify Journey is flagged DELAYED
  const delayedJourney = await Journey.findById(activeJourney._id);
  assert.equal(delayedJourney.status, JOURNEY_STATUS.DELAYED);
  assert.equal(delayedJourney.metadata.stoppageAlertTriggered, true);
  assert.ok(delayedJourney.metadata.stoppedDurationMinutes >= 15);

  // Verify Member State changed to POSSIBLE_ISSUE
  const refreshedMember = await FamilyMembership.findById(dadMember._id);
  assert.equal(refreshedMember.currentStatus.state, MEMBER_STATUS.POSSIBLE_ISSUE);
  assert.ok(refreshedMember.currentStatus.statusMessage.includes('Unexpected stop'));

  // Verify Alert was created
  const stopAlert = await Alert.findOne({
    familyId: family._id,
    membershipId: dadMember._id,
    category: ALERT_CATEGORIES.PROLONGED_STOP
  });
  assert.ok(stopAlert, 'PROLONGED_STOP alert must be created');
});

test('Journey Anomalies: Resuming travel recovers journey and member state', async () => {
  // Member starts moving again at 15 m/s (~54 km/h)
  const movingFix = {
    latitude: 28.6240,
    longitude: 77.2240,
    accuracy: 6,
    speed: 15.0,
    timestamp: new Date().toISOString()
  };

  await fetch(`${baseUrl}/locations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Device-Token': rawDadToken,
      'X-Device-Id': dadDevice._id.toString()
    },
    body: JSON.stringify([movingFix])
  });

  const refreshedMember = await FamilyMembership.findById(dadMember._id);
  assert.equal(refreshedMember.currentStatus.state, MEMBER_STATUS.TRAVELLING);

  const recoveredJourney = await Journey.findOne({ membershipId: dadMember._id, status: JOURNEY_STATUS.TRAVELLING });
  assert.ok(recoveredJourney, 'Journey should recover to TRAVELLING status');
  assert.equal(recoveredJourney.metadata.stoppageAlertTriggered, false);
});

test('Journey Anomalies: Stale journey detection flags silent transit (>15m without fix)', async () => {
  // Artificially simulate stale lastLocation timestamp on active journey
  const staleJourney = await Journey.findOne({
    membershipId: dadMember._id,
    status: JOURNEY_STATUS.TRAVELLING
  });

  staleJourney.lastLocation.timestamp = new Date(Date.now() - 25 * 60 * 1000); // 25 minutes silent
  await staleJourney.save();

  // Run stale journey detector
  const flagged = await detectStaleJourneys(family._id);
  assert.ok(flagged.length >= 1, 'Should detect at least 1 stale active journey');

  const staleAlert = await Alert.findOne({
    familyId: family._id,
    membershipId: dadMember._id,
    category: ALERT_CATEGORIES.LOCATION_STALE
  });

  assert.ok(staleAlert, 'LOCATION_STALE alert should be created');
  assert.ok(staleAlert.message.includes('25 minutes'));
});

test('Journey Anomalies: GET /journeys/anomalies endpoint returns family anomalies list', async () => {
  const res = await fetch(`${baseUrl}/journeys/anomalies`, {
    headers: {
      Authorization: `Bearer ${ownerToken}`
    }
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.ok(Array.isArray(data.data));
  assert.ok(data.data.length >= 1);
  assert.equal(data.data[0].destinationName, "Dad's Office");
  assert.equal(data.data[0].hasAnomaly, true);
});
