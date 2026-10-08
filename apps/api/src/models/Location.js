const mongoose = require('mongoose');
const { NETWORK_TYPES } = require('@family-safety/shared-types');

const locationSchema = new mongoose.Schema(
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
      required: true
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number], // [longitude, latitude] GeoJSON standard
        required: true
      }
    },
    accuracy: {
      type: Number, // In meters
      required: true
    },
    speed: {
      type: Number, // In m/s
      default: 0
    },
    heading: {
      type: Number, // In degrees
      default: 0
    },
    altitude: {
      type: Number,
      default: 0
    },
    batteryLevel: {
      type: Number,
      default: null
    },
    networkType: {
      type: String,
      enum: Object.values(NETWORK_TYPES),
      default: NETWORK_TYPES.UNKNOWN
    },
    timestamp: {
      type: Date,
      required: true
    }
  },
  {
    timestamps: true
  }
);

// High-speed Geospatial Index
locationSchema.index({ location: '2dsphere' });

// Efficient Member History Query Index
locationSchema.index({ membershipId: 1, timestamp: -1 });

// Controlled 30-day Data Retention TTL Index (2,592,000 seconds)
locationSchema.index({ timestamp: 1 }, { expireAfterSeconds: 2592000 });

module.exports = mongoose.model('Location', locationSchema);
