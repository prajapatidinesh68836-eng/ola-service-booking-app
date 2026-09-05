const express = require('express');
const jwt = require('jsonwebtoken');
const Booking = require('../models/Booking');
const BookingLimit = require('../models/BookingLimit');
const router = express.Router();

// Middleware to verify token
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    req.userId = decoded.userId;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

// Check available dates and booking count
router.get('/available-dates', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dates = [];
    const maxDays = 30;

    for (let i = 0; i < maxDays; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);

      const bookingLimit = await BookingLimit.findOne({ date });
      const bookingCount = await Booking.countDocuments({
        bookingDate: {
          $gte: new Date(date),
          $lt: new Date(date.getTime() + 24 * 60 * 60 * 1000)
        },
        status: { $ne: 'cancelled' }
      });

      const isAvailable = bookingCount < 10;

      dates.push({
        date: date.toISOString().split('T')[0],
        bookingCount,
        maxBookings: 10,
        available: isAvailable
      });
    }

    res.json(dates);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create a new booking
router.post('/create', verifyToken, async (req, res) => {
  try {
    const { userName, userPhone, userEmail, scooterModel, scooterNumber, serviceType, description, bookingDate, timeSlot } = req.body;

    // Check if date is valid
    const selectedDate = new Date(bookingDate);
    selectedDate.setHours(0, 0, 0, 0);

    // Count bookings for the selected date
    const bookingCount = await Booking.countDocuments({
      bookingDate: {
        $gte: selectedDate,
        $lt: new Date(selectedDate.getTime() + 24 * 60 * 60 * 1000)
      },
      status: { $ne: 'cancelled' }
    });

    if (bookingCount >= 10) {
      return res.status(400).json({ 
        message: 'Bookings for this date are full. Please select another date.',
        nextAvailable: new Date(selectedDate.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      });
    }

    // Create booking
    const booking = new Booking({
      userId: req.userId,
      userName,
      userPhone,
      userEmail,
      scooterModel,
      scooterNumber,
      serviceType,
      description,
      bookingDate: selectedDate,
      timeSlot,
      status: 'confirmed'
    });

    await booking.save();

    // Update booking limit
    let limit = await BookingLimit.findOne({ date: selectedDate });
    if (!limit) {
      limit = new BookingLimit({
        date: selectedDate,
        totalBookings: 1
      });
    } else {
      limit.totalBookings += 1;
      limit.isAvailable = limit.totalBookings < limit.maxBookings;
    }
    await limit.save();

    res.status(201).json({
      message: 'Booking created successfully',
      booking
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get user's bookings
router.get('/my-bookings', verifyToken, async (req, res) => {
  try {
    const bookings = await Booking.find({ userId: req.userId }).sort({ bookingDate: -1 });
    res.json(bookings);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Cancel a booking
router.put('/cancel/:bookingId', verifyToken, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId);

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    if (booking.userId.toString() !== req.userId) {
      return res.status(403).json({ message: 'Not authorized to cancel this booking' });
    }

    booking.status = 'cancelled';
    await booking.save();

    res.json({
      message: 'Booking cancelled successfully',
      booking
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get booking details
router.get('/:bookingId', verifyToken, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId);

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    res.json(booking);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
