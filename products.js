const express = require('express');
const Product = require('../models/Product');
const Artisan = require('../models/Artisan');
const { authenticateToken, requireArtisan, optionalAuth } = require('../middleware/auth');
const { validateProductCreation, validateObjectId, validatePagination } = require('../middleware/validation');

const router = express.Router();

// @route   GET /api/products
// @desc    Get all products with filtering and pagination
// @access  Public
router.get('/', optionalAuth, validatePagination, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const skip = (page - 1) * limit;

    const {
      category,
      search,
      minPrice,
      maxPrice,
      artisan,
      location,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      featured,
      inStock
    } = req.query;

    // Build filter
    const filter = { isActive: true };
    
    if (category && category !== 'all') {
      filter.category = category;
    }
    
    if (search) {
      filter.$text = { $search: search };
    }
    
    if (minPrice || maxPrice) {
      filter['price.amount'] = {};
      if (minPrice) filter['price.amount'].$gte = parseFloat(minPrice);
      if (maxPrice) filter['price.amount'].$lte = parseFloat(maxPrice);
    }
    
    if (artisan) {
      filter.artisan = artisan;
    }
    
    if (featured === 'true') {
      filter.isFeatured = true;
    }
    
    if (inStock === 'true') {
      filter['inventory.quantity'] = { $gt: 0 };
    }

    // Build sort
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Add location filter if specified
    let locationFilter = {};
    if (location) {
      locationFilter = {
        'artisan.location.city': { $regex: location, $options: 'i' }
      };
    }

    const aggregationPipeline = [
      {
        $lookup: {
          from: 'artisans',
          localField: 'artisan',
          foreignField: '_id',
          as: 'artisan'
        }
      },
      {
        $unwind: '$artisan'
      },
      {
        $match: { ...filter, ...locationFilter }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'artisan.user',
          foreignField: '_id',
          as: 'artisan.user'
        }
      },
      {
        $unwind: '$artisan.user'
      },
      {
        $project: {
          title: 1,
          shortDescription: 1,
          category: 1,
          images: 1,
          price: 1,
          rating: 1,
          stats: 1,
          tags: 1,
          isFeatured: 1,
          createdAt: 1,
          'artisan._id': 1,
          'artisan.businessName': 1,
          'artisan.location': 1,
          'artisan.rating': 1,
          'artisan.user.name': 1,
          inventory: 1
        }
      },
      {
        $sort: sort
      },
      {
        $facet: {
          products: [
            { $skip: skip },
            { $limit: limit }
          ],
          totalCount: [
            { $count: 'count' }
          ]
        }
      }
    ];

    const result = await Product.aggregate(aggregationPipeline);
    const products = result[0].products;
    const totalProducts = result[0].totalCount[0]?.count || 0;
    const totalPages = Math.ceil(totalProducts / limit);

    res.json({
      success: true,
      data: {
        products,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems: totalProducts,
          hasNext: page < totalPages,
          hasPrev: page > 1
        },
        filters: {
          categories: await Product.distinct('category', { isActive: true }),
          priceRange: await Product.aggregate([
            { $match: { isActive: true } },
            {
              $group: {
                _id: null,
                minPrice: { $min: '$price.amount' },
                maxPrice: { $max: '$price.amount' }
              }
            }
          ])
        }
      }
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching products'
    });
  }
});

// @route   GET /api/products/featured
// @desc    Get featured products
// @access  Public
router.get('/featured', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 8;

    const products = await Product.find({ 
      isActive: true, 
      isFeatured: true 
    })
    .populate('artisan', 'businessName location rating')
    .sort({ 'rating.average': -1, createdAt: -1 })
    .limit(limit)
    .select('title images price category rating stats artisan');

    res.json({
      success: true,
      data: { products }
    });
  } catch (error) {
    console.error('Get featured products error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching featured products'
    });
  }
});

// @route   GET /api/products/trending
// @desc    Get trending products
// @access  Public
router.get('/trending', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 8;

    const products = await Product.find({ isActive: true })
      .populate('artisan', 'businessName location rating')
      .sort({ 'stats.views': -1, 'stats.totalSold': -1 })
      .limit(limit)
      .select('title images price category rating stats artisan');

    res.json({
      success: true,
      data: { products }
    });
  } catch (error) {
    console.error('Get trending products error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching trending products'
    });
  }
});

