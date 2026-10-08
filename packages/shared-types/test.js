const test = require('node:test');
const assert = require('node:assert');
const {
  ROLES,
  MEMBER_STATUS,
  calculateHaversineDistance,
  isValidCoordinate
} = require('./src/index.js');

test('Shared types validation', () => {
  assert.strictEqual(ROLES.ADMIN, 'ADMIN');
  assert.strictEqual(MEMBER_STATUS.AT_HOME, 'AT_HOME');
  assert.strictEqual(MEMBER_STATUS.SOS, 'SOS');
});

test('Coordinate validation tests', () => {
  assert.strictEqual(isValidCoordinate(28.6139, 77.2090), true); // New Delhi
  assert.strictEqual(isValidCoordinate(0, 0), false); // Null Island
  assert.strictEqual(isValidCoordinate(95, 20), false); // Out of bounds lat
  assert.strictEqual(isValidCoordinate('invalid', 20), false);
});

test('Haversine distance calculation', () => {
  // Distance from Connaught Place (28.6315, 77.2167) to India Gate (28.6129, 77.2295) is approx 2.4 km
  const distance = calculateHaversineDistance(28.6315, 77.2167, 28.6129, 77.2295);
  assert.ok(distance > 2300 && distance < 2500, `Expected ~2.4km, got ${distance}`);
  assert.strictEqual(calculateHaversineDistance(28.61, 77.20, 28.61, 77.20), 0);
});
