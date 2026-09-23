import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";

// ─── Flatten helpers ──────────────────────────────────────────────────

function safeStr(val) {
  if (val == null) return "";
  return String(val);
}

function formatPrice(price) {
  if (!price || !price.amount) return "";
  const amount = parseFloat(price.amount || 0);
  const currency = price.currency || "";
  return currency ? `${amount} ${currency}` : String(amount);
}

function formatPriceRange(range) {
  if (!range) return "";
  const min = formatPrice(range.min);
  const max = formatPrice(range.max);
  if (min && max && min !== max) return `${min} - ${max}`;
  return min || max || "";
}

function flattenProduct(product) {
  const rows = [];

  const productId = safeStr(product.id);
  const productTitle = safeStr(product.title);
  const description = safeStr(product.description?.plain);
  const priceRange = formatPriceRange(product.price_range);

  const allMedia = product.media || [];
  const imageUrls = allMedia
    .filter((m) => m.type === "image" && m.url)
    .map((m) => safeStr(m.url));
  const imageAlts = allMedia
    .filter((m) => m.type === "image")
    .map((m) => safeStr(m.alt_text));
  const mediaTypes = allMedia.map((m) => safeStr(m.type));

  const optionsStr = (product.options || [])
    .map((opt) => {
      const vals = (opt.values || []).map((v) => safeStr(v.label || v)).join(", ");
      return `${safeStr(opt.name)}: ${vals}`;
    })
    .join("; ");

  const variants = product.variants || [];

  if (variants.length === 0) {
    rows.push({
      PRODUCT_ID: productId,
      TITLE: productTitle,
      DESCRIPTION: description,
      IMAGE_URL: imageUrls.join(", "),
      IMAGE_ALT_TEXT: imageAlts.join(", "),
      MEDIA_TYPE: mediaTypes.join(", "),
      PRICE_RANGE: priceRange,
      OPTIONS: optionsStr,
      VARIANT_ID: "",
      VARIANT_TITLE: "",
      VARIANT_URL: "",
      VARIANT_PRICE: "",
      VARIANT_AVAILABILITY: "",
      VARIANT_OPTIONS: "",
      VARIANT_DESCRIPTION: "",
    });
  } else {
    for (const variant of variants) {
      const variantMedia = variant.media?.length ? variant.media : allMedia;
      const variantImageUrls = variantMedia
        .filter((m) => m.type === "image" && m.url)
        .map((m) => safeStr(m.url));
      const variantImageAlts = variantMedia
        .filter((m) => m.type === "image")
        .map((m) => safeStr(m.alt_text));

      const variantOptionsStr = (variant.options || [])
        .map((opt) => `${safeStr(opt.name)}: ${safeStr(opt.label)}`)
        .join("; ");

      const available = variant.availability?.available;
      const availabilityStr =
        available === true ? "available" : available === false ? "unavailable" : "";

      rows.push({
        PRODUCT_ID: productId,
        TITLE: productTitle,
        DESCRIPTION: description,
        IMAGE_URL: variantImageUrls.join(", ") || imageUrls.join(", "),
        IMAGE_ALT_TEXT: variantImageAlts.join(", ") || imageAlts.join(", "),
        MEDIA_TYPE: mediaTypes.join(", "),
        PRICE_RANGE: priceRange,
        OPTIONS: optionsStr,
        VARIANT_ID: safeStr(variant.id),
        VARIANT_TITLE: safeStr(variant.title),
        VARIANT_URL: safeStr(variant.url),
        VARIANT_PRICE: formatPrice(variant.price),
        VARIANT_AVAILABILITY: availabilityStr,
        VARIANT_OPTIONS: variantOptionsStr,
        VARIANT_DESCRIPTION: safeStr(variant.description),
      });
    }
  }

  return rows;
}

function flattenProducts(products) {
  const rows = [];
  for (const product of products) {
    rows.push(...flattenProduct(product));
  }
  return rows;
}

// ─── MCP Server ───────────────────────────────────────────────────────

function createServer() {
  const server = new McpServer({
    name: "shortcut product mcp",
    version: "1.0.0",
  });

  server.registerTool(
    "markdown",
    {
      description: "Flattens nested product data into a clean JSON array with consistent keys (IMAGE_URL, TITLE, DESCRIPTION, VARIANT_URL, etc). One row per variant. No metadata, no wrappers — just the array.",
      inputSchema: {
        products: z
          .array(z.record(z.any()))
          .describe("Array of product objects. Each can have id, title, description.plain, media[], options[], price_range, variants[]"),
      },
    },
    async ({ products }) => {
      const rows = flattenProducts(products);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(rows),
          },
        ],
      };
    }
  );

  return server;
}

export default {
  fetch(request, env, ctx) {
    return createMcpHandler(createServer)(request, env, ctx);
  },
} satisfies ExportedHandler;
