const mongoose = require('mongoose');
const { ALERT_LEVELS, ALERT_CATEGORIES } = require('@family-safety/shared-types');

const alertSchema = new mongoose.Schema(
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
    type: {
      type: String,
      enum: Object.values(ALERT_LEVELS),
      default: ALERT_LEVELS.INFO,
      index: true
    },
    category: {
      type: String,
      enum: Object.values(ALERT_CATEGORIES),
      required: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    message: {
      type: String,
      required: true,
      trim: true
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    acknowledgedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    resolvedAt: {
      type: Date,
      default: null,
      index: true
    }
  },
  {
    timestamps: true
  }
);

alertSchema.index({ familyId: 1, createdAt: -1 });

module.exports = mongoose.model('Alert', alertSchema);
