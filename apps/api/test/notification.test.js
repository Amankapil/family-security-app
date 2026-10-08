const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const mongoose = require('mongoose');
const app = require('../src/app');
const { connectDB } = require('../src/config/db');
const { User, Family, FamilyMembership, Device, Alert, Geofence } = require('../src/models');
const { generateAccessToken } = require('../src/utils/token');
const {
  sendToToken,
  sendToFamily,
  sendSosAlert,
  sendGeofenceAlert,
  sendLowBatteryAlert,
  isFcmInitialized
} = require('../src/services/notificationService');
const { ROLES } = require('@family-safety/shared-types');
const crypto = require('crypto');

const TEST_DB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/family_safety_test_notification';

let server;
let port;
let baseUrl;

let ownerUser;
let family;
let ownerMember;
let dadMember;
let sisterMember;
let dadDevice;
let sisterDevice;
let rawDadToken;
let rawSisterToken;

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

  // 1. Setup Family & Owner
  ownerUser = await User.create({
    email: 'aman@kapilfamily.test',
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

  // 2. Setup Dad Member with Paired Device and FCM Token
  dadMember = await FamilyMembership.create({
    familyId: family._id,
    displayName: 'Dad',
    role: ROLES.MEMBER
  });

  rawDadToken = 'dad_secret_token_fcm_123';
  dadDevice = await Device.create({
    familyId: family._id,
    membershipId: dadMember._id,
    deviceName: "Dad's Phone",
    deviceModel: 'Pixel 8',
    deviceTokenHash: crypto.createHash('sha256').update(rawDadToken).digest('hex'),
    fcmToken: 'fcm_token_dad_device_sample_abc',
    isActive: true
  });
  dadMember.activeDeviceId = dadDevice._id;
  await dadMember.save();

  // 3. Setup Sister Member with Paired Device and FCM Token
  sisterMember = await FamilyMembership.create({
    familyId: family._id,
    displayName: 'Sister',
    role: ROLES.MEMBER
  });

  rawSisterToken = 'sister_secret_token_fcm_456';
  sisterDevice = await Device.create({
    familyId: family._id,
    membershipId: sisterMember._id,
    deviceName: "Sister's Phone",
    deviceModel: 'Galaxy S23',
    deviceTokenHash: crypto.createHash('sha256').update(rawSisterToken).digest('hex'),
    fcmToken: 'fcm_token_sister_device_sample_xyz',
    isActive: true
  });
  sisterMember.activeDeviceId = sisterDevice._id;
  await sisterMember.save();
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await new Promise((resolve) => server.close(resolve));
});

test('Notification Service: Operates safely in simulated mode without throwing', async () => {
  const result = await sendToToken('test_token_123', {
    title: 'Test Notification',
    body: 'Testing notification pipeline',
    data: { testKey: 'testVal' },
    priority: 'high',
    channelId: 'emergency_sos'
  });

  assert.equal(result.success, true);
  assert.equal(result.title, 'Test Notification');
  assert.equal(result.recipientToken, 'test_token_123');
});

test('Notification API: Device syncs new FCM token via POST /devices/fcm-token', async () => {
  const newToken = 'fcm_updated_token_fresh_999';

  const res = await fetch(`${baseUrl}/devices/fcm-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Device-Id': dadDevice._id.toString(),
      'X-Device-Token': rawDadToken
    },
    body: JSON.stringify({ fcmToken: newToken })
  });

  assert.equal(res.status, 200);

  // Verify in MongoDB
  const updatedDevice = await Device.findById(dadDevice._id);
  assert.equal(updatedDevice.fcmToken, newToken);
});

test('Notification Fan-out: Broadcasts to family devices excluding sender', async () => {
  const result = await sendToFamily(family._id, {
    title: 'Family Notice',
    body: 'Everyone please check in',
    excludeDeviceId: dadDevice._id
  });

  // Should target Sister's phone and exclude Dad's phone
  assert.equal(result.targetedDevicesCount, 1);
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].recipientToken, sisterDevice.fcmToken);
});

test('Notification SOS: Emergency trigger broadcasts high-priority SOS alert', async () => {
  // Dad triggers SOS via POST /sos
  const sosRes = await fetch(`${baseUrl}/sos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Device-Id': dadDevice._id.toString(),
      'X-Device-Token': rawDadToken
    },
    body: JSON.stringify({
      latitude: 28.5355,
      longitude: 77.3910,
      accuracy: 9,
      batteryLevel: 75,
      triggerType: 'MANUAL_SOS'
    })
  });

  assert.equal(sosRes.status, 200);

  // Directly verify sendSosAlert helper output
  const sosDispatch = await sendSosAlert(family._id, dadMember, { latitude: 28.5355, longitude: 77.3910 }, 'alert_123');
  assert.equal(sosDispatch.targetedDevicesCount, 1);
  assert.equal(sosDispatch.results[0].title.includes('EMERGENCY SOS'), true);
  assert.equal(sosDispatch.results[0].recipientToken, sisterDevice.fcmToken);
});

test('Notification Geofence: Arrival and departure alerts dispatch to family', async () => {
  const mockGeofence = {
    _id: new mongoose.Types.ObjectId(),
    name: 'Kapil Home'
  };

  const arrivalResult = await sendGeofenceAlert(family._id, sisterMember, mockGeofence, 'ENTER_CONFIRMED');
  assert.equal(arrivalResult.targetedDevicesCount, 1);
  assert.equal(arrivalResult.results[0].title.includes('reached Kapil Home'), true);

  const departureResult = await sendGeofenceAlert(family._id, sisterMember, mockGeofence, 'EXIT_CONFIRMED');
  assert.equal(departureResult.targetedDevicesCount, 1);
  assert.equal(departureResult.results[0].title.includes('left Kapil Home'), true);
});

test('Notification Battery: Low battery alert dispatches to family', async () => {
  const batteryResult = await sendLowBatteryAlert(family._id, dadMember, 12);
  assert.equal(batteryResult.targetedDevicesCount, 1);
  assert.equal(batteryResult.results[0].title.includes('Low Battery Warning: Dad'), true);
  assert.equal(batteryResult.results[0].body.includes('12%'), true);
});
