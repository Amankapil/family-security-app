require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const errorHandler = require('./middleware/errorHandler');

const authRoutes = require('./routes/authRoutes');
const familyRoutes = require('./routes/familyRoutes');
const pairingRoutes = require('./routes/pairingRoutes');
const deviceRoutes = require('./routes/deviceRoutes');
const safetyRoutes = require('./routes/safetyRoutes');
const locationRoutes = require('./routes/locationRoutes');
const geofenceRoutes = require('./routes/geofenceRoutes');
const journeyRoutes = require('./routes/journeyRoutes');
const realtimeRoutes = require('./routes/realtimeRoutes');

const { sanitizeMiddleware, authLimiter, pairingLimiter } = require('./middleware/rateLimiter');

const app = express();

// Security Headers
app.use(helmet());

// CORS configuration
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:5000').split(',');
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile native Android apps)
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, true); // Dev-friendly fallback
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS']
  })
);

// Body Parsing & NoSQL Injection Sanitization
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(sanitizeMiddleware);

// Health Check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'Family Safety Network API'
  });
});

// Version 1 Routes
app.use('/api/v1/auth', authLimiter, authRoutes);
app.use('/api/v1/family', familyRoutes);
app.use('/api/v1/pairing', pairingLimiter, pairingRoutes);
app.use('/api/v1/devices', deviceRoutes);
app.use('/api/v1', safetyRoutes);
app.use('/api/v1', locationRoutes);
app.use('/api/v1', geofenceRoutes);
app.use('/api/v1', journeyRoutes);
app.use('/api/v1/realtime', realtimeRoutes);

// Global Error Handler
app.use(errorHandler);

module.exports = app;
