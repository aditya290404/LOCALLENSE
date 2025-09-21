const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    unique: true,
    required: true
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  items: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    artisan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Artisan',
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    price: {
      type: Number,
      required: true
    },
    customization: {
      options: [{
        name: String,
        value: String,
        additionalCost: {
          type: Number,
          default: 0
        }
      }],
      instructions: String
    },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'in-production', 'ready', 'shipped', 'delivered', 'cancelled'],
      default: 'pending'
    },
    tracking: {
      carrier: String,
      trackingNumber: String,
      estimatedDelivery: Date,
      actualDelivery: Date
    }
  }],
  shippingAddress: {
    name: {
      type: String,
      required: true
    },
    phone: {
      type: String,
      required: true
    },
    street: {
      type: String,
      required: true
    },
    city: {
      type: String,
      required: true
    },
    state: {
      type: String,
      required: true
    },
    zipCode: {
      type: String,
      required: true
    },
    country: {
      type: String,
      required: true
    },
    landmark: String
  },
  billingAddress: {
    name: String,
    phone: String,
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String,
    sameAsShipping: {
      type: Boolean,
      default: true
    }
  },
  pricing: {
    subtotal: {
      type: Number,
      required: true
    },
    shippingCost: {
      type: Number,
      default: 0
    },
    tax: {
      type: Number,
      default: 0
    },
    discount: {
      amount: {
        type: Number,
        default: 0
      },
      code: String,
      type: {
        type: String,
        enum: ['percentage', 'fixed']
      }
    },
    totalAmount: {
      type: Number,
      required: true
    }
  },
  payment: {
    method: {
      type: String,
      enum: ['card', 'upi', 'netbanking', 'wallet', 'cod'],
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', 'refunded'],
      default: 'pending'
    },
    transactionId: String,
    paymentGateway: String,
    paidAt: Date,
    refundAmount: {
      type: Number,
      default: 0
    },
    refundReason: String,
    refundedAt: Date
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'],
    default: 'pending'
  },
  timeline: [{
    status: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    note: String,
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  notes: {
    customer: String,
    internal: String
  },
  estimatedDelivery: Date,
  actualDelivery: Date,
  cancellation: {
    reason: String,
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    cancelledAt: Date,
    refundStatus: {
      type: String,
      enum: ['pending', 'processed', 'failed']
    }
  },
  return: {
    requested: {
      type: Boolean,
      default: false
    },
    reason: String,
    status: {
      type: String,
      enum: ['requested', 'approved', 'rejected', 'completed']
    },
    requestedAt: Date,
    approvedAt: Date
  }
}, {
  timestamps: true
});

// Indexes for better query performance
orderSchema.index({ customer: 1, createdAt: -1 });
orderSchema.index({ orderNumber: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ 'items.artisan': 1, createdAt: -1 });
orderSchema.index({ 'payment.status': 1 });

// Generate order number before saving
orderSchema.pre('save', function(next) {
  if (!this.orderNumber) {
    const timestamp = Date.now().toString();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    this.orderNumber = `LL${timestamp.slice(-6)}${random}`;
  }
  next();
});

// Add status to timeline when status changes
orderSchema.pre('save', function(next) {
  if (this.isModified('status') && !this.isNew) {
    this.timeline.push({
      status: this.status,
      timestamp: new Date(),
      note: `Order status changed to ${this.status}`
    });
  }
  next();
});

// Virtual for order total items count
orderSchema.virtual('totalItems').get(function() {
  return this.items.reduce((total, item) => total + item.quantity, 0);
});

// Method to check if order can be cancelled
orderSchema.methods.canBeCancelled = function() {
  return ['pending', 'confirmed'].includes(this.status);
};

// Method to check if order can be returned
orderSchema.methods.canBeReturned = function() {
  if (this.status !== 'delivered') return false;
  const deliveryDate = this.actualDelivery || this.createdAt;
  const daysSinceDelivery = (Date.now() - deliveryDate.getTime()) / (1000 * 60 * 60 * 24);
  return daysSinceDelivery <= 7; // 7 days return policy
};

// Method to calculate refund amount
orderSchema.methods.calculateRefundAmount = function() {
  if (this.payment.status !== 'completed') return 0;
  
  let refundAmount = this.pricing.totalAmount;
  
  // Deduct shipping cost if order is shipped
  if (['shipped', 'delivered'].includes(this.status)) {
    refundAmount -= this.pricing.shippingCost;
  }
  
  return Math.max(0, refundAmount);
};

module.exports = mongoose.model('Order', orderSchema);
