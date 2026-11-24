import test from "node:test";
import assert from "node:assert/strict";
import {
  parseFilters,
  productMatch,
  publicCategories,
} from "../src/catalogue.js";
test("validates paging and sort and rejects operator-shaped query values", () => {
  assert.throws(() => parseFilters({ page: "0" }));
  assert.throws(() => parseFilters({ limit: "101" }));
  assert.throws(() => parseFilters({ category: { $ne: "" } }));
  assert.throws(() => parseFilters({ sort: "unknown" }));
  assert.equal(parseFilters({}).limit, 8);
});
test("parent filters include descendants and search is literal", () => {
  const cats = [
    { slug: "silver", title: "Silver" },
    { slug: "pendants", title: "Pendants", parent: "silver" },
    { slug: "gold", title: "Gold" },
  ];
  const result = productMatch(cats, { category: "Silver", search: "a.b" });
  assert.deepEqual(result.category.$in, ["silver", "pendants"]);
  assert.equal(result.$or[0].title.$regex, "a\\.b");
  assert.deepEqual(
    productMatch(cats, { category: "missing" }).category.$in,
    [],
  );
});
test("hidden, orphan and circular category branches are not published", () => {
  const cats = [
    { slug: "silver", title: "Silver", isActive: false },
    { slug: "child", parent: "silver" },
    { slug: "orphan", parent: "absent" },
    { slug: "cycle", parent: "cycle" },
    { slug: "gold", title: "Gold", image: "/uploads/gold.jpg" },
  ];
  const result = publicCategories(cats, "http://localhost:4000");
  assert.equal(result.length, 1);
  assert.equal(result[0].image, "http://localhost:4000/uploads/gold.jpg");
});
