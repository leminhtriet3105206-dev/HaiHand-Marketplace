const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Post } = require('../models/Product');

async function checkCategories() {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
  const categories = await Post.distinct('category');
  console.log('Current distinct categories in DB:', categories);
  await mongoose.disconnect();
}

checkCategories().catch(console.error);

