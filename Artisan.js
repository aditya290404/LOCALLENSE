const mongoose = require('mongoose');

const artisanSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  businessName: {
    type: String,
    required: [true, 'Business name is required'],
    trim: true,
    maxlength: [100, 'Business name cannot be more than 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    maxlength: [1000, 'Description cannot be more than 1000 characters']
  },
  specialties: [{
    type: String,
    required: true
  }],
  experience: {
    type: Number,
    required: [true, 'Years of experience is required'],
    min: [0, 'Experience cannot be negative']
  },
  location: {
    city: {
      type: String,
      required: [true, 'City is required']
    },
    state: {
      type: String,
      required: [true, 'State is required']
    },
    country: {
      type: String,
      required: [true, 'Country is required']
    },
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  },
  portfolio: [{
    title: String,
    description: String,
    images: [String],
    category: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  socialMedia: {
    instagram: String,
    facebook: String,
    twitter: String,
    website: String
  },
  bankDetails: {
    accountHolderName: String,
    accountNumber: String,
    bankName: String,
    ifscCode: String,
    upiId: String
  },
  documents: {
    idProof: {
      type: String,
      required: [true, 'ID proof is required']
    },
    addressProof: String,
    businessLicense: String,
    taxId: String
  },
  rating: {
    average: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    count: {
      type: Number,
      default: 0
    }
  },
  stats: {
    totalProducts: {
      type: Number,
      default: 0
    },
    totalSales: {
      type: Number,
      default: 0
    },
    totalRevenue: {
      type: Number,
      default: 0
    },
    completedOrders: {
      type: Number,
      default: 0
    }
  },
  subscription: {
    plan: {
      type: String,
      enum: ['basic', 'premium', 'enterprise'],
      default: 'basic'
    },
    startDate: Date,
    endDate: Date,
    isActive: {
      type: Boolean,
      default: true
    }
  },
  verificationStatus: {
    type: String,
    enum: ['pending', 'verified', 'rejected'],
    default: 'pending'
  },
  verificationNotes: String,
  isActive: {
    type: Boolean,
    default: true
  },
  joinedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for better query performance
artisanSchema.index({ 'location.city': 1, 'location.state': 1 });
artisanSchema.index({ specialties: 1 });
artisanSchema.index({ 'rating.average': -1 });
artisanSchema.index({ verificationStatus: 1 });

// Virtual for full location
artisanSchema.virtual('fullLocation').get(function() {
  return `${this.location.city}, ${this.location.state}, ${this.location.country}`;
});

// Update stats when products or orders change
artisanSchema.methods.updateStats = async function() {
  const Product = mongoose.model('Product');
  const Order = mongoose.model('Order');
  
  const productCount = await Product.countDocuments({ artisan: this._id, isActive: true });
  const completedOrders = await Order.countDocuments({ 
    'items.product.artisan': this._id, 
    status: 'completed' 
  });
  
  const revenueResult = await Order.aggregate([
    { $match: { 'items.product.artisan': this._id, status: 'completed' } },
    { $group: { _id: null, total: { $sum: '$totalAmount' } } }
  ]);
  
  this.stats.totalProducts = productCount;
  this.stats.completedOrders = completedOrders;
  this.stats.totalRevenue = revenueResult.length > 0 ? revenueResult[0].total : 0;
  
  await this.save();
};

module.exports = mongoose.model('Artisan', artisanSchema);
