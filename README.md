# Ladakh Heritage catalogue server

Node.js 22+ / Express / Mongoose. Public read-only APIs for manually managed MongoDB products and categories. Local development also supports admin creation endpoints; admin login is planned separately.

## Start locally

1. Ensure MongoDB is running at `127.0.0.1:27017`.
2. `npm ci`
3. Copy `.env.example` to `.env` (a local `.env` was created during setup). Set `MONGODB_URI=mongodb://127.0.0.1:27017/ladakh_heritage`.
4. `npm run dev` (or `npm start`). The API waits for the database and index setup before listening on port 4000.
5. In `../ladakh-heritage-varkala`, run `npm run dev`. Vite forwards `/api` to port 4000.

`GET http://localhost:4000/api/health` reports MongoDB readiness. Shutdown closes the HTTP listener and database connection. Database failures return generic JSON errors, without connection strings.

## Manually add content using MongoDB Compass

Connect to the same URI as `.env`; select database **ladakh_heritage**. Server startup creates **categories** and **products** collections and indexes. The API does not auto-seed demo products.

1. Add categories first. Use `examples/categories.json` as the document format. Each `slug` and `title` is unique. A child uses its parent's **slug** in `parent`; top-level categories use `parent: null`. Avoid cycles and missing parents. Hidden parents hide their descendants.
2. Add real image files to `server/uploads/`, or upload them to your own image storage. Only upload trusted image files. Store `/uploads/filename.jpg` or an absolute `https://...` image URL in MongoDB. Do not store computer paths, binary files, base64, or Google Drive preview links as image URLs. MongoDB stores image references, not image bytes. Files in `uploads/` are publicly served and excluded from Git.
3. Insert product documents using `examples/product.json`. Set `category` to the exact category **slug**, not its title or ObjectId. MongoDB generates `_id` automatically. One `image` is the main card image; `images` is the optional gallery.
4. Include **isActive: true** and numeric **sortOrder** explicitly. Compass bypasses Mongoose validation/defaults: follow the provided JSON fields and types. Product images must be valid URLs/paths. `priceINR` must be a non-negative number or `null`, never a formatted currency string.
5. Refresh the website after manual edits. Unpublished products (`isActive: false`), missing category references, and inactive category branches do not appear. No sample files are automatically imported.

## Endpoints

- `GET /api/categories` → `{ categories: [...] }` (active hierarchy, server image URLs).
- `GET /api/products` → `{ products: [...], pagination: { page, limit, total, totalPages } }`.
- `GET /api/products/:id` → `{ product: {...} }`; invalid ID 400, missing/hidden product 404.
- `GET /api/health` → 200 connected, 503 disconnected.

Product query parameters:

| Parameter | Values                                                                                                                                                |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| category  | Category slug (preferred), or exact title for legacy links. Omit for all. Parent categories include descendants. Unknown category returns no results. |
| search    | Literal case-insensitive search in title, description, materials, origin; max 150 characters.                                                         |
| sort      | featured (default), price-low, price-high, name-az. Null prices sort last.                                                                            |
| page      | Positive integer, default 1; out-of-range pages clamp to the last page.                                                                               |
| limit     | 1–100, default 8.                                                                                                                                     |

Example: `/api/products?category=silver-jewellery&search=pendant&sort=price-low&page=1&limit=8`.

Response fields retain the frontend display contract: product `category` is the category title, `categorySlug` is its stable reference, `parentCategory` is the parent title, and `id` is a string. Internal document fields are not returned.

## Atlas and production

Change `MONGODB_URI` in the server's environment to your Atlas URI **including the database name**. Configure Atlas database-user access and network access. Restart the server. Never place MongoDB credentials in Vite environment variables or commit `.env`.

Set `PUBLIC_BASE_URL` to the API's public HTTPS origin so `/uploads/` images resolve correctly. Set `HOST=0.0.0.0` on a host that requires it, configure `PORT`, and use persistent storage for uploads (or use external object storage image URLs). TLS belongs at the hosting/reverse-proxy layer.

`CORS_ORIGINS` is a comma-separated exact origin allowlist: local Vite plus https://ladakhheritage.com and https://www.ladakhheritage.com are configured. CORS is browser response access control, not authentication; these catalogue endpoints are intentionally public. No cookies or credentials are required.

For a separately hosted frontend, set `VITE_CATALOGUE_API_URL=https://YOUR-API-HOST/api` and rebuild it. Alternatively proxy `/api` and `/uploads` through the website host. No API hosting URL is assumed or deployed here.

## Checks

`npm test` runs pure catalogue tests. To also exercise real MongoDB and HTTP:

```sh
MONGODB_TEST_URI=mongodb://127.0.0.1:27017 npm test
```

Integration tests create and delete only a new randomly named `ladakh_test_*` database. They never seed or clear `ladakh_heritage`.

## Local admin portal (phase 1)

Open `http://127.0.0.1:5174/admin`. Routes: overview, `/admin/products`, `/admin/products/new`, `/admin/categories`, and `/admin/categories/new`.

Set `ENABLE_LOCAL_ADMIN=true` in local server `.env` and restart. The example environment defaults to false, and `NODE_ENV=production` disables admin endpoints. Until authentication is added, they require a loopback connection; writes require an allowed local browser Origin and JSON content type (multipart form data for uploads). This is a local development gate, not a replacement for authentication. Do not deploy the write portal enabled behind a proxy before adding authenticated admin roles.

- `GET /api/admin/catalogue`: products and categories including drafts.
- `POST /api/admin/categories`: title, unique slug, optional parent slug, image, text, sortOrder, isActive.
- `POST /api/admin/products`: title, category slug, main image, optional images, description, materials, origin, badge, numeric priceINR (or null), sortOrder, isActive.

- `POST /api/admin/uploads`: multipart `images` field, up to 12 JPG/PNG/WebP files, maximum 8 MB and 40 megapixels each. Files are decoded, auto-oriented, resized to at most 2400 px, and stored as WebP with unique names. Response contains image paths and public URLs. Files live in `server/uploads/`; MongoDB stores paths. Removing a selection or cancelling a form does not delete uploaded files. Back up the uploads directory separately.

The portal adds records; editing, deletion, accounts, login are not included in this phase. Images can be uploaded directly or added by URL. Products support up to 12 selected images with main-image selection and removal; categories support one image. Product/category creation refreshes the local catalogue state. Active records appear in the storefront; inactive parents hide their descendants.

If Atlas SRV lookup fails with `EBADRESP`, set `MONGODB_DNS_SERVERS=1.1.1.1,8.8.8.8` in the server environment. This optional override affects only the Node server process. Leave it empty to use the system resolver.
