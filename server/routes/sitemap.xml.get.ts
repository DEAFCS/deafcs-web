import {
  HOMEPAGE_URL,
  STATIC_SITEMAP_PATHS,
} from "~/utilities/seo";

export default defineEventHandler((event) => {
  setResponseHeader(event, "Content-Type", "application/xml; charset=utf-8");

  const urls = STATIC_SITEMAP_PATHS.map(
    (path) => `  <url><loc>${new URL(path, HOMEPAGE_URL).href}</loc></url>`,
  );

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
  ].join("\n");
});
