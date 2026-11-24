import mongoose from 'mongoose';
import { createHash } from 'node:crypto';
import { mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Category, Product } from '../src/models.js';
const uri = process.env.MONGODB_URI;
if (!uri || !/^mongodb:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(uri)) throw new Error('Demo seeding is limited to local MongoDB.');
const categories = [
 ['demo-silver-jewellery', 'Demo Silver Jewellery', null, 'silver.png'],
 ['demo-pendants', 'Demo Pendants', 'demo-silver-jewellery', 'vintage-silver-pendants.png'],
 ['demo-bracelets', 'Demo Bracelets', 'demo-silver-jewellery', 'marcasite-silver-bracelets.png'],
 ['demo-gold-jewellery', 'Demo Gold Jewellery', null, 'gold.png'],
 ['demo-stones', 'Demo Precious Stones', null, 'stones.png'],
];
const products = [
 ['Turquoise Pendant', 'demo-pendants', 'vintage-silver-pendants.png', 2400, 'Silver-tone setting, turquoise-coloured detail'],
 ['Vintage Floral Pendant', 'demo-pendants', 'pendants.png', 3200, 'Decorative metalwork'],
 ['Classic Silver Pendant', 'demo-pendants', 'silver.png', 1800, 'Silver-tone metal'],
 ['Marcasite Link Bracelet', 'demo-bracelets', 'marcasite-silver-bracelets.png', 4500, 'Decorative silver-tone links'],
 ['Heritage Bracelet', 'demo-bracelets', 'marcasite-silver-bracelets.png', 3800, 'Vintage-style metalwork'],
 ['Silver Statement Necklace', 'demo-silver-jewellery', 'vintage-silver-necklaces.png', 6500, 'Silver-tone metal'],
 ['Gold Collection Necklace', 'demo-gold-jewellery', 'gold.png', 12500, 'Gold-tone sample'],
 ['Gold Collection Earrings', 'demo-gold-jewellery', 'gold.png', 7200, 'Gold-tone sample'],
 ['Colourful Stone Selection', 'demo-stones', 'stones.png', 950, 'Assorted decorative stones'],
 ['Collector Stone Set', 'demo-stones', 'stones.png', null, 'Assorted decorative stones'],
];
const uploads = fileURLToPath(new URL('../uploads/demo/', import.meta.url));
const source = fileURLToPath(new URL('../../ladakh-heritage-varkala/public/categories/', import.meta.url));
await mkdir(uploads, { recursive: true });
for (const filename of new Set([...categories.map((item) => item[3]), ...products.map((item) => item[2])])) await copyFile(source + filename, uploads + filename);
try {
 await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
 let addedCategories = 0, addedProducts = 0;
 for (const [index, [slug, title, parent, image]] of categories.entries()) {
  const result = await Category.updateOne({ slug }, { $setOnInsert: { slug, title, parent, image: `/uploads/demo/${image}`, text: 'Sample collection for testing the dynamic catalogue.', sortOrder: index + 100, isActive: true } }, { upsert: true, runValidators: true });
  addedCategories += result.upsertedCount;
 }
 for (const [index, [name, category, image, priceINR, materials]] of products.entries()) {
  const id = new mongoose.Types.ObjectId(createHash('sha256').update(`ladakh-local-demo-${name}`).digest('hex').slice(0, 24));
  const result = await Product.updateOne({ _id: id }, { $setOnInsert: { title: `Demo ${name}`, category, image: `/uploads/demo/${image}`, images: [`/uploads/demo/${image}`], priceINR, materials, description: 'Demo product for testing only. The collection image and price are illustrative, not a real item offered for sale.', origin: 'Local demo catalogue', badge: 'Demo · Not for sale', sortOrder: index + 100, isActive: true } }, { upsert: true, runValidators: true });
  addedProducts += result.upsertedCount;
 }
 console.log(JSON.stringify({ addedCategories, addedProducts, demoProducts: await Product.countDocuments({ category: { $in: categories.map((item) => item[0]) } }) }));
} finally { await mongoose.disconnect(); }
