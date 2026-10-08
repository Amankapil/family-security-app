const mongoose = require('mongoose');
const { ROLES, MEMBER_STATUS } = require('@family-safety/shared-types');

const familyMembershipSchema = new mongoose.Schema(
  {
    familyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Family',
      required: [true, 'Family ID is required'],
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      default: null
    },
    displayName: {
      type: String,
      required: [true, 'Member display name is required'],
      trim: true,
      maxlength: 60
    },
    role: {
      type: String,
      enum: Object.values(ROLES),
      default: ROLES.MEMBER
    },
    avatarUrl: {
      type: String,
      default: null
    },
    phone: {
      type: String,
      trim: true,
      default: null
    },
    locationSharingEnabled: {
      type: Boolean,
      default: true
    },
    visibleToFamily: {
      type: Boolean,
      default: true
    },
    allowAdminsToView: {
      type: Boolean,
      default: true
    },
    emergencyContacts: [
      {
        name: { type: String, required: true },
        phone: { type: String, required: true },
        relation: { type: String, default: 'Family' }
      }
    ],
    expectedSchedule: {
      enabled: { type: Boolean, default: false },
      departureTimeWindow: { type: String, default: '08:00-09:30' },
      returnTimeWindow: { type: String, default: '17:00-19:30' },
      activeDays: {
        type: [String],
        default: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
      }
    },
    currentStatus: {
      state: {
        type: String,
        enum: Object.values(MEMBER_STATUS),
        default: MEMBER_STATUS.NORMAL
      },
      geofenceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Geofence',
        default: null
      },
      journeyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Journey',
        default: null
      },
      statusMessage: {
        type: String,
        default: 'Online'
      },
      batteryLevel: {
        type: Number,
        default: 100
      },
      isCharging: {
        type: Boolean,
        default: false
      },
      lastLocation: {
        latitude: Number,
        longitude: Number,
        accuracy: Number,
        updatedAt: Date
      },
      lastSeenAt: {
        type: Date,
        default: Date.now
      }
    }
  },
  {
    timestamps: true
  }
);

familyMembershipSchema.index({ familyId: 1, displayName: 1 });
familyMembershipSchema.index({ familyId: 1, userId: 1 });

module.exports = mongoose.model('FamilyMembership', familyMembershipSchema);