// @route   GET /api/products/:id
// @desc    Get single product
// @access  Public
router.get('/:id', optionalAuth, validateObjectId('id'), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate({
        path: 'artisan',
        populate: {
          path: 'user',
          select: 'name avatar'
        }
      });

    if (!product || !product.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Increment view count
    await product.incrementViews();

    // Get related products
    const relatedProducts = await Product.find({
      _id: { $ne: product._id },
      category: product.category,
      isActive: true
    })
    .populate('artisan', 'businessName location')
    .limit(4)
    .select('title images price category rating');

    // Check if user has this in wishlist
    let isInWishlist = false;
    if (req.user) {
      isInWishlist = req.user.wishlist.includes(product._id);
    }

    res.json({
      success: true,
      data: {
        product,
        relatedProducts,
        isInWishlist
      }
    });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching product'
    });
  }
});

// @route   POST /api/products
// @desc    Create new product (Artisan only)
// @access  Private/Artisan
router.post('/', authenticateToken, requireArtisan, validateProductCreation, async (req, res) => {
  try {
    // Get artisan profile
    const artisan = await Artisan.findOne({ user: req.user._id });
    if (!artisan) {
      return res.status(404).json({
        success: false,
        message: 'Artisan profile not found'
      });
    }

    if (artisan.verificationStatus !== 'verified') {
      return res.status(403).json({
        success: false,
        message: 'Artisan account must be verified to create products'
      });
    }

    const productData = {
      ...req.body,
      artisan: artisan._id
    };

    const product = new Product(productData);
    await product.save();

    // Update artisan stats
    await artisan.updateStats();

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: { product }
    });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating product'
    });
  }
});

// @route   PUT /api/products/:id
// @desc    Update product (Artisan only - own products)
// @access  Private/Artisan
router.put('/:id', authenticateToken, requireArtisan, validateObjectId('id'), async (req, res) => {
  try {
    const artisan = await Artisan.findOne({ user: req.user._id });
    if (!artisan) {
      return res.status(404).json({
        success: false,
        message: 'Artisan profile not found'
      });
    }

    const product = await Product.findOne({ 
      _id: req.params.id, 
      artisan: artisan._id 
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found or access denied'
      });
    }

    // Update allowed fields
    const allowedUpdates = [
      'title', 'description', 'shortDescription', 'category', 'subcategory',
      'images', 'price', 'inventory', 'specifications', 'customization',
      'shipping', 'story', 'tags', 'isActive'
    ];

    const updates = {};
    Object.keys(req.body).forEach(key => {
      if (allowedUpdates.includes(key)) {
        updates[key] = req.body[key];
      }
    });

    Object.assign(product, updates);
    await product.save();

    res.json({
      success: true,
      message: 'Product updated successfully',
      data: { product }
    });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating product'
    });
  }
});

// @route   DELETE /api/products/:id
// @desc    Delete product (Artisan only - own products)
// @access  Private/Artisan
router.delete('/:id', authenticateToken, requireArtisan, validateObjectId('id'), async (req, res) => {
  try {
    const artisan = await Artisan.findOne({ user: req.user._id });
    if (!artisan) {
      return res.status(404).json({
        success: false,
        message: 'Artisan profile not found'
      });
    }

    const product = await Product.findOne({ 
      _id: req.params.id, 
      artisan: artisan._id 
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found or access denied'
      });
    }

    // Soft delete - just mark as inactive
    product.isActive = false;
    await product.save();

    // Update artisan stats
    await artisan.updateStats();

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting product'
    });
  }
});

// @route   GET /api/products/artisan/:artisanId
// @desc    Get products by artisan
// @access  Public
router.get('/artisan/:artisanId', validateObjectId('artisanId'), validatePagination, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const skip = (page - 1) * limit;

    const products = await Product.find({ 
      artisan: req.params.artisanId, 
      isActive: true 
    })
    .populate('artisan', 'businessName location rating')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

    const totalProducts = await Product.countDocuments({ 
      artisan: req.params.artisanId, 
      isActive: true 
    });
    const totalPages = Math.ceil(totalProducts / limit);

    res.json({
      success: true,
      data: {
        products,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems: totalProducts,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      }
    });
  } catch (error) {
    console.error('Get artisan products error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching artisan products'
    });
  }
});

// @route   POST /api/products/:id/like
// @desc    Like/unlike a product
// @access  Private
router.post('/:id/like', authenticateToken, validateObjectId('id'), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // For simplicity, just increment likes (in a real app, you'd track user likes)
    product.stats.likes += 1;
    await product.save();

    res.json({
      success: true,
      message: 'Product liked',
      data: { likes: product.stats.likes }
    });
  } catch (error) {
    console.error('Like product error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while liking product'
    });
  }
});

module.exports = router;
