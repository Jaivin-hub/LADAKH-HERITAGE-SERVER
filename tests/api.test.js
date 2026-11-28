import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import mongoose from "mongoose";
import { Category, Product } from "../src/models.js";
import { createApp } from "../src/app.js";
test(
  "MongoDB API: category relationships, pagination, search, prices, CORS and product details",
  { skip: !process.env.MONGODB_TEST_URI },
  async () => {
    // Only a new randomly named test database is populated and removed.
    const dbName = `ladakh_test_${randomUUID().replaceAll("-", "")}`;
    await mongoose.connect(process.env.MONGODB_TEST_URI, {
      dbName,
      serverSelectionTimeoutMS: 5000,
    });
    const uploads = await mkdtemp(join(tmpdir(), "ladakh-upload-test-"));
    let server;
    try {
      await Category.create([
        { slug: "silver", title: "Silver" },
        { slug: "pendants", title: "Pendants", parent: "silver" },
        { slug: "gold", title: "Gold" },
        { slug: "hidden", title: "Hidden", isActive: false },
      ]);
      const items = await Product.create([
        {
          title: "Pearl pendant",
          category: "pendants",
          image: "/uploads/pearl.jpg",
          priceINR: 900,
        },
        {
          title: "Silver ring",
          category: "silver",
          image: "https://example.test/ring.jpg",
          priceINR: 100,
        },
        { title: "Ask price", category: "silver", image: "/uploads/ask.jpg" },
        { title: "Gold ring", category: "gold", image: "/uploads/gold.jpg" },
        {
          title: "Draft",
          category: "silver",
          image: "/uploads/draft.jpg",
          isActive: false,
        },
        {
          title: "Hidden category",
          category: "hidden",
          image: "/uploads/hidden.jpg",
        },
        { title: "Orphan", category: "absent", image: "/uploads/orphan.jpg" },
      ]);
      server = createApp({
        origins: ["http://localhost:5174"],
        enableAdmin: true,
        uploads,
        baseUrl: "http://localhost:4000",
      }).listen(0, "127.0.0.1");
      await new Promise((resolve) => server.once("listening", resolve));
      const base = `http://127.0.0.1:${server.address().port}`;
      const get = async (path) => (await fetch(base + path)).json();
      const cats = await get("/api/categories");
      assert.equal(cats.categories.length, 3);
      assert.equal(
        cats.categories.find((x) => x.slug === "pendants").parentCategory,
        "Silver",
      );
      const all = await get("/api/products");
      assert.equal(all.pagination.total, 4);
      const silver = await get(
        "/api/products?category=silver&sort=price-low&limit=2&page=1",
      );
      assert.equal(silver.pagination.total, 3);
      assert.equal(silver.products[0].title, "Silver ring");
      const page2 = await get(
        "/api/products?category=silver&sort=price-low&limit=2&page=2",
      );
      assert.equal(page2.products[0].title, "Ask price");
      const desc = await get("/api/products?category=Silver&sort=price-high");
      assert.deepEqual(
        desc.products.map((x) => x.title),
        ["Pearl pendant", "Silver ring", "Ask price"],
      );
      assert.equal(
        (await get("/api/products?category=pendants")).pagination.total,
        1,
      );
      assert.equal(
        (await get("/api/products?search=PEARL")).products[0].image,
        "http://localhost:4000/uploads/pearl.jpg",
      );
      assert.equal((await get("/api/products?search=.*")).pagination.total, 0);
      assert.equal(
        (await get("/api/products?category=missing")).pagination.total,
        0,
      );
      assert.equal((await get("/api/products?page=999")).pagination.page, 1);
      assert.equal((await fetch(base + "/api/products?limit=999")).status, 400);
      assert.equal((await fetch(base + "/api/products/bad-id")).status, 400);
      assert.equal(
        (await fetch(base + `/api/products/${items[4]._id}`)).status,
        404,
      );
      assert.equal(
        (await get(`/api/products/${items[0]._id}`)).product.categorySlug,
        "pendants",
      );
      assert.equal(
        (
          await fetch(base + "/api/products", {
            headers: { Origin: "http://localhost:5174" },
          })
        ).headers.get("access-control-allow-origin"),
        "http://localhost:5174",
      );
      assert.equal(
        (
          await fetch(base + "/api/products", {
            headers: { Origin: "https://other.test" },
          })
        ).headers.get("access-control-allow-origin"),
        null,
      );
      assert.equal(
        (await fetch(base + "/api/products", { method: "POST" })).status,
        404,
      );
      assert.equal((await get("/api/health")).database, "connected");
      const post = (resource, body, origin = "http://localhost:5174") =>
        fetch(base + "/api/admin/" + resource, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(origin ? { Origin: origin } : {}),
          },
          body: JSON.stringify(body),
        });
      assert.equal(
        (
          await post("categories", {
            title: "Portal collection",
            slug: "portal",
          })
        ).status,
        201,
      );
      assert.equal(
        (
          await post("categories", {
            title: "Portal collection",
            slug: "portal",
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await post("categories", {
            title: "Bad parent",
            slug: "bad",
            parent: "missing",
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await post("products", {
            title: "Missing collection",
            category: "missing",
            image: "/uploads/a.jpg",
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await post("products", {
            title: "Bad image",
            category: "portal",
            image: "javascript:bad",
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await post("products", {
            title: "Bad price",
            category: "portal",
            image: "/uploads/a.jpg",
            priceINR: -1,
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await post("products", {
            title: "Portal product",
            category: "portal",
            image: "/uploads/a.jpg",
            priceINR: 2500,
          })
        ).status,
        201,
      );
      assert.equal(
        (
          await post("products", {
            title: "Portal draft",
            category: "portal",
            image: "/uploads/a.jpg",
            isActive: false,
          })
        ).status,
        201,
      );
      assert.equal(
        (await get("/api/products?category=portal")).pagination.total,
        1,
      );
      const mutate = (path, method, body = {}) =>
        fetch(base + "/api/admin/" + path, {
          method,
          headers: {
            Origin: "http://localhost:5174",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
      const editCategory = await Category.create({
        slug: "edit-test",
        title: "Edit test",
      });
      const child = await Category.create({
        slug: "edit-child",
        title: "Edit child",
        parent: "edit-test",
      });
      const editProduct = await Product.create({
        title: "Edit product",
        category: "edit-test",
        image: "/uploads/test.png",
        images: ["/uploads/second.png"],
      });
      const productPath = `products/${editProduct.id}`;
      const categoryPath = `categories/${editCategory.id}`;
      assert.equal(
        (
          await mutate(productPath, "PATCH", {
            title: "Updated product",
            priceINR: 250,
          })
        ).status,
        200,
      );
      const edited = await Product.findById(editProduct.id);
      assert.equal(edited.title, "Updated product");
      assert.deepEqual([...edited.images], ["/uploads/second.png"]);
      assert.equal(
        (await mutate(productPath, "PATCH", { priceINR: -1 })).status,
        400,
      );
      assert.equal(
        (await mutate(productPath, "PATCH", { category: "missing" })).status,
        400,
      );
      assert.equal(
        (await mutate(categoryPath, "PATCH", { title: "Updated category" }))
          .status,
        200,
      );
      assert.equal(
        (await mutate(categoryPath, "PATCH", { slug: "changed" })).status,
        400,
      );
      assert.equal(
        (await mutate(categoryPath, "PATCH", { parent: child.slug })).status,
        400,
      );
      assert.equal((await mutate(categoryPath, "DELETE")).status, 409);
      assert.equal((await mutate(productPath, "DELETE")).status, 200);
      assert.equal((await mutate(productPath, "DELETE")).status, 404);
      assert.equal((await mutate(categoryPath, "DELETE")).status, 409);
      assert.equal(
        (await mutate(`categories/${child.id}`, "DELETE")).status,
        200,
      );
      assert.equal((await mutate(categoryPath, "DELETE")).status, 200);
      assert.equal((await mutate("products/bad-id", "PATCH", {})).status, 400);
      assert.equal(
        (
          await fetch(base + "/api/admin/products/" + items[0].id, {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
              Origin: "https://untrusted.test",
            },
            body: "{}",
          })
        ).status,
        403,
      );
      const admin = await get("/api/admin/catalogue");
      assert.ok(admin.products.some((item) => item.title === "Portal draft"));
      assert.equal(
        (await post("categories", { title: "No origin", slug: "none" }, null))
          .status,
        403,
      );
      assert.equal(
        (
          await post(
            "categories",
            { title: "Remote origin", slug: "remote" },
            "https://other.test",
          )
        ).status,
        403,
      );
      const png = await sharp({
        create: { width: 16, height: 16, channels: 3, background: "#aabbcc" },
      })
        .png()
        .toBuffer();
      const upload = (files, origin = "http://localhost:5174") => {
        const form = new FormData();
        files.forEach(([bytes, mime, name]) =>
          form.append("images", new Blob([bytes], { type: mime }), name),
        );
        return fetch(base + "/api/admin/uploads", {
          method: "POST",
          body: form,
          headers: origin ? { Origin: origin } : {},
        });
      };
      const uploadedResponse = await upload([
        [png, "image/png", "first.png"],
        [png, "image/png", "../../second.png"],
      ]);
      assert.equal(uploadedResponse.status, 201);
      const uploaded = (await uploadedResponse.json()).images;
      assert.equal(uploaded.length, 2);
      assert.notEqual(uploaded[0].path, uploaded[1].path);
      for (const item of uploaded) {
        assert.match(item.path, /^\/uploads\/[a-f0-9-]+\.webp$/);
        const file = await fetch(base + item.path);
        assert.equal(file.status, 200);
        assert.match(file.headers.get("content-type"), /image\/webp/);
        assert.equal(
          (await sharp(Buffer.from(await file.arrayBuffer())).metadata()).width,
          16,
        );
      }
      const savedResponse = await post("products", {
        title: "Uploaded gallery",
        category: "portal",
        image: uploaded[1].path,
        images: [uploaded[0].path],
      });
      assert.equal(savedResponse.status, 201);
      const savedId = (await savedResponse.json()).product.id;
      const saved = (await get(`/api/products/${savedId}`)).product;
      assert.ok(saved.image.endsWith(uploaded[1].path));
      assert.ok(saved.images.some((url) => url.endsWith(uploaded[0].path)));
      assert.equal((await upload([])).status, 400);
      assert.equal(
        (await upload([[png, "image/png", "a.png"]], null)).status,
        403,
      );
      assert.equal(
        (await upload([[png, "image/png", "a.png"]], "https://other.test"))
          .status,
        403,
      );
      assert.equal(
        (await upload([["<svg/>", "image/svg+xml", "test.svg"]])).status,
        400,
      );
      assert.equal(
        (
          await upload([
            [png, "image/png", "valid.png"],
            ["not an image", "image/png", "fake.png"],
          ])
        ).status,
        400,
      );
      assert.equal(
        (
          await upload([
            [Buffer.alloc(8 * 1024 * 1024 + 1), "image/png", "large.png"],
          ])
        ).status,
        413,
      );
      assert.equal(
        (
          await upload(
            Array.from({ length: 13 }, () => [png, "image/png", "a.png"]),
          )
        ).status,
        400,
      );
      assert.equal(
        (await readdir(uploads)).length,
        2,
        "Failed batches must not leave files behind",
      );
      const disabled = createApp({
        origins: ["http://localhost:5174"],
        baseUrl: "http://localhost:4000",
      }).listen(0, "127.0.0.1");
      await new Promise((resolve) => disabled.once("listening", resolve));
      try {
        assert.equal(
          (
            await fetch(
              `http://127.0.0.1:${disabled.address().port}/api/admin/catalogue`,
            )
          ).status,
          403,
        );
      } finally {
        await new Promise((resolve) => disabled.close(resolve));
      }
    } finally {
      if (server) await new Promise((resolve) => server.close(resolve));
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
      await rm(uploads, { recursive: true, force: true });
    }
  },
);
