import express from "express";
import { adminRouter } from "./admin.js";
import cors from "cors";
import mongoose from "mongoose";
import { fileURLToPath } from "node:url";
import { Category, Product } from "./models.js";
import {
  parseFilters,
  productMatch,
  publicCategories,
  publicProduct,
} from "./catalogue.js";

export function createApp({
  origins,
  baseUrl,
  enableAdmin = false,
  uploads = fileURLToPath(new URL("../uploads/", import.meta.url)),
}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(
    cors({
      origin: (origin, done) => done(null, !origin || origins.includes(origin)),
      methods: ["GET", "HEAD", "OPTIONS", "POST", "PATCH", "DELETE"],
    }),
  );
  app.use(
    "/uploads",
    express.static(uploads, {
      dotfiles: "deny",
      index: false,
      maxAge: "1h",
      setHeaders: (res) => res.set("X-Content-Type-Options", "nosniff"),
    }),
  );
  app.get("/api/health", (_req, res) => {
    const ready = mongoose.connection.readyState === 1;
    res.status(ready ? 200 : 503).json({
      status: ready ? "ok" : "unavailable",
      database: ready ? "connected" : "disconnected",
    });
  });
  app.use("/api", (_req, res, next) =>
    mongoose.connection.readyState === 1
      ? next()
      : res.status(503).json({ error: "Catalogue temporarily unavailable" }),
  );
  app.use(
    "/api/admin",
    adminRouter({ enabled: enableAdmin, origins, baseUrl, uploads }),
  );
  const categories = async () =>
    publicCategories(
      await Category.find()
        .sort({ sortOrder: 1, title: 1, _id: 1 })
        .lean()
        .maxTimeMS(5000),
      baseUrl,
    );
  app.get("/api/categories", async (_req, res) =>
    res.json({ categories: await categories() }),
  );
  app.get("/api/products", async (req, res) => {
    let filters;
    try {
      filters = parseFilters(req.query);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    const visibleCategories = await categories();
    const match = productMatch(visibleCategories, filters);
    const total = await Product.countDocuments(match).maxTimeMS(5000);
    const totalPages = Math.max(1, Math.ceil(total / filters.limit));
    const page = Math.min(filters.page, totalPages);
    const sort =
      filters.sort === "name-az"
        ? { title: 1, _id: 1 }
        : filters.sort.startsWith("price-")
          ? {
              unpriced: 1,
              priceINR: filters.sort === "price-low" ? 1 : -1,
              _id: 1,
            }
          : { sortOrder: 1, _id: 1 };
    const rows = await Product.aggregate([
      { $match: match },
      {
        $addFields: {
          unpriced: {
            $cond: [{ $eq: [{ $ifNull: ["$priceINR", null] }, null] }, 1, 0],
          },
        },
      },
      { $sort: sort },
      { $skip: (page - 1) * filters.limit },
      { $limit: filters.limit },
    ])
      .collation({ locale: "en", strength: 2 })
      .option({ maxTimeMS: 5000 });
    res.json({
      products: rows.map((item) =>
        publicProduct(item, visibleCategories, baseUrl),
      ),
      pagination: { page, limit: filters.limit, total, totalPages },
    });
  });
  app.get("/api/products/:id", async (req, res) => {
    if (!mongoose.isObjectIdOrHexString(req.params.id))
      return res.status(400).json({ error: "Invalid product ID" });
    const visibleCategories = await categories();
    const item = await Product.findOne({
      _id: req.params.id,
      ...productMatch(visibleCategories, {}),
    })
      .lean()
      .maxTimeMS(5000);
    if (!item) return res.status(404).json({ error: "Product not found" });
    res.json({ product: publicProduct(item, visibleCategories, baseUrl) });
  });
  app.use((_req, res) => res.status(404).json({ error: "Route not found" }));
  app.use((_error, _req, res, _next) =>
    res.status(503).json({ error: "Catalogue temporarily unavailable" }),
  );
  return app;
}
