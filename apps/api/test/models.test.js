const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const { connectDB, disconnectDB } = require('../src/config/db');
const {
  Family,
  User,
  FamilyMembership,
  Device,
  PairingToken,
  Location,
  Geofence,
  Journey,
  Alert,
  DailySummary,
  AuditLog
} = require('../src/models');
const {
  ROLES,
  MEMBER_STATUS,
  GEOFENCE_TYPES,
  JOURNEY_STATUS,
  ALERT_LEVELS,
  ALERT_CATEGORIES
} = require('@family-safety/shared-types');

const TEST_DB_URI = process.env.MONGODB_URI_MODELS || 'mongodb://127.0.0.1:27017/family_safety_test_models';

test.before(async () => {
  await connectDB(TEST_DB_URI);
  await Promise.all([
    Family.deleteMany({}),
    User.deleteMany({}),
    FamilyMembership.deleteMany({}),
    Device.deleteMany({}),
    PairingToken.deleteMany({}),
    Location.deleteMany({}),
    Geofence.deleteMany({}),
    Journey.deleteMany({}),
    Alert.deleteMany({}),
    DailySummary.deleteMany({}),
    AuditLog.deleteMany({})
  ]);
  await Promise.all([
    Geofence.syncIndexes(),
    Location.syncIndexes(),
    PairingToken.syncIndexes(),
    User.syncIndexes(),
    FamilyMembership.syncIndexes(),
    DailySummary.syncIndexes()
  ]);
});

test.after(async () => {
  await Promise.all([
    Family.deleteMany({}),
    User.deleteMany({}),
    FamilyMembership.deleteMany({}),
    Device.deleteMany({}),
    PairingToken.deleteMany({}),
    Location.deleteMany({}),
    Geofence.deleteMany({}),
    Journey.deleteMany({}),
    Alert.deleteMany({}),
    DailySummary.deleteMany({}),
    AuditLog.deleteMany({})
  ]);
  await disconnectDB();
});

test('Phase 2 Models: Create Family, Admin User, and Dynamic Members', async () => {
  const adminUser = await User.create({
    email: 'admin@kapilfamily.test',
    passwordHash: '$2a$10$testhashstringhere',
    fullName: 'Aman Kapil',
    phone: '+919876543210'
  });
  assert.ok(adminUser._id);
  assert.strictEqual(adminUser.email, 'admin@kapilfamily.test');

  const family = await Family.create({
    name: 'Kapil Family',
    ownerUserId: adminUser._id
  });
  assert.ok(family._id);
  assert.strictEqual(family.name, 'Kapil Family');
  assert.strictEqual(family.settings.locationRetentionDays, 30);

  const dad = await FamilyMembership.create({
    familyId: family._id,
    displayName: 'Dad',
    role: ROLES.MEMBER
  });
  assert.strictEqual(dad.displayName, 'Dad');
  assert.strictEqual(dad.role, ROLES.MEMBER);
  assert.strictEqual(dad.currentStatus.state, MEMBER_STATUS.NORMAL);

  const homeGeofence = await Geofence.create({
    familyId: family._id,
    name: 'Family Home',
    type: GEOFENCE_TYPES.HOME,
    location: {
      type: 'Point',
      coordinates: [77.2090, 28.6139]
    },
    radius: 150
  });
  assert.ok(homeGeofence._id);

  const nearby = await Geofence.find({
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [77.2091, 28.6140]
        },
        $maxDistance: 500
      }
    }
  });
  assert.strictEqual(nearby.length, 1);
  assert.strictEqual(nearby[0].name, 'Family Home');
});

test('Phase 2 Models: Journey, Alert, DailySummary, and AuditLog', async () => {
  const family = await Family.findOne({ name: 'Kapil Family' });
  const dad = await FamilyMembership.findOne({ displayName: 'Dad' });
  const home = await Geofence.findOne({ name: 'Family Home' });

  // 1. Journey Model
  const journey = await Journey.create({
    familyId: family._id,
    membershipId: dad._id,
    originGeofenceId: home._id,
    originName: 'Family Home',
    destinationName: 'Office',
    status: JOURNEY_STATUS.TRAVELLING,
    startedAt: new Date()
  });
  assert.ok(journey._id);
  assert.strictEqual(journey.status, JOURNEY_STATUS.TRAVELLING);

  // 2. Alert Model
  const alert = await Alert.create({
    familyId: family._id,
    membershipId: dad._id,
    type: ALERT_LEVELS.INFO,
    category: ALERT_CATEGORIES.GEOFENCE_EVENT,
    title: 'Dad departed from Home',
    message: 'Dad started travelling to Office.'
  });
  assert.ok(alert._id);
  assert.strictEqual(alert.type, ALERT_LEVELS.INFO);

  // 3. DailySummary Model
  const summary = await DailySummary.create({
    familyId: family._id,
    membershipId: dad._id,
    date: '2026-10-06',
    timelineEvents: [
      {
        time: '08:30',
        eventType: 'DEPARTURE',
        description: 'Left Family Home',
        icon: '🚗'
      }
    ]
  });
  assert.ok(summary._id);
  assert.strictEqual(summary.timelineEvents.length, 1);

  // 4. AuditLog Model
  const audit = await AuditLog.create({
    familyId: family._id,
    action: 'MEMBER_ADDED',
    details: { memberName: 'Dad' }
  });
  assert.ok(audit._id);
  assert.strictEqual(audit.action, 'MEMBER_ADDED');

  // Verify TTL index configuration on Location collection
  const locationIndexes = await Location.collection.indexes();
  const ttlIndex = locationIndexes.find((idx) => idx.expireAfterSeconds !== undefined);
  assert.ok(ttlIndex, 'Location collection must have a TTL index');
  assert.strictEqual(ttlIndex.expireAfterSeconds, 2592000); // 30 days
});
