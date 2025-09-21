const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Product title is required'],
    trim: true,
    maxlength: [100, 'Title cannot be more than 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Product description is required'],
    maxlength: [2000, 'Description cannot be more than 2000 characters']
  },
  shortDescription: {
    type: String,
    maxlength: [200, 'Short description cannot be more than 200 characters']
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: ['jewelry', 'textiles', 'pottery', 'woodwork', 'art', 'metalwork', 'leather', 'glass', 'other']
  },
  subcategory: {
    type: String,
    trim: true
  },
  artisan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Artisan',
    required: true
  },
  images: [{
    url: {
      type: String,
      required: true
    },
    alt: String,
    isPrimary: {
      type: Boolean,
      default: false
    }
  }],
  price: {
    amount: {
      type: Number,
      required: [true, 'Price is required'],
      min: [0, 'Price cannot be negative']
    },
    currency: {
      type: String,
      default: 'INR'
    },
    originalPrice: Number,
    discount: {
      type: Number,
      min: 0,
      max: 100
    }
  },
  inventory: {
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [0, 'Quantity cannot be negative']
    },
    lowStockThreshold: {
      type: Number,
      default: 5
    },
    trackInventory: {
      type: Boolean,
      default: true
    }
  },
  specifications: {
    dimensions: {
      length: Number,
      width: Number,
      height: Number,
      unit: {
        type: String,
        enum: ['cm', 'inch', 'm'],
        default: 'cm'
      }
    },
    weight: {
      value: Number,
      unit: {
        type: String,
        enum: ['g', 'kg', 'lb'],
        default: 'g'
      }
    },
    materials: [String],
    colors: [String],
    techniques: [String]
  },
  customization: {
    available: {
      type: Boolean,
      default: false
    },
    options: [{
      name: String,
      type: {
        type: String,
        enum: ['text', 'color', 'size', 'material']
      },
      values: [String],
      additionalCost: {
        type: Number,
        default: 0
      }
    }],
    leadTime: {
      type: Number, // in days
      default: 7
    }
  },
  shipping: {
    weight: Number,
    dimensions: {
      length: Number,
      width: Number,
      height: Number
    },
    freeShipping: {
      type: Boolean,
      default: false
    },
    shippingCost: {
      type: Number,
      default: 0
    },
    processingTime: {
      type: Number, // in days
      default: 1
    }
  },
  seo: {
    metaTitle: String,
    metaDescription: String,
    keywords: [String],
    slug: {
      type: String,
      unique: true
    }
  },
  story: {
    inspiration: String,
    process: String,
    culturalSignificance: String,
    artisanMessage: String
  },
  aiGenerated: {
    description: {
      type: Boolean,
      default: false
    },
    tags: {
      type: Boolean,
      default: false
    },
    pricing: {
      type: Boolean,
      default: false
    }
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
    views: {
      type: Number,
      default: 0
    },
    likes: {
      type: Number,
      default: 0
    },
    shares: {
      type: Number,
      default: 0
    },
    totalSold: {
      type: Number,
      default: 0
    }
  },
  tags: [String],
  isActive: {
    type: Boolean,
    default: true
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  isHandpicked: {
    type: Boolean,
    default: false
  },
  publishedAt: Date,
  lastModified: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for better query performance
productSchema.index({ category: 1, isActive: 1 });
productSchema.index({ artisan: 1, isActive: 1 });
productSchema.index({ 'price.amount': 1 });
productSchema.index({ 'rating.average': -1 });
productSchema.index({ tags: 1 });
productSchema.index({ isFeatured: 1, isActive: 1 });
productSchema.index({ title: 'text', description: 'text', tags: 'text' });

// Generate slug before saving
productSchema.pre('save', function(next) {
  if (this.isModified('title') && !this.seo.slug) {
    this.seo.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') + '-' + this._id.toString().slice(-6);
  }
  this.lastModified = new Date();
  next();
});

// Virtual for discounted price
productSchema.virtual('discountedPrice').get(function() {
  if (this.price.discount && this.price.discount > 0) {
    return this.price.amount * (1 - this.price.discount / 100);
  }
  return this.price.amount;
});

// Virtual for stock status
productSchema.virtual('stockStatus').get(function() {
  if (!this.inventory.trackInventory) return 'in-stock';
  if (this.inventory.quantity === 0) return 'out-of-stock';
  if (this.inventory.quantity <= this.inventory.lowStockThreshold) return 'low-stock';
  return 'in-stock';
});

// Method to update view count
productSchema.methods.incrementViews = function() {
  this.stats.views += 1;
  return this.save();
};

// Method to check if product is available
productSchema.methods.isAvailable = function(quantity = 1) {
  if (!this.isActive) return false;
  if (!this.inventory.trackInventory) return true;
  return this.inventory.quantity >= quantity;
};

module.exports = mongoose.model('Product', productSchema);
