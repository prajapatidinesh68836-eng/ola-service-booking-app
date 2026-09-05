const mongoose = require('mongoose');

const bookingLimitSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
    unique: true
  },
  totalBookings: {
    type: Number,
    default: 0
  },
  maxBookings: {
    type: Number,
    default: 10
  },
  isAvailable: {
    type: Boolean,
    default: true
  },
  nextAvailableDate: Date,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('BookingLimit', bookingLimitSchema);
