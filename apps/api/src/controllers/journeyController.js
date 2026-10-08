const { Journey, FamilyMembership, DailySummary } = require('../models');

/**
 * List journeys for a family member
 */
async function getMemberJourneys(req, res, next) {
  try {
    const { id } = req.params;
    const { limit = 20, status } = req.query;

    const member = await FamilyMembership.findOne({
      _id: id,
      familyId: req.user.familyId
    });

    if (!member) {
      return res.status(404).json({ success: false, error: 'Family member not found.' });
    }

    const query = {
      familyId: req.user.familyId,
      membershipId: member._id
    };

    if (status) {
      query.status = status;
    }

    const journeys = await Journey.find(query)
      .sort({ startedAt: -1 })
      .limit(Math.min(100, Number(limit)));

    return res.status(200).json({
      success: true,
      data: journeys
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get currently active journey for a member
 */
async function getActiveJourney(req, res, next) {
  try {
    const { id } = req.params;
    const member = await FamilyMembership.findOne({
      _id: id,
      familyId: req.user.familyId
    });

    if (!member) {
      return res.status(404).json({ success: false, error: 'Family member not found.' });
    }

    const active = await Journey.findOne({
      membershipId: member._id,
      status: { $in: ['STARTING', 'TRAVELLING', 'DELAYED'] }
    });

    return res.status(200).json({
      success: true,
      data: active || null
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get member's today timeline events
 */
async function getMemberTimeline(req, res, next) {
  try {
    const { id } = req.params;
    const { date } = req.query;

    const targetDate = date || new Date().toISOString().split('T')[0];

    const member = await FamilyMembership.findOne({
      _id: id,
      familyId: req.user.familyId
    });

    if (!member) {
      return res.status(404).json({ success: false, error: 'Family member not found.' });
    }

    const summary = await DailySummary.findOne({
      membershipId: member._id,
      date: targetDate
    });

    return res.status(200).json({
      success: true,
      data: {
        memberId: member._id,
        displayName: member.displayName,
        date: targetDate,
        timelineEvents: summary ? summary.timelineEvents : [],
        journeysCompletedCount: summary ? summary.journeysCompletedCount : 0
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * List active journeys with anomalies (delays, prolonged stops, stale GPS)
 */
async function getJourneyAnomalies(req, res, next) {
  try {
    const { getFamilyJourneyAnomalies } = require('../services/journeyService');
    const anomalies = await getFamilyJourneyAnomalies(req.user.familyId);

    return res.status(200).json({
      success: true,
      data: anomalies
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getMemberJourneys,
  getActiveJourney,
  getMemberTimeline,
  getJourneyAnomalies
};
