const mongoose = require('mongoose');

const dailySummarySchema = new mongoose.Schema(
  {
    familyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Family',
      required: true,
      index: true
    },
    membershipId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FamilyMembership',
      required: true,
      index: true
    },
    date: {
      type: String, // YYYY-MM-DD
      required: true,
      index: true
    },
    status: {
      type: String,
      default: 'NORMAL'
    },
    timelineEvents: [
      {
        time: { type: String, required: true }, // HH:mm
        eventType: { type: String, required: true },
        description: { type: String, required: true },
        icon: { type: String, default: '📍' },
        timestamp: { type: Date, default: Date.now }
      }
    ],
    totalDistanceMeters: {
      type: Number,
      default: 0
    },
    journeysCompletedCount: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true
  }
);

dailySummarySchema.index({ membershipId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('DailySummary', dailySummarySchema);
