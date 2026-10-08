const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const mongoose = require('mongoose');
const express = require('express');
const app = require('../src/app');
const { connectDB } = require('../src/config/db');
const { User, Family, FamilyMembership, AuditLog } = require('../src/models');
const { generateAccessToken } = require('../src/utils/token');
const { ROLES } = require('@family-safety/shared-types');
const { createRateLimiter, sanitizeInput } = require('../src/middleware/rateLimiter');

const TEST_DB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/family_safety_test_security';

let server;
let port;
let baseUrl;

let ownerUser;
let memberUser;
let family;
let ownerMember;
let regularMember;
let ownerToken;
let memberToken;

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
    email: 'aman@security.test',
    passwordHash: 'hash',
    fullName: 'Aman'
  });

  memberUser = await User.create({
    email: 'brother@security.test',
    passwordHash: 'hash',
    fullName: 'Brother'
  });

  family = await Family.create({
    name: 'Kapil Family',
    ownerUserId: ownerUser._id
  });

  ownerMember = await FamilyMembership.create({
    familyId: family._id,
    userId: ownerUser._id,
    displayName: 'Aman (Owner)',
    role: ROLES.OWNER
  });

  regularMember = await FamilyMembership.create({
    familyId: family._id,
    userId: memberUser._id,
    displayName: 'Brother',
    role: ROLES.MEMBER
  });

  ownerToken = generateAccessToken({
    userId: ownerUser._id.toString(),
    email: ownerUser.email,
    familyId: family._id.toString(),
    membershipId: ownerMember._id.toString(),
    role: ROLES.OWNER
  });

  memberToken = generateAccessToken({
    userId: memberUser._id.toString(),
    email: memberUser.email,
    familyId: family._id.toString(),
    membershipId: regularMember._id.toString(),
    role: ROLES.MEMBER
  });
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('Security Sanitization: NoSQL injection keys starting with $ or containing . are stripped', () => {
  const dirtyPayload = {
    email: 'admin@kapil.com',
    password: { $gt: '' },
    nested: {
      'dangerous.key': 'exploit',
      safeField: 123,
      deep: { $ne: null, valid: true }
    }
  };

  const clean = sanitizeInput(dirtyPayload);

  assert.equal(clean.email, 'admin@kapil.com');
  assert.equal(clean.password.$gt, undefined);
  assert.equal(clean.nested['dangerous.key'], undefined);
  assert.equal(clean.nested.safeField, 123);
  assert.equal(clean.nested.deep.$ne, undefined);
  assert.equal(clean.nested.deep.valid, true);
});

test('Security Rate Limiting: Exceeding request quota returns 429 Too Many Requests', async () => {
  // Create an isolated sub-server with a strict 3-request rate limiter
  const testApp = express();
  const strictLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 3,
    message: 'Too many requests for test route.'
  });

  testApp.use('/test-throttle', strictLimiter, (req, res) => {
    res.status(200).json({ success: true, count: 'ok' });
  });

  const testServer = http.createServer(testApp);
  await new Promise((resolve) => testServer.listen(0, resolve));
  const testPort = testServer.address().port;

  try {
    // 3 allowed requests
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`http://127.0.0.1:${testPort}/test-throttle`);
      assert.equal(res.status, 200);
    }

    // 4th request must be rejected with 429
    const blockedRes = await fetch(`http://127.0.0.1:${testPort}/test-throttle`);
    assert.equal(blockedRes.status, 429);
    const blockedData = await blockedRes.json();
    assert.equal(blockedData.success, false);
    assert.ok(blockedData.error.includes('Too many requests'));
  } finally {
    await new Promise((resolve) => testServer.close(resolve));
  }
});

test('Security RBAC: Regular family member is forbidden from viewing audit logs (403)', async () => {
  const res = await fetch(`${baseUrl}/family/audit-logs`, {
    headers: {
      Authorization: `Bearer ${memberToken}`
    }
  });

  assert.equal(res.status, 403);
  const data = await res.json();
  assert.equal(data.success, false);
  assert.ok(data.error.includes('Access denied'));
});

test('Security Audit Logs: Owner can review immutable audit trail', async () => {
  // Pre-seed an audit log entry
  await AuditLog.create({
    familyId: family._id,
    actorUserId: ownerUser._id,
    actorMembershipId: ownerMember._id,
    action: 'SECURITY_TEST_ACTION',
    details: { test: true }
  });

  const res = await fetch(`${baseUrl}/family/audit-logs`, {
    headers: {
      Authorization: `Bearer ${ownerToken}`
    }
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.ok(Array.isArray(data.data));
  assert.ok(data.data.some((log) => log.action === 'SECURITY_TEST_ACTION'));
});
