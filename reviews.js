const express = require('express');
const Review = require('../models/Review');
const Order = require('../models/Order');
const { authenticateToken } = require('../middleware/auth');
const { validateReviewCreation, validateObjectId, validatePagination } = require('../middleware/validation');

const router = express.Router();

// @route   POST /api/reviews
// @desc    Create new review
// @access  Private
router.post('/', authenticateToken, validateReviewCreation, async (req, res) => {
  try {
    const { productId, orderId, rating, title, comment, images, pros, cons, wouldRecommend } = req.body;
    const customerId = req.user._id;

    // Verify order and product
    const order = await Order.findOne({
      _id: orderId,
      customer: customerId,
      status: 'delivered',
      'items.product': productId
    }).populate('items.product items.artisan');

    if (!order) {
      return res.status(400).json({
        success: false,
        message: 'Order not found or not eligible for review'
      });
    }

    // Check if review already exists
    const existingReview = await Review.findOne({
      customer: customerId,
      product: productId,
      order: orderId
    });

    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: 'Review already exists for this product'
      });
    }

    // Get product and artisan from order
    const orderItem = order.items.find(item => item.product._id.toString() === productId);
    const artisanId = orderItem.artisan._id;

    const review = new Review({
      product: productId,
      artisan: artisanId,
      customer: customerId,
      order: orderId,
      rating,
      title,
      comment,
      images: images || [],
      pros: pros || [],
      cons: cons || [],
      wouldRecommend: wouldRecommend !== undefined ? wouldRecommend : true
    });

    await review.save();

    // Populate review for response
    await review.populate([
      { path: 'customer', select: 'name avatar' },
      { path: 'product', select: 'title images' }
    ]);

    res.status(201).json({
      success: true,
      message: 'Review created successfully',
      data: { review }
    });
  } catch (error) {
    console.error('Create review error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating review'
    });
  }
});

// @route   GET /api/reviews/product/:productId
// @desc    Get reviews for a product
// @access  Public
router.get('/product/:productId', validateObjectId('productId'), validatePagination, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const { sortBy = 'createdAt', sortOrder = 'desc', rating } = req.query;

    const filter = { 
      product: req.params.productId, 
      status: 'approved' 
    };

    if (rating) {
      filter['rating.overall'] = parseInt(rating);
    }

    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const reviews = await Review.find(filter)
      .populate('customer', 'name avatar')
      .sort(sort)
      .skip(skip)
      .limit(limit);

    const totalReviews = await Review.countDocuments(filter);
    const totalPages = Math.ceil(totalReviews / limit);

    // Get rating distribution
    const ratingStats = await Review.aggregate([
      { $match: { product: req.params.productId, status: 'approved' } },
      {
        $group: {
          _id: '$rating.overall',
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: -1 } }
    ]);

    res.json({
      success: true,
      data: {
        reviews,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems: totalReviews,
          hasNext: page < totalPages,
          hasPrev: page > 1
        },
        ratingStats
      }
    });
  } catch (error) {
    console.error('Get product reviews error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching reviews'
    });
  }
});

// @route   GET /api/reviews/artisan/:artisanId
// @desc    Get reviews for an artisan
// @access  Public
router.get('/artisan/:artisanId', validateObjectId('artisanId'), validatePagination, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const reviews = await Review.find({ 
      artisan: req.params.artisanId, 
      status: 'approved' 
    })
    .populate('customer', 'name avatar')
    .populate('product', 'title images')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

    const totalReviews = await Review.countDocuments({ 
      artisan: req.params.artisanId, 
      status: 'approved' 
    });
    const totalPages = Math.ceil(totalReviews / limit);

    res.json({
      success: true,
      data: {
        reviews,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems: totalReviews,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      }
    });
  } catch (error) {
    console.error('Get artisan reviews error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching reviews'
    });
  }
});

// @route   PUT /api/reviews/:id
// @desc    Update review
// @access  Private
router.put('/:id', authenticateToken, validateObjectId('id'), async (req, res) => {
  try {
    const review = await Review.findOne({
      _id: req.params.id,
      customer: req.user._id
    });

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found or access denied'
      });
    }

    const allowedUpdates = ['rating', 'title', 'comment', 'images', 'pros', 'cons', 'wouldRecommend'];
    const updates = {};
    
    Object.keys(req.body).forEach(key => {
      if (allowedUpdates.includes(key)) {
        updates[key] = req.body[key];
      }
    });

    Object.assign(review, updates);
    await review.save();

    await review.populate([
      { path: 'customer', select: 'name avatar' },
      { path: 'product', select: 'title images' }
    ]);

    res.json({
      success: true,
      message: 'Review updated successfully',
      data: { review }
    });
  } catch (error) {
    console.error('Update review error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating review'
    });
  }
});

// @route   DELETE /api/reviews/:id
// @desc    Delete review
// @access  Private
router.delete('/:id', authenticateToken, validateObjectId('id'), async (req, res) => {
  try {
    const review = await Review.findOne({
      _id: req.params.id,
      customer: req.user._id
    });

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found or access denied'
      });
    }

    await review.remove();

    res.json({
      success: true,
      message: 'Review deleted successfully'
    });
  } catch (error) {
    console.error('Delete review error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting review'
    });
  }
});

// @route   POST /api/reviews/:id/helpful
// @desc    Mark review as helpful
// @access  Private
router.post('/:id/helpful', authenticateToken, validateObjectId('id'), async (req, res) => {
  try {
    const { helpful = true } = req.body;
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    if (!review.canVote(req.user._id)) {
      return res.status(400).json({
        success: false,
        message: 'You have already voted on this review'
      });
    }

    await review.addVote(req.user._id, helpful);

    res.json({
      success: true,
      message: 'Vote recorded successfully',
      data: { helpfulVotes: review.helpfulVotes }
    });
  } catch (error) {
    console.error('Vote on review error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while voting on review'
    });
  }
});

// @route   POST /api/reviews/:id/respond
// @desc    Respond to review (Artisan only)
// @access  Private/Artisan
router.post('/:id/respond', authenticateToken, validateObjectId('id'), async (req, res) => {
  try {
    const { comment } = req.body;
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    // Check if user is the artisan for this review
    if (review.artisan.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    review.response = {
      comment,
      respondedAt: new Date(),
      respondedBy: req.user._id
    };

    await review.save();

    res.json({
      success: true,
      message: 'Response added successfully',
      data: { review }
    });
  } catch (error) {
    console.error('Respond to review error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while responding to review'
    });
  }
});

module.exports = router;
