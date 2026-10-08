const mongoose = require('mongoose');
const { NETWORK_TYPES } = require('@family-safety/shared-types');

const deviceSchema = new mongoose.Schema(
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
    deviceName: {
      type: String,
      required: true,
      trim: true
    },
    manufacturer: {
      type: String,
      default: 'Unknown'
    },
    model: {
      type: String,
      default: 'Unknown'
    },
    androidVersion: {
      type: String,
      default: 'Unknown'
    },
    appVersion: {
      type: String,
      default: '1.0.0'
    },
    deviceTokenHash: {
      type: String,
      required: true,
      index: true
    },
    fcmToken: {
      type: String,
      default: null
    },
    batteryLevel: {
      type: Number,
      min: 0,
      max: 100,
      default: 100
    },
    isCharging: {
      type: Boolean,
      default: false
    },
    networkType: {
      type: String,
      enum: Object.values(NETWORK_TYPES),
      default: NETWORK_TYPES.UNKNOWN
    },
    permissions: {
      fineLocation: { type: Boolean, default: false },
      backgroundLocation: { type: Boolean, default: false },
      notifications: { type: Boolean, default: false },
      batteryOptimizationDisabled: { type: Boolean, default: false }
    },
    isActive: {
      type: Boolean,
      default: true
    },
    lastSeenAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

deviceSchema.index({ familyId: 1, membershipId: 1 });

module.exports = mongoose.model('Device', deviceSchema);
