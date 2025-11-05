import { Hono } from "hono";

type Env = {
  ASSETS: Fetcher;
};

const app = new Hono<{ Bindings: Env }>();

// API routes
app.get("/api/health", (c) => {
  return c.json({ status: "ok" });
});

// List all available docs by reading meta.json
app.get("/api/docs", async (c) => {
  try {
    // Fetch meta.json from ASSETS to get the list of docs
    const metaResponse = await c.env.ASSETS.fetch(new URL("/raw-docs/meta.json", c.req.url));

    if (metaResponse.ok) {
      const meta = await metaResponse.json() as { pages?: string[] };
      const pages = meta.pages || [];

      return c.json({
        docs: pages.map(name => ({
          name,
          url: `/docs/${name}.md`
        }))
      });
    }
  } catch (error) {
    console.error("Error fetching meta.json:", error);
  }

  // Fallback if meta.json doesn't exist
  return c.json({ docs: [] });
});

// Serve index markdown at /docs/.md
app.get("/docs/.md", async (c) => {
  try {
    const response = await c.env.ASSETS.fetch(new URL("/raw-docs/index.mdx", c.req.url));

    if (!response.ok) {
      return c.text("Doc not found", 404);
    }

    const content = await response.text();
    return c.text(content, 200, {
      "Content-Type": "text/markdown; charset=utf-8",
    });
  } catch (error) {
    console.error(`Error fetching index doc:`, error);
    return c.text("Error fetching doc", 500);
  }
});

// Serve markdown files for each doc
app.get("/docs/:name{.+\\.md$}", async (c) => {
  const nameWithExt = c.req.param("name");
  const name = nameWithExt.replace(/\.md$/, '');

  // Fetch raw markdown from ASSETS
  try {
    const assetPath = `/raw-docs/${name}.mdx`;
    const response = await c.env.ASSETS.fetch(new URL(assetPath, c.req.url));

    if (!response.ok) {
      return c.text("Doc not found", 404);
    }

    const content = await response.text();
    return c.text(content, 200, {
      "Content-Type": "text/markdown; charset=utf-8",
    });
  } catch (error) {
    console.error(`Error fetching doc:`, error);
    return c.text("Error fetching doc", 500);
  }
});

export default app;
