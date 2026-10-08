const rateLimit = require('express-rate-limit');

const isTestEnv = process.env.NODE_ENV === 'test';

/**
 * Standard Auth Rate Limiter (Brute-force protection on /auth)
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTestEnv && !process.env.TEST_RATE_LIMIT ? 1000 : 30, // 30 requests per 15 mins in prod
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many authentication attempts. Please try again in 15 minutes.'
  }
});

/**
 * Device Pairing Rate Limiter (Protects 6-character short codes / QR tokens)
 */
const pairingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTestEnv && !process.env.TEST_RATE_LIMIT ? 1000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many device pairing attempts. Please wait 15 minutes.'
  }
});

/**
 * High-Throughput Device Telemetry Limiter (Allows high-frequency GPS fixes)
 */
const telemetryLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: isTestEnv && !process.env.TEST_RATE_LIMIT ? 2000 : 180, // 180 requests per min
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Location upload throughput exceeded. Batch fixes locally and sync via WorkManager.'
  }
});

/**
 * NoSQL Injection Sanitizer: Recursively strips keys starting with '$' or containing '.'
 */
function sanitizeInput(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  for (const key of Object.keys(obj)) {
    if (key.startsWith('$') || key.includes('.')) {
      delete obj[key];
    } else if (typeof obj[key] === 'object') {
      sanitizeInput(obj[key]);
    }
  }
  return obj;
}

/**
 * Express middleware to sanitize body, query, and params
 */
function sanitizeMiddleware(req, res, next) {
  if (req.body) sanitizeInput(req.body);
  if (req.query) sanitizeInput(req.query);
  if (req.params) sanitizeInput(req.params);
  next();
}

/**
 * Factory for creating custom testable rate limiters
 */
function createRateLimiter(options = {}) {
  return rateLimit({
    windowMs: options.windowMs || 60 * 1000,
    max: options.max || 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error: options.message || 'Rate limit exceeded.'
    }
  });
}

module.exports = {
  authLimiter,
  pairingLimiter,
  telemetryLimiter,
  sanitizeInput,
  sanitizeMiddleware,
  createRateLimiter
};
