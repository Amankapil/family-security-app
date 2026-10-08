const test = require('node:test');
const assert = require('node:assert');
const { ROLES, MEMBER_STATUS } = require('@family-safety/shared-types');

test('API package workspace linkage smoke test', () => {
  assert.ok(ROLES);
  assert.strictEqual(ROLES.OWNER, 'OWNER');
  assert.strictEqual(MEMBER_STATUS.AT_HOME, 'AT_HOME');
});
