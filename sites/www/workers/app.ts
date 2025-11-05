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
    const metaResponse = await c.env.ASSETS.fetch(
      new URL("/raw-docs/meta.json", c.req.url)
    );

    if (metaResponse.ok) {
      const meta = (await metaResponse.json()) as { pages?: string[] };
      const pages = meta.pages || [];

      return c.json({
        docs: pages.map((name) => ({
          name,
          url: `/docs/${name}.md`,
        })),
      });
    }
  } catch (error) {
    console.error("Error fetching meta.json:", error);
  }

  // Fallback if meta.json doesn't exist
  return c.json({ docs: [] });
});

// Serve markdown files for each doc
app.get("/docs/:name{.+\\.md$}", async (c) => {
  const nameWithExt = c.req.param("name");
  let name;
  if (nameWithExt === ".md") {
    name = "index";
  } else {
    name = nameWithExt.replace(/\.md$/, "");
  }

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

// Generate llms.txt - list of all markdown file URLs with titles and descriptions
app.get("/docs/llms.txt", async (c) => {
  try {
    // Fetch meta.json to get the list of docs
    const metaResponse = await c.env.ASSETS.fetch(
      new URL("/raw-docs/meta.json", c.req.url)
    );

    if (!metaResponse.ok) {
      return c.text("# No docs available", 200, {
        "Content-Type": "text/plain; charset=utf-8",
      });
    }

    const meta = (await metaResponse.json()) as { pages?: string[] };
    const pages = meta.pages || [];

    // Generate list with titles and descriptions
    const baseUrl = new URL(c.req.url).origin;
    const lines: string[] = [
      "# McpFile",
      "",
      "> A standard file format for MCP Clients and Agents to declare MCP Servers",
      "",
    ];

    for (const name of pages) {
      try {
        const assetPath = `/raw-docs/${name}.mdx`;
        const response = await c.env.ASSETS.fetch(
          new URL(assetPath, c.req.url)
        );

        if (response.ok) {
          const content = await response.text();

          // Extract frontmatter
          const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
          let title = name;
          let description = "";

          if (frontmatterMatch) {
            const frontmatter = frontmatterMatch[1];
            const titleMatch = frontmatter.match(/^title:\s*(.+)$/m);
            const descMatch = frontmatter.match(/^description:\s*(.+)$/m);

            if (titleMatch) title = titleMatch[1].trim();
            if (descMatch) description = descMatch[1].trim();
          }

          // Format: - [Title](url): Description
          const url = `${baseUrl}/docs/${name}.md`;
          lines.push(
            `- [${title}](${url})${description ? `: ${description}` : ""}`
          );
        }
      } catch (error) {
        console.error(`Error fetching ${name}:`, error);
      }
    }

    return c.text(lines.join("\n"), 200, {
      "Content-Type": "text/plain; charset=utf-8",
    });
  } catch (error) {
    console.error("Error generating llms.txt:", error);
    return c.text("Error generating file", 500);
  }
});

// Generate llms-full.txt - all docs concatenated
app.get("/docs/llms-full.txt", async (c) => {
  try {
    // Fetch meta.json to get the list of docs
    const metaResponse = await c.env.ASSETS.fetch(
      new URL("/raw-docs/meta.json", c.req.url)
    );

    if (!metaResponse.ok) {
      return c.text("# No docs available", 200, {
        "Content-Type": "text/plain; charset=utf-8",
      });
    }

    const meta = (await metaResponse.json()) as { pages?: string[] };
    const pages = meta.pages || [];

    // Fetch all docs and concatenate
    const docContents: string[] = [];

    for (const name of pages) {
      try {
        const assetPath = `/raw-docs/${name}.mdx`;
        const response = await c.env.ASSETS.fetch(
          new URL(assetPath, c.req.url)
        );

        if (response.ok) {
          const content = await response.text();
          docContents.push(`\n${content}\n\n${"=".repeat(80)}\n`);
        }
      } catch (error) {
        console.error(`Error fetching ${name}:`, error);
      }
    }

    const fullContent = docContents.join("\n");

    return c.text(fullContent, 200, {
      "Content-Type": "text/plain; charset=utf-8",
    });
  } catch (error) {
    console.error("Error generating llms-full.txt:", error);
    return c.text("Error generating file", 500);
  }
});

export default app;
