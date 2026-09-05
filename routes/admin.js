const express = require('express');
const jwt = require('jsonwebtoken');
const Booking = require('../models/Booking');
const User = require('../models/User');
const BookingLimit = require('../models/BookingLimit');
const router = express.Router();

// Middleware to verify admin token
const verifyAdminToken = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    const user = await User.findById(decoded.userId);
    
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    
    req.userId = decoded.userId;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

// Get all bookings
router.get('/bookings', verifyAdminToken, async (req, res) => {
  try {
    const { date, status, page = 1, limit = 10 } = req.query;
    
    let query = {};
    
    if (date) {
      const selectedDate = new Date(date);
      selectedDate.setHours(0, 0, 0, 0);
      query.bookingDate = {
        $gte: selectedDate,
        $lt: new Date(selectedDate.getTime() + 24 * 60 * 60 * 1000)
      };
    }
    
    if (status) {
      query.status = status;
    }
    
    const skip = (page - 1) * limit;
    const bookings = await Booking.find(query)
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ bookingDate: -1 });
    
    const total = await Booking.countDocuments(query);
    
    res.json({
      bookings,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get daily booking statistics
router.get('/stats/daily', verifyAdminToken, async (req, res) => {
  try {
    const { date } = req.query;
    const selectedDate = new Date(date || new Date());
    selectedDate.setHours(0, 0, 0, 0);

    const bookings = await Booking.find({
      bookingDate: {
        $gte: selectedDate,
        $lt: new Date(selectedDate.getTime() + 24 * 60 * 60 * 1000)
      }
    });

    const stats = {
      date: selectedDate.toISOString().split('T')[0],
      total: bookings.length,
      confirmed: bookings.filter(b => b.status === 'confirmed').length,
      pending: bookings.filter(b => b.status === 'pending').length,
      completed: bookings.filter(b => b.status === 'completed').length,
      cancelled: bookings.filter(b => b.status === 'cancelled').length,
      slotsAvailable: Math.max(0, 10 - bookings.filter(b => b.status !== 'cancelled').length),
      isFull: bookings.filter(b => b.status !== 'cancelled').length >= 10
    };

    res.json(stats);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update booking status
router.put('/bookings/:bookingId/status', verifyAdminToken, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'confirmed', 'completed', 'cancelled'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const booking = await Booking.findByIdAndUpdate(
      req.params.bookingId,
      { status, updatedAt: new Date() },
      { new: true }
    );

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    res.json({
      message: 'Booking status updated',
      booking
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Add notes to booking
router.put('/bookings/:bookingId/notes', verifyAdminToken, async (req, res) => {
  try {
    const { notes } = req.body;

    const booking = await Booking.findByIdAndUpdate(
      req.params.bookingId,
      { notes, updatedAt: new Date() },
      { new: true }
    );

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    res.json({
      message: 'Notes updated',
      booking
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get booking limit for a specific date
router.get('/booking-limits/:date', verifyAdminToken, async (req, res) => {
  try {
    const selectedDate = new Date(req.params.date);
    selectedDate.setHours(0, 0, 0, 0);

    let limit = await BookingLimit.findOne({ date: selectedDate });
    
    if (!limit) {
      limit = new BookingLimit({
        date: selectedDate,
        totalBookings: 0,
        maxBookings: 10,
        isAvailable: true
      });
      await limit.save();
    }

    res.json(limit);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update booking limit for a date
router.put('/booking-limits/:date', verifyAdminToken, async (req, res) => {
  try {
    const { maxBookings } = req.body;
    const selectedDate = new Date(req.params.date);
    selectedDate.setHours(0, 0, 0, 0);

    let limit = await BookingLimit.findOne({ date: selectedDate });
    
    if (!limit) {
      limit = new BookingLimit({
        date: selectedDate,
        maxBookings
      });
    } else {
      limit.maxBookings = maxBookings;
    }

    await limit.save();

    res.json({
      message: 'Booking limit updated',
      limit
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get all users
router.get('/users', verifyAdminToken, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const users = await User.find()
      .select('-password')
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await User.countDocuments();

    res.json({
      users,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get dashboard overview
router.get('/dashboard/overview', verifyAdminToken, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayBookings = await Booking.countDocuments({
      bookingDate: {
        $gte: today,
        $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
      },
      status: { $ne: 'cancelled' }
    });

    const totalBookings = await Booking.countDocuments();
    const totalUsers = await User.countDocuments();
    const completedBookings = await Booking.countDocuments({ status: 'completed' });

    res.json({
      todayBookings,
      totalBookings,
      totalUsers,
      completedBookings,
      availableSlotsToday: Math.max(0, 10 - todayBookings)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
