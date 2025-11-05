import { docs } from "../../.source";

// Load meta.json data at module level with top-level await
const metaPath = "meta.json";
const metaMap = docs.meta as any;
const meta = metaMap[metaPath] ? await metaMap[metaPath]() : null;

// Custom source for client-side navigation
export const source = {
  getPage(slugs: string[]) {
    const path = slugs.length === 0 ? "index.mdx" : slugs.join("/") + ".mdx";
    const docMap = docs.doc as any;
    if (docMap[path]) {
      return { file: { path } };
    }
    return null;
  },

  pageTree: buildPageTree(),
};

function buildPageTree() {
  const docMap = docs.doc as any;
  const children: any[] = [];

  if (meta && meta.pages) {
    // Use meta.json order
    for (const pageName of meta.pages) {
      const path = pageName === "index" ? "index.mdx" : `${pageName}.mdx`;

      if (docMap[path]) {
        const cleanPath = path.replace(/\.mdx?$/, "");
        const url = cleanPath === "index" ? "/docs" : `/docs/${cleanPath}`;

        const name = cleanPath === "index"
          ? "Introduction"
          : cleanPath
              .split(/[-_]/)
              .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
              .join(" ");

        children.push({
          type: "page" as const,
          name,
          url,
          external: false,
        });
      }
    }
  } else {
    // Fallback: show all pages in alphabetical order
    const paths = Object.keys(docMap).sort();

    for (const path of paths) {
      const cleanPath = path.replace(/\.mdx?$/, "");
      const url = cleanPath === "index" ? "/docs" : `/docs/${cleanPath}`;

      const name = cleanPath === "index"
        ? "Introduction"
        : cleanPath
            .split(/[-_]/)
            .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");

      children.push({
        type: "page" as const,
        name,
        url,
        external: false,
      });
    }
  }

  return {
    $id: "root",
    name: meta?.title || "Docs",
    children,
  };
}
