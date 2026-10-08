const mongoose = require('mongoose');
const { JOURNEY_STATUS } = require('@family-safety/shared-types');

const journeySchema = new mongoose.Schema(
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
    deviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Device',
      default: null
    },
    originGeofenceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Geofence',
      default: null
    },
    originName: {
      type: String,
      default: 'Unknown'
    },
    destinationGeofenceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Geofence',
      default: null
    },
    destinationName: {
      type: String,
      default: 'Travelling'
    },
    status: {
      type: String,
      enum: Object.values(JOURNEY_STATUS),
      default: JOURNEY_STATUS.STARTING
    },
    startedAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    completedAt: {
      type: Date,
      default: null
    },
    estimatedDurationMinutes: {
      type: Number,
      default: null
    },
    actualDurationMinutes: {
      type: Number,
      default: null
    },
    distanceMeters: {
      type: Number,
      default: 0
    },
    lastLocation: {
      type: {
        coordinates: [Number], // [lng, lat]
        timestamp: Date
      },
      default: null
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

journeySchema.index({ membershipId: 1, startedAt: -1 });

module.exports = mongoose.model('Journey', journeySchema);
