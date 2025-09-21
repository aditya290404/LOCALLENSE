const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
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
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  rating: {
    overall: {
      type: Number,
      required: true,
      min: 1,
      max: 5
    },
    quality: {
      type: Number,
      min: 1,
      max: 5
    },
    craftsmanship: {
      type: Number,
      min: 1,
      max: 5
    },
    packaging: {
      type: Number,
      min: 1,
      max: 5
    },
    shipping: {
      type: Number,
      min: 1,
      max: 5
    }
  },
  title: {
    type: String,
    trim: true,
    maxlength: [100, 'Review title cannot be more than 100 characters']
  },
  comment: {
    type: String,
    required: [true, 'Review comment is required'],
    maxlength: [1000, 'Review comment cannot be more than 1000 characters']
  },
  images: [{
    url: String,
    alt: String
  }],
  pros: [String],
  cons: [String],
  wouldRecommend: {
    type: Boolean,
    default: true
  },
  isVerifiedPurchase: {
    type: Boolean,
    default: true
  },
  helpfulVotes: {
    type: Number,
    default: 0
  },
  votedBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    helpful: Boolean,
    votedAt: {
      type: Date,
      default: Date.now
    }
  }],
  response: {
    comment: String,
    respondedAt: Date,
    respondedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'flagged'],
    default: 'approved'
  },
  moderationNotes: String,
  isAnonymous: {
    type: Boolean,
    default: false
  },
  reportedBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reason: String,
    reportedAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Indexes for better query performance
reviewSchema.index({ product: 1, status: 1, createdAt: -1 });
reviewSchema.index({ artisan: 1, status: 1, createdAt: -1 });
reviewSchema.index({ customer: 1, createdAt: -1 });
reviewSchema.index({ 'rating.overall': -1 });
reviewSchema.index({ isVerifiedPurchase: 1 });

// Ensure one review per customer per product per order
reviewSchema.index({ customer: 1, product: 1, order: 1 }, { unique: true });

// Update product and artisan ratings after review save/update
reviewSchema.post('save', async function() {
  await updateProductRating(this.product);
  await updateArtisanRating(this.artisan);
});

reviewSchema.post('remove', async function() {
  await updateProductRating(this.product);
  await updateArtisanRating(this.artisan);
});

// Helper function to update product rating
async function updateProductRating(productId) {
  const Product = mongoose.model('Product');
  const Review = mongoose.model('Review');
  
  const stats = await Review.aggregate([
    { $match: { product: productId, status: 'approved' } },
    {
      $group: {
        _id: null,
        averageRating: { $avg: '$rating.overall' },
        totalReviews: { $sum: 1 }
      }
    }
  ]);
  
  const rating = stats.length > 0 ? {
    average: Math.round(stats[0].averageRating * 10) / 10,
    count: stats[0].totalReviews
  } : { average: 0, count: 0 };
  
  await Product.findByIdAndUpdate(productId, { rating });
}

// Helper function to update artisan rating
async function updateArtisanRating(artisanId) {
  const Artisan = mongoose.model('Artisan');
  const Review = mongoose.model('Review');
  
  const stats = await Review.aggregate([
    { $match: { artisan: artisanId, status: 'approved' } },
    {
      $group: {
        _id: null,
        averageRating: { $avg: '$rating.overall' },
        totalReviews: { $sum: 1 }
      }
    }
  ]);
  
  const rating = stats.length > 0 ? {
    average: Math.round(stats[0].averageRating * 10) / 10,
    count: stats[0].totalReviews
  } : { average: 0, count: 0 };
  
  await Artisan.findByIdAndUpdate(artisanId, { rating });
}

// Method to check if user can vote on this review
reviewSchema.methods.canVote = function(userId) {
  return !this.votedBy.some(vote => vote.user.toString() === userId.toString());
};

// Method to add helpful vote
reviewSchema.methods.addVote = function(userId, helpful) {
  if (this.canVote(userId)) {
    this.votedBy.push({ user: userId, helpful });
    if (helpful) {
      this.helpfulVotes += 1;
    }
    return this.save();
  }
  throw new Error('User has already voted on this review');
};

module.exports = mongoose.model('Review', reviewSchema);
