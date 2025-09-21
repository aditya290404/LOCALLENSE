require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const User = require('./models/User');
const Artisan = require('./models/Artisan');
const Product = require('./models/Product');

function slugify(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

async function connect() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/locallense';
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected to MongoDB');
}

async function clearExisting() {
  // Optional: keep existing users; comment these if you don't want to wipe
  // await User.deleteMany({});
  // await Artisan.deleteMany({});
  // await Product.deleteMany({});
}

async function upsertDemoUser() {
  const email = 'demo@locallense.com';
  let user = await User.findOne({ email });
  if (!user) {
    user = await User.create({
      name: 'Demo User',
      email,
      password: 'DemoPass123',
      role: 'artisan',
      isEmailVerified: true,
    });
    console.log('Created demo user:', user.email);
  } else {
    // Ensure known password and role for demo
    user.password = 'DemoPass123';
    user.role = 'artisan';
    user.isEmailVerified = true;
    await user.save();
    console.log('Updated existing demo user password/role:', user.email);
  }
  return user;
}

async function upsertDemoArtisan(user) {
  let artisan = await Artisan.findOne({ user: user._id });
  if (!artisan) {
    artisan = await Artisan.create({
      user: user._id,
      businessName: 'Demo Handloom Studio',
      description: 'Traditional handloom crafts with natural dyes and sustainable materials.',
      specialties: ['weaving', 'handloom', 'natural dyes'],
      experience: 6,
      location: { city: 'Jaipur', state: 'Rajasthan', country: 'India' },
      socialMedia: { instagram: 'https://instagram.com/demo_studio' },
      documents: { idProof: 'https://picsum.photos/seed/idproof/600/400' },
      verificationStatus: 'verified'
    });
    console.log('Created demo artisan:', artisan.businessName);
  } else {
    artisan.verificationStatus = 'verified';
    if (!artisan.documents || !artisan.documents.idProof) {
      artisan.documents = { ...(artisan.documents || {}), idProof: 'https://picsum.photos/seed/idproof/600/400' };
    }
    await artisan.save();
    console.log('Verified existing artisan:', artisan.businessName);
  }
  return artisan;
}

function sampleProducts(artisanId) {
  const nowSuffix = '-' + Date.now();
  return [
    {
      title: 'Handwoven Silk Scarf',
      shortDescription: 'Luxurious handwoven silk scarf with traditional patterns',
      description: 'Beautiful handwoven silk scarf made using traditional techniques and natural dyes.',
      category: 'textiles',
      images: [{ url: 'https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=600&h=400&fit=crop', isPrimary: true }],
      price: { amount: 2500, currency: 'INR' },
      inventory: { trackInventory: true, quantity: 25 },
      artisan: artisanId,
      seo: { slug: slugify('Handwoven Silk Scarf') + nowSuffix },
      isFeatured: true
    },
    {
      title: 'Ceramic Pottery Set',
      shortDescription: 'Traditional pottery set with modern design',
      description: 'Handcrafted ceramic pottery set perfect for home decor.',
      category: 'pottery',
      images: [{ url: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=600&h=400&fit=crop', isPrimary: true }],
      price: { amount: 1800, currency: 'INR' },
      inventory: { trackInventory: true, quantity: 15 },
      artisan: artisanId,
      seo: { slug: slugify('Ceramic Pottery Set') + nowSuffix },
      isFeatured: false
    },
    {
      title: 'Silver Jewelry Set',
      shortDescription: 'Exquisite handcrafted silver jewelry',
      description: 'Intricately designed silver jewelry set made by skilled artisans.',
      category: 'jewelry',
      images: [{ url: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=600&h=400&fit=crop', isPrimary: true }],
      price: { amount: 4500, currency: 'INR' },
      inventory: { trackInventory: true, quantity: 10 },
      artisan: artisanId,
      seo: { slug: slugify('Silver Jewelry Set') + nowSuffix },
      isFeatured: true
    }
  ];
}

async function upsertProducts(artisan) {
  const existing = await Product.find({ artisan: artisan._id });
  if (existing.length >= 3) {
    console.log('Products already exist for artisan, skipping seeding. Count:', existing.length);
    return existing;
  }
  const samples = sampleProducts(artisan._id);
  const inserted = await Product.insertMany(samples);
  console.log('Inserted products:', inserted.map(p => p.title));
  return inserted;
}

async function main() {
  try {
    await connect();
    await clearExisting();
    const user = await upsertDemoUser();
    const artisan = await upsertDemoArtisan(user);
    await upsertProducts(artisan);
  } catch (err) {
    console.error('Seed error:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected. Seeding done.');
    process.exit(0);
  }
}

main();
