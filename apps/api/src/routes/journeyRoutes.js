const express = require('express');
const {
  getMemberJourneys,
  getActiveJourney,
  getMemberTimeline,
  getJourneyAnomalies
} = require('../controllers/journeyController');
const { requireAuth } = require('../middleware/auth');
const { requireFamily } = require('../middleware/roles');

const router = express.Router();

router.use(requireAuth, requireFamily);

// Active family journey anomalies
router.get('/journeys/anomalies', getJourneyAnomalies);
router.get('/anomalies', getJourneyAnomalies);

// Member Journeys & Active status
router.get('/members/:id/journeys', getMemberJourneys);
router.get('/members/:id/journey/active', getActiveJourney);

// Daily summary timeline (e.g. /members/:id/timeline?date=2026-10-06)
router.get('/members/:id/timeline', getMemberTimeline);

module.exports = router;
