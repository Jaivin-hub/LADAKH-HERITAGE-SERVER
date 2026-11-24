import dns from 'node:dns';
import mongoose from 'mongoose';
import { createHash } from 'node:crypto';
import { mkdir, copyFile, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import sharp from 'sharp';
import { Category, Product } from '../src/models.js';

// Curated sample only. Existing records are never overwritten on a repeat run.
const source = process.argv[2];
if (!source || !process.argv.includes('--apply')) throw new Error('Usage: node --env-file=.env scripts/import-folder-sample.mjs SOURCE_FOLDER --apply');
const entries = [
 ['vintage-silver-pendant-01.png', 'Pink Cluster Vintage Pendant', 'vintage-silver-pendants', 'An oval dark centre surrounded by pink and neutral-coloured accents, with a scrollwork bail.'],
 ['vintage-silver-pendant-02.png', 'Red Lattice Vintage Pendant', 'vintage-silver-pendants', 'A diamond-shaped lattice of red accents with purple teardrop details and a decorative bail.'],
 ['vintage-bracelet-1.png', 'Multicolour Panel Bracelet', 'vintage-bracelets', 'Three linked rectangular panels with open scrollwork and multicoloured accents.'],
 ['vintage-bracelet-2.png', 'Leaf Charm Bracelet', 'vintage-bracelets', 'A chain bracelet with translucent leaf-shaped drops, small leaf charms and pearl-like accents.'],
 ['vintage-silver-necklace-1.png', 'Fish Motif Vintage Necklace', 'vintage-silver-necklaces', 'An ornate fish-shaped centrepiece with patterned beads and layered chain detailing.'],
 ['vintage-silver-necklace-2.png', 'Figural Panel Vintage Necklace', 'vintage-silver-necklaces', 'A rectangular panel with repeating figures, paired with oval beads and a cord necklace.'],
 ['jewellery-01.png', 'Multicolour Drop Earrings', 'vintage-earrings', 'Open teardrop frames with green centre drops, pink accents and dark blue lower drops.'],
 ['jewellery-02.png', 'Dark Teardrop Vintage Earrings', 'vintage-earrings', 'Elongated earrings with oval links and dark teardrop centres in decorative open frames.'],
];
const cats = [
 ['silver-jewellery','Silver Jewellery',null,'vintage-silver-necklace-1.png','Explore our silver jewellery collections.'],
 ['vintage-silver-pendants','Vintage Silver Pendants','silver-jewellery','vintage-silver-pendant-01.png','Decorative vintage pendants in distinctive shapes and colours.'],
 ['vintage-bracelets','Vintage Bracelets','silver-jewellery','vintage-bracelet-1.png','Linked panels and delicate charm bracelets.'],
 ['vintage-silver-necklaces','Vintage Silver Necklaces','silver-jewellery','vintage-silver-necklace-1.png','Statement necklaces with detailed centrepieces.'],
 ['vintage-earrings','Vintage Earrings','silver-jewellery','jewellery-01.png','Decorative drop earrings from our vintage collection.'],
];
const uploads = fileURLToPath(new URL('../uploads/catalogue/', import.meta.url));
const paths = new Map();
// Validate all selected files before changing the database.
for (const [filename] of entries) {
 const bytes = await readFile(join(source, filename));
 const meta = await sharp(bytes).metadata();
 if (!meta.width || !meta.height || meta.format !== 'png') throw new Error(`Invalid product image: ${filename}`);
 const hash = createHash('sha256').update(bytes).digest('hex').slice(0,12);
 paths.set(filename, `/uploads/catalogue/${filename.replace('.png', '')}-${hash}.png`);
}
if (process.env.MONGODB_DNS_SERVERS) dns.setServers(process.env.MONGODB_DNS_SERVERS.split(',').map(s=>s.trim()));
try {
 await mongoose.connect(process.env.MONGODB_URI, {serverSelectionTimeoutMS:15000, family:4});
 if (mongoose.connection.name !== 'ladakh_heritage') throw new Error('Unexpected database; import cancelled.');
 await Promise.all([Category.init(), Product.init()]);
 await mkdir(uploads,{recursive:true});
 for (const [filename] of entries) {
  try { await copyFile(join(source,filename),join(uploads,paths.get(filename).split('/').pop()),constants.COPYFILE_EXCL); }
  catch(error) { if(error.code !== 'EEXIST') throw error; }
 }
 let addedCategories=0, addedProducts=0;
 for (const [i,[slug,title,parent,filename,text]] of cats.entries()) {
  const result = await Category.updateOne({slug},{$setOnInsert:{slug,title,parent,image:paths.get(filename),text,isActive:true,sortOrder:i}}, {upsert:true,runValidators:true});
  addedCategories += result.upsertedCount;
 }
 for (const [i,[filename,title,category,description]] of entries.entries()) {
  const image=paths.get(filename);
  // Match by image path as well as deterministic ID to make repeat imports safe.
  const id=new mongoose.Types.ObjectId(createHash('sha256').update(`ladakh-folder-import:${filename}`).digest('hex').slice(0,24));
  if (await Product.exists({$or:[{_id:id},{image}]})) continue;
  await Product.create({_id:id,title,category,image,images:[image],description,materials:'',origin:'Ladakh Heritage · Varkala',priceINR:null,badge:'',sortOrder:i,isActive:true});
  addedProducts++;
 }
 console.log(JSON.stringify({database:mongoose.connection.name,addedCategories,addedProducts,totalProducts:await Product.countDocuments(),importedImages:[...paths.values()]}));
} finally {await mongoose.disconnect();}
