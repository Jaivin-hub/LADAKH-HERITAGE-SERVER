import dns from "node:dns";
import mongoose from "mongoose";
import { createApp } from "./app.js";
import { Category, Product } from "./models.js";
const port = Number(process.env.PORT || 4000);
const uri = process.env.MONGODB_URI;
// Optional process-local DNS override for networks that cannot resolve Atlas SRV records.
const dnsServers = process.env.MONGODB_DNS_SERVERS?.split(",").map(value => value.trim()).filter(Boolean);
if (dnsServers?.length) dns.setServers(dnsServers);
const origins = (
  process.env.CORS_ORIGINS || "http://localhost:5174,http://127.0.0.1:5174"
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const baseUrl = (
  process.env.PUBLIC_BASE_URL || `http://localhost:${port}`
).replace(/\/$/, "");
if (!uri) {
  console.error("Set MONGODB_URI in server/.env before starting.");
  process.exit(1);
}
try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000, family: 4 });
  await Promise.all([Category.init(), Product.init()]);
  const server = createApp({
    origins,
    baseUrl,
    enableAdmin:
      process.env.ENABLE_LOCAL_ADMIN === "true" &&
      process.env.NODE_ENV !== "production",
  }).listen(port, process.env.HOST || "127.0.0.1", () =>
    console.log(`Catalogue API listening on port ${port}; MongoDB connected.`),
  );
  server.on("error", () => {
    console.error("Unable to start API listener. Check HOST and PORT.");
    mongoose.disconnect().finally(() => process.exit(1));
  });
  const shutdown = () => {
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
} catch {
  console.error(
    "MongoDB connection or index setup failed. Check server/.env, database access and unique category slugs/titles.",
  );
  await mongoose.disconnect();
  process.exit(1);
}
