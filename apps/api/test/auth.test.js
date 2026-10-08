const test = require('node:test');
const assert = require('node:assert');
const { connectDB, disconnectDB } = require('../src/config/db');
const { Family, User, FamilyMembership, AuditLog } = require('../src/models');
const app = require('../src/app');

const TEST_DB_URI = process.env.MONGODB_URI_AUTH || 'mongodb://127.0.0.1:27017/family_safety_test_auth';

// Helper for HTTP requests against Express app without listening on a port
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
    AuditLog.deleteMany({})
  ]);
});

test.after(async () => {
  await Promise.all([
    Family.deleteMany({}),
    User.deleteMany({}),
    FamilyMembership.deleteMany({}),
    AuditLog.deleteMany({})
  ]);
  await disconnectDB();
});

let ownerToken = null;
let refreshToken = null;
let dadMemberId = null;

test('Auth: Register Admin and initialize Kapil Family', async () => {
  const res = await makeRequest('/api/v1/auth/register', {
    method: 'POST',
    body: {
      email: 'aman@kapilfamily.test',
      password: 'SuperSecretPassword123!',
      fullName: 'Aman Kapil',
      familyName: 'Kapil Family'
    }
  });

  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data.family.name, 'Kapil Family');
  assert.strictEqual(res.body.data.membership.role, 'OWNER');
  assert.ok(res.body.data.tokens.accessToken);
  assert.ok(res.body.data.tokens.refreshToken);

  ownerToken = res.body.data.tokens.accessToken;
  refreshToken = res.body.data.tokens.refreshToken;
});

test('Auth: Login with valid credentials', async () => {
  const res = await makeRequest('/api/v1/auth/login', {
    method: 'POST',
    body: {
      email: 'aman@kapilfamily.test',
      password: 'SuperSecretPassword123!'
    }
  });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data.user.email, 'aman@kapilfamily.test');
  assert.ok(res.body.data.tokens.accessToken);
  assert.ok(res.body.data.tokens.refreshToken);
  refreshToken = res.body.data.tokens.refreshToken;
});

test('Auth: Refresh token rotation', async () => {
  const res = await makeRequest('/api/v1/auth/refresh', {
    method: 'POST',
    body: { refreshToken }
  });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  assert.ok(res.body.data.tokens.accessToken);
  assert.ok(res.body.data.tokens.refreshToken);
  assert.notStrictEqual(res.body.data.tokens.refreshToken, refreshToken); // Token rotated!

  // Reusing the old refresh token must be rejected
  const replayRes = await makeRequest('/api/v1/auth/refresh', {
    method: 'POST',
    body: { refreshToken }
  });
  assert.strictEqual(replayRes.status, 401);
});

test('Family: Add Dynamic Members (Dad, Mom, Brother, Sister)', async () => {
  // 1. Add Dad
  const dadRes = await makeRequest('/api/v1/family/members', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ownerToken}` },
    body: {
      displayName: 'Dad',
      role: 'MEMBER',
      phone: '+919811111111'
    }
  });
  assert.strictEqual(dadRes.status, 201);
  assert.strictEqual(dadRes.body.data.displayName, 'Dad');
  dadMemberId = dadRes.body.data._id;

  // 2. Add Mom
  const momRes = await makeRequest('/api/v1/family/members', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ownerToken}` },
    body: {
      displayName: 'Mom',
      role: 'MEMBER'
    }
  });
  assert.strictEqual(momRes.status, 201);
  assert.strictEqual(momRes.body.data.displayName, 'Mom');

  // 3. Add Brother
  const brotherRes = await makeRequest('/api/v1/family/members', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ownerToken}` },
    body: {
      displayName: 'Brother',
      role: 'MEMBER'
    }
  });
  assert.strictEqual(brotherRes.status, 201);
  assert.strictEqual(brotherRes.body.data.displayName, 'Brother');

  // 4. Add Sister
  const sisterRes = await makeRequest('/api/v1/family/members', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ownerToken}` },
    body: {
      displayName: 'Sister',
      role: 'MEMBER'
    }
  });
  assert.strictEqual(sisterRes.status, 201);
  assert.strictEqual(sisterRes.body.data.displayName, 'Sister');
});

test('Family: List all dynamic members in the family', async () => {
  const res = await makeRequest('/api/v1/family/members', {
    headers: { Authorization: `Bearer ${ownerToken}` }
  });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  // Total 5 members: Aman Kapil (Me), Dad, Mom, Brother, Sister
  assert.strictEqual(res.body.data.length, 5);

  const names = res.body.data.map((m) => m.displayName);
  assert.ok(names.includes('Dad'));
  assert.ok(names.includes('Mom'));
  assert.ok(names.includes('Brother'));
  assert.ok(names.includes('Sister'));
  assert.ok(names.includes('Aman Kapil'));
});

test('Family: Update member details & privacy settings', async () => {
  const res = await makeRequest(`/api/v1/family/members/${dadMemberId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${ownerToken}` },
    body: {
      locationSharingEnabled: true,
      visibleToFamily: true,
      emergencyContacts: [
        { name: 'Mom', phone: '+919822222222', relation: 'Spouse' }
      ]
    }
  });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.emergencyContacts.length, 1);
  assert.strictEqual(res.body.data.emergencyContacts[0].name, 'Mom');
});

test('Security: Prevent unauthorized access without token', async () => {
  const res = await makeRequest('/api/v1/family/members');
  assert.strictEqual(res.status, 401);
});

test('Security & Multi-Tenancy: Family B cannot access Family A data', async () => {
  // Register Family B
  const regB = await makeRequest('/api/v1/auth/register', {
    method: 'POST',
    body: {
      email: 'stranger@otherfamily.test',
      password: 'AnotherSecretPassword123!',
      fullName: 'John Stranger',
      familyName: 'Stranger Family'
    }
  });
  assert.strictEqual(regB.status, 201);
  const strangerToken = regB.body.data.tokens.accessToken;

  // Stranger tries to fetch Dad from Kapil Family
  const crossFamilyRes = await makeRequest(`/api/v1/family/members/${dadMemberId}`, {
    headers: { Authorization: `Bearer ${strangerToken}` }
  });
  // Must return 404 Not Found (or 403 Forbidden)
  assert.strictEqual(crossFamilyRes.status, 404);

  // Stranger lists their own members: must only see John Stranger, never Dad/Mom/Brother/Sister
  const strangerMembers = await makeRequest('/api/v1/family/members', {
    headers: { Authorization: `Bearer ${strangerToken}` }
  });
  assert.strictEqual(strangerMembers.status, 200);
  assert.strictEqual(strangerMembers.body.data.length, 1);
  assert.strictEqual(strangerMembers.body.data[0].displayName, 'John Stranger');
});

