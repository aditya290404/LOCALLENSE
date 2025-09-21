const express = require('express');
const Artisan = require('../models/Artisan');
const Product = require('../models/Product');
const { authenticateToken, requireArtisan, requireAdmin } = require('../middleware/auth');
const { validateObjectId, validatePagination } = require('../middleware/validation');

const router = express.Router();

// @route   GET /api/artisans
// @desc    Get all artisans
// @access  Public
router.get('/', validatePagination, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const skip = (page - 1) * limit;

    const { location, specialty, search, verified } = req.query;
    
    const filter = { isActive: true };
    if (verified === 'true') filter.verificationStatus = 'verified';
    if (location) {
      filter.$or = [
        { 'location.city': { $regex: location, $options: 'i' } },
        { 'location.state': { $regex: location, $options: 'i' } }
      ];
    }
    if (specialty) filter.specialties = { $in: [specialty] };
    if (search) {
      filter.$or = [
        { businessName: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const artisans = await Artisan.find(filter)
      .populate('user', 'name avatar')
      .sort({ 'rating.average': -1, createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalArtisans = await Artisan.countDocuments(filter);
    const totalPages = Math.ceil(totalArtisans / limit);

    res.json({
      success: true,
      data: {
        artisans,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems: totalArtisans,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      }
    });
  } catch (error) {
    console.error('Get artisans error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching artisans'
    });
  }
});

// @route   GET /api/artisans/:id
// @desc    Get single artisan
// @access  Public
router.get('/:id', validateObjectId('id'), async (req, res) => {
  try {
    const artisan = await Artisan.findById(req.params.id)
      .populate('user', 'name avatar createdAt');

    if (!artisan || !artisan.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Artisan not found'
      });
    }

    // Get recent products
    const recentProducts = await Product.find({ 
      artisan: artisan._id, 
      isActive: true 
    })
    .sort({ createdAt: -1 })
    .limit(6)
    .select('title images price category rating');

    res.json({
      success: true,
      data: {
        artisan,
        recentProducts
      }
    });
  } catch (error) {
    console.error('Get artisan error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching artisan'
    });
  }
});

// @route   PUT /api/artisans/profile
// @desc    Update artisan profile
// @access  Private/Artisan
router.put('/profile', authenticateToken, requireArtisan, async (req, res) => {
  try {
    const artisan = await Artisan.findOne({ user: req.user._id });
    if (!artisan) {
      return res.status(404).json({
        success: false,
        message: 'Artisan profile not found'
      });
    }

    const allowedUpdates = [
      'businessName', 'description', 'specialties', 'experience',
      'location', 'portfolio', 'socialMedia', 'bankDetails'
    ];

    const updates = {};
    Object.keys(req.body).forEach(key => {
      if (allowedUpdates.includes(key)) {
        updates[key] = req.body[key];
      }
    });

    Object.assign(artisan, updates);
    await artisan.save();

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: { artisan }
    });
  } catch (error) {
    console.error('Update artisan profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating profile'
    });
  }
});

module.exports = router;
