const mongoose = require('mongoose');

const familySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Family name is required'],
      trim: true,
      maxlength: [100, 'Family name cannot exceed 100 characters']
    },
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Family owner user ID is required'],
      index: true
    },
    settings: {
      locationRetentionDays: {
        type: Number,
        default: 30,
        min: 1,
        max: 365
      },
      journeyTimeoutMinutes: {
        type: Number,
        default: 120,
        min: 15,
        max: 720
      },
      staleLocationThresholdMinutes: {
        type: Number,
        default: 15,
        min: 5,
        max: 120
      },
      lowBatteryThresholdPercent: {
        type: Number,
        default: 15,
        min: 5,
        max: 50
      }
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Family', familySchema);
