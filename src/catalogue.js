export function publicCategories(records, baseUrl) {
  const bySlug = new Map(records.map((item) => [item.slug, item]));
  const visible = (item, visited = new Set()) => {
    if (!item || item.isActive === false || visited.has(item.slug))
      return false;
    if (!item.parent) return true;
    visited.add(item.slug);
    return visible(bySlug.get(item.parent), visited);
  };
  return records
    .filter((item) => visible(item))
    .map((item) => ({
      id: String(item._id),
      slug: item.slug,
      title: item.title,
      parent: item.parent || null,
      parentCategory: bySlug.get(item.parent)?.title || null,
      image: imageUrl(item.image, baseUrl),
      text: item.text || "",
    }));
}
export function imageUrl(value, baseUrl) {
  if (typeof value !== "string") return "";
  if (/^https?:\/\//.test(value)) return value;
  return /^\/uploads\//.test(value) ? `${baseUrl}${value}` : "";
}
export function parseFilters(query) {
  for (const key of ["page", "limit", "category", "search", "sort"]) {
    if (query[key] !== undefined && typeof query[key] !== "string")
      throw new Error("Invalid query parameter");
  }
  const integer = (value, fallback, max) => {
    if (value === undefined) return fallback;
    if (!/^[1-9]\d*$/.test(value) || Number(value) > max)
      throw new Error("Invalid pagination");
    return Number(value);
  };
  const sort = query.sort || "featured";
  if (!["featured", "price-low", "price-high", "name-az"].includes(sort))
    throw new Error("Invalid sort");
  if ((query.search || "").length > 150 || (query.category || "").length > 150)
    throw new Error("Query too long");
  return {
    page: integer(query.page, 1, 100000),
    limit: integer(query.limit, 8, 100),
    category: query.category || "",
    search: (query.search || "").trim(),
    sort,
  };
}
export function productMatch(categories, filters) {
  let selected = categories;
  if (filters.category && filters.category !== "All Treasures") {
    const root = categories.find(
      (item) =>
        item.slug === filters.category || item.title === filters.category,
    );
    const slugs = new Set(root ? [root.slug] : []);
    for (let i = 0; i < categories.length; i++)
      for (const item of categories)
        if (slugs.has(item.parent)) slugs.add(item.slug);
    selected = categories.filter((item) => slugs.has(item.slug));
  }
  const match = {
    isActive: true,
    category: { $in: selected.map((item) => item.slug) },
  };
  if (filters.search) {
    const escaped = filters.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    match.$or = ["title", "description", "materials", "origin"].map((key) => ({
      [key]: { $regex: escaped, $options: "i" },
    }));
  }
  return match;
}
export function publicProduct(item, categories, baseUrl) {
  const category = categories.find((entry) => entry.slug === item.category);
  return {
    id: String(item._id),
    title: item.title,
    category: category.title,
    categorySlug: category.slug,
    parentCategory: category.parentCategory,
    image: imageUrl(item.image, baseUrl),
    images: (item.images || [])
      .map((value) => imageUrl(value, baseUrl))
      .filter(Boolean),
    originalImage: imageUrl(item.originalImage, baseUrl),
    description: item.description || "",
    materials: item.materials || "",
    origin: item.origin || "",
    priceINR: item.priceINR ?? null,
    badge: item.badge || "",
  };
}
