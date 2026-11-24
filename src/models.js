import mongoose from "mongoose";
const { Schema } = mongoose;
const image = {
  type: String,
  trim: true,
  validate: (value) =>
    !value ||
    /^https?:\/\//.test(value) ||
    /^\/uploads\/[a-zA-Z0-9_./-]+$/.test(value),
};
const categorySchema = new Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    },
    title: { type: String, required: true, trim: true, unique: true },
    parent: { type: String, default: null },
    image,
    text: { type: String, default: "" },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, bufferCommands: false },
);
const productSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    category: { type: String, required: true, index: true },
    image: { ...image, required: true },
    images: [image],
    originalImage: image,
    description: { type: String, default: "" },
    materials: { type: String, default: "" },
    origin: { type: String, default: "Ladakh Heritage · Varkala" },
    priceINR: { type: Number, min: 0, default: null },
    badge: { type: String, default: "In the store" },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, bufferCommands: false },
);
productSchema.index({ isActive: 1, category: 1, sortOrder: 1, _id: 1 });
export const Category = mongoose.model("Category", categorySchema);
export const Product = mongoose.model("Product", productSchema);
