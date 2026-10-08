const mongoose = require('mongoose');

const pairingTokenSchema = new mongoose.Schema(
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
    token: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 } // Automatically removed by MongoDB after expiration
    },
    used: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('PairingToken', pairingTokenSchema);
