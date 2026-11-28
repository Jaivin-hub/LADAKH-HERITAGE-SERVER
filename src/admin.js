import { receiveImages, saveImages } from "./uploads.js";
import { isObjectIdOrHexString } from "mongoose";
import { Router, json } from "express";
import { Category, Product } from "./models.js";
import { imageUrl } from "./catalogue.js";

export function adminRouter({
  enabled,
  allowRemote = false,
  origins,
  baseUrl,
  uploads,
}) {
  const router = Router();
  // Explicit deployment opt-in until authenticated admin roles are implemented.
  // Origin validation is not authentication; non-browser clients can forge Origin.
  router.use((req, res, next) => {
    const local = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
      req.socket.remoteAddress,
    );
    const origin = req.get("origin");
    const localOrigin =
      origin &&
      origins.includes(origin) &&
      /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    const allowedOrigin = allowRemote
      ? Boolean(origin && origins.includes(origin))
      : localOrigin;
    if (!enabled || (!allowRemote && !local) || (origin && !allowedOrigin))
      return res.status(403).json({
        error:
          "Admin access is disabled or this website origin is not allowed.",
      });
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      (!allowedOrigin ||
        !(req.method === "POST" && req.path === "/uploads"
          ? req.is("multipart/form-data")
          : req.is("application/json")))
    )
      return res
        .status(403)
        .json({ error: "Use an allowed admin portal to save changes." });
    next();
  });
  router.use(json({ limit: "100kb" }));
  router.post("/uploads", receiveImages, saveImages({ uploads, baseUrl }));
  const serialize = (item) => ({
    ...item,
    id: String(item._id),
    image: imageUrl(item.image, baseUrl),
  });
  router.get("/catalogue", async (_req, res) => {
    const [products, categories] = await Promise.all([
      Product.find().sort({ createdAt: -1, _id: -1 }).lean().maxTimeMS(5000),
      Category.find().sort({ sortOrder: 1, title: 1 }).lean().maxTimeMS(5000),
    ]);
    res.json({
      products: products.map(serialize),
      categories: categories.map(serialize),
    });
  });
  const loadRecord = async (id, Model) => {
    if (!isObjectIdOrHexString(id))
      throw Object.assign(new Error("Invalid record ID."), { status: 400 });
    const record = await Model.findById(id);
    if (!record)
      throw Object.assign(new Error("This item no longer exists."), {
        status: 404,
      });
    return record;
  };
  const text = (body, key, max = 500, required = false) => {
    if (body[key] == null && !required) return "";
    if (
      typeof body[key] !== "string" ||
      body[key].length > max ||
      (required && !body[key].trim())
    )
      throw new Error(`Please provide a valid ${key}.`);
    return body[key].trim();
  };
  const common = (body) => {
    if (body.isActive !== undefined && typeof body.isActive !== "boolean")
      throw new Error("Invalid publication status.");
    if (
      body.sortOrder !== undefined &&
      (!Number.isInteger(body.sortOrder) || body.sortOrder < 0)
    )
      throw new Error("Display order must be a non-negative integer.");
    return { isActive: body.isActive ?? true, sortOrder: body.sortOrder ?? 0 };
  };
  const saveCategory = async (req, res, next) => {
    try {
      const existing = req.params.id
        ? await loadRecord(req.params.id, Category)
        : null;
      const body = { ...(existing?.toObject() || {}), ...(req.body || {}) };
      const slug = text(body, "slug", 100, true);
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
        throw new Error(
          "Slug must use lowercase letters, numbers and hyphens.",
        );
      if (existing && slug !== existing.slug)
        throw new Error(
          "Category slugs cannot be changed. You can edit the category name.",
        );
      const parent = text(body, "parent", 100) || null;
      const visited = new Set([slug]);
      let ancestor = parent;
      while (ancestor) {
        if (visited.has(ancestor))
          throw new Error(
            "A category cannot be placed inside its own descendants.",
          );
        visited.add(ancestor);
        ancestor = (await Category.findOne({ slug: ancestor }).lean())?.parent;
      }
      if (parent === slug)
        throw new Error("A category cannot be its own parent.");
      if (parent && !(await Category.exists({ slug: parent })))
        throw new Error("Choose an existing parent category.");
      const values = {
        title: text(body, "title", 150, true),
        slug,
        parent,
        image: text(body, "image", 2000),
        text: text(body, "text", 1000),
        ...common(body),
      };
      const category = existing
        ? await existing.set(values).save()
        : await Category.create(values);
      res
        .status(existing ? 200 : 201)
        .json({ category: serialize(category.toObject()) });
    } catch (error) {
      next(error);
    }
  };
  const saveProduct = async (req, res, next) => {
    try {
      const existing = req.params.id
        ? await loadRecord(req.params.id, Product)
        : null;
      const body = { ...(existing?.toObject() || {}), ...(req.body || {}) };
      const category = text(body, "category", 100, true);
      if (!(await Category.exists({ slug: category })))
        throw new Error("Choose an existing category.");
      if (
        body.priceINR != null &&
        (typeof body.priceINR !== "number" ||
          !Number.isFinite(body.priceINR) ||
          body.priceINR < 0)
      )
        throw new Error("Price must be a non-negative number.");
      if (
        body.images !== undefined &&
        (!Array.isArray(body.images) ||
          body.images.length > 12 ||
          body.images.some(
            (url) => typeof url !== "string" || url.length > 2000,
          ))
      )
        throw new Error("Provide at most 12 valid gallery URLs.");
      const values = {
        title: text(body, "title", 150, true),
        category,
        image: text(body, "image", 2000, true),
        images: body.images || [],
        description: text(body, "description", 5000),
        materials: text(body, "materials", 500),
        origin: text(body, "origin", 200),
        badge: text(body, "badge", 60),
        priceINR: body.priceINR ?? null,
        ...common(body),
      };
      const product = existing
        ? await existing.set(values).save()
        : await Product.create(values);
      res
        .status(existing ? 200 : 201)
        .json({ product: serialize(product.toObject()) });
    } catch (error) {
      next(error);
    }
  };
  router.post("/categories", saveCategory);
  router.patch("/categories/:id", saveCategory);
  router.post("/products", saveProduct);
  router.patch("/products/:id", saveProduct);
  for (const [resource, Model] of [
    ["products", Product],
    ["categories", Category],
  ]) {
    router.delete(`/${resource}/:id`, async (req, res, next) => {
      try {
        const item = await loadRecord(req.params.id, Model);
        let movedSubcategories = 0;
        if (resource === "categories") {
          const productCount = await Product.countDocuments({
            category: item.slug,
          });
          if (productCount)
            return res.status(409).json({
              error: `This category still contains ${productCount} product(s), including drafts. Move or delete them first.`,
            });
          const children = await Category.find({ parent: item.slug })
            .select("title")
            .lean();
          if (children.length && req.body?.preserveSubcategories !== true)
            return res.status(409).json({
              error: `This category has ${children.length} subcategories: ${children.map((child) => child.title).join(", ")}. Confirm that they should be kept and moved up one level.`,
            });
          if (children.length) {
            const result = await Category.updateMany(
              { parent: item.slug },
              { $set: { parent: item.parent || null } },
            );
            movedSubcategories = result.modifiedCount;
          }
        }
        await item.deleteOne();
        res.json({ deleted: true, id: String(item._id), movedSubcategories });
      } catch (error) {
        next(error);
      }
    });
  }
  router.use((error, _req, res, _next) => {
    if (error.status)
      return res.status(error.status).json({ error: error.message });
    if (error.name === "MulterError")
      return res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
        error:
          error.code === "LIMIT_FILE_SIZE"
            ? "Each image must be 8 MB or smaller."
            : "Upload up to 12 images using the image selector.",
      });
    if (error.code === 11000)
      return res
        .status(409)
        .json({ error: "A category with this title or slug already exists." });
    if (error.name === "ValidationError")
      return res.status(400).json({
        error:
          "Check required fields and image URLs. Use http(s) URLs or /uploads/ paths.",
      });
    if (error.type === "entity.too.large")
      return res.status(413).json({ error: "Form data is too large." });
    if (error instanceof SyntaxError)
      return res.status(400).json({ error: "Invalid JSON body." });
    if (error.name === "Error")
      return res.status(400).json({ error: error.message });
    res
      .status(503)
      .json({ error: "Unable to save right now. Please try again." });
  });
  return router;
}
