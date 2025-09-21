require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/locallense';

async function main() {
  try {
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    const Product = require('../models/Product');

    const result = await Product.updateMany({}, {
      $set: {
        'inventory.quantity': 100,
        'inventory.trackInventory': true,
        isActive: true,
      }
    });

    console.log(`Restocked products. Matched: ${result.matchedCount || result.n}, Modified: ${result.modifiedCount || result.nModified}`);
  } catch (err) {
    console.error('Restock failed:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

main();
