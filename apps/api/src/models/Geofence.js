const mongoose = require('mongoose');
const { GEOFENCE_TYPES } = require('@family-safety/shared-types');

const geofenceSchema = new mongoose.Schema(
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
      default: null, // Null indicates a family-wide place (e.g. shared Family Home)
      index: true
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 60
    },
    type: {
      type: String,
      enum: Object.values(GEOFENCE_TYPES),
      default: GEOFENCE_TYPES.CUSTOM
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number], // [longitude, latitude] GeoJSON
        required: true
      }
    },
    radius: {
      type: Number,
      default: 150, // In meters
      min: 50,
      max: 2000
    },
    dwellTimeSeconds: {
      type: Number,
      default: 180, // 3-minute debounce window
      min: 10,
      max: 600
    },
    enabled: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

geofenceSchema.index({ location: '2dsphere' });
geofenceSchema.index({ familyId: 1, membershipId: 1 });

module.exports = mongoose.model('Geofence', geofenceSchema);
