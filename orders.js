const express = require('express');
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const { authenticateToken, requireArtisan } = require('../middleware/auth');
const { validateOrderCreation, validateObjectId, validatePagination } = require('../middleware/validation');

const router = express.Router();

// @route   POST /api/orders
// @desc    Create new order
// @access  Private
router.post('/', authenticateToken, validateOrderCreation, async (req, res) => {
  try {
    const { items, shippingAddress, billingAddress, payment } = req.body;
    const customerId = req.user._id;

    // Validate and calculate order totals
    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
      const product = await Product.findById(item.product).populate('artisan');
      
      if (!product || !product.isActive) {
        return res.status(400).json({
          success: false,
          message: `Product ${item.product} not found or inactive`
        });
      }

      if (!product.isAvailable(item.quantity)) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for ${product.title}`
        });
      }

      const itemPrice = product.discountedPrice;
      const itemTotal = itemPrice * item.quantity;
      subtotal += itemTotal;

      orderItems.push({
        product: product._id,
        artisan: product.artisan._id,
        quantity: item.quantity,
        price: itemPrice,
        customization: item.customization || {}
      });

      // Update product inventory
      if (product.inventory.trackInventory) {
        product.inventory.quantity -= item.quantity;
        product.stats.totalSold += item.quantity;
        await product.save();
      }
    }

    // Calculate shipping and tax
    const shippingCost = 0; // Calculate based on items and location
    const tax = subtotal * 0.18; // 18% GST
    const totalAmount = subtotal + shippingCost + tax;

    // Create order
    const order = new Order({
      customer: customerId,
      items: orderItems,
      shippingAddress,
      billingAddress: billingAddress || { ...shippingAddress, sameAsShipping: true },
      pricing: {
        subtotal,
        shippingCost,
        tax,
        totalAmount
      },
      payment: {
        method: payment.method,
        status: payment.method === 'cod' ? 'pending' : 'processing'
      }
    });

    await order.save();

    // Clear user's cart
    await User.findByIdAndUpdate(customerId, { cart: [] });

    // Populate order for response
    await order.populate([
      { path: 'items.product', select: 'title images category' },
      { path: 'items.artisan', select: 'businessName location' }
    ]);

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: { order }
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating order'
    });
  }
});

// @route   GET /api/orders/:id
// @desc    Get single order
// @access  Private
router.get('/:id', authenticateToken, validateObjectId('id'), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('items.product', 'title images category')
      .populate('items.artisan', 'businessName location')
      .populate('customer', 'name email');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if user has access to this order
    const isCustomer = order.customer._id.toString() === req.user._id.toString();
    const isArtisan = order.items.some(item => 
      item.artisan._id.toString() === req.user._id.toString()
    );
    const isAdmin = req.user.role === 'admin';

    if (!isCustomer && !isArtisan && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.json({
      success: true,
      data: { order }
    });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching order'
    });
  }
});

// @route   PUT /api/orders/:id/status
// @desc    Update order status (Artisan/Admin only)
// @access  Private/Artisan
router.put('/:id/status', authenticateToken, validateObjectId('id'), async (req, res) => {
  try {
    const { status, note } = req.body;
    const validStatuses = ['confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check permissions
    const isArtisan = order.items.some(item => 
      item.artisan.toString() === req.user._id.toString()
    );
    const isAdmin = req.user.role === 'admin';

    if (!isArtisan && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    order.status = status;
    if (note) {
      order.timeline.push({
        status,
        timestamp: new Date(),
        note,
        updatedBy: req.user._id
      });
    }

    if (status === 'delivered') {
      order.actualDelivery = new Date();
    }

    await order.save();

    res.json({
      success: true,
      message: 'Order status updated successfully',
      data: { order }
    });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating order status'
    });
  }
});

// @route   POST /api/orders/:id/cancel
// @desc    Cancel order
// @access  Private
router.post('/:id/cancel', authenticateToken, validateObjectId('id'), async (req, res) => {
  try {
    const { reason } = req.body;
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if user can cancel this order
    const isCustomer = order.customer.toString() === req.user._id.toString();
    if (!isCustomer && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    if (!order.canBeCancelled()) {
      return res.status(400).json({
        success: false,
        message: 'Order cannot be cancelled at this stage'
      });
    }

    order.status = 'cancelled';
    order.cancellation = {
      reason,
      cancelledBy: req.user._id,
      cancelledAt: new Date(),
      refundStatus: 'pending'
    };

    // Restore product inventory
    for (const item of order.items) {
      const product = await Product.findById(item.product);
      if (product && product.inventory.trackInventory) {
        product.inventory.quantity += item.quantity;
        product.stats.totalSold -= item.quantity;
        await product.save();
      }
    }

    await order.save();

    res.json({
      success: true,
      message: 'Order cancelled successfully',
      data: { order }
    });
  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while cancelling order'
    });
  }
});

// @route   GET /api/orders/artisan/dashboard
// @desc    Get artisan orders dashboard
// @access  Private/Artisan
router.get('/artisan/dashboard', authenticateToken, requireArtisan, async (req, res) => {
  try {
    const artisanId = req.user._id;

    // Get order statistics
    const stats = await Order.aggregate([
      { $match: { 'items.artisan': artisanId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$pricing.totalAmount' }
        }
      }
    ]);

    // Get recent orders
    const recentOrders = await Order.find({ 'items.artisan': artisanId })
      .populate('customer', 'name email')
      .populate('items.product', 'title images')
      .sort({ createdAt: -1 })
      .limit(10);

    res.json({
      success: true,
      data: {
        stats,
        recentOrders
      }
    });
  } catch (error) {
    console.error('Get artisan dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching dashboard data'
    });
  }
});

module.exports = router;
