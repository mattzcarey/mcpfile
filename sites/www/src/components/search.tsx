import { useEffect, useState } from "react";
import {
  SearchDialog,
  SearchDialogClose,
  SearchDialogContent,
  SearchDialogHeader,
  SearchDialogIcon,
  SearchDialogInput,
  SearchDialogList,
  SearchDialogOverlay,
  type SharedProps,
} from "fumadocs-ui/components/dialog/search";
import { create, insert, search as oramaSearch } from "@orama/orama";
import { createContentHighlighter, type SortedResult } from "fumadocs-core/search";
import { docs } from "../../.source";

export default function DefaultSearchDialog(props: SharedProps) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SortedResult[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [db, setDb] = useState<any>(null);

  // Build search index on mount
  useEffect(() => {
    let mounted = true;

    async function buildIndex() {
      try {
        const orama = await create({
          schema: {
            title: "string",
            description: "string",
            heading: "string",
            content: "string",
            url: "string",
          },
          language: "english",
        });

        for (const [path, module] of Object.entries(docs.doc)) {
          try {
            const mod = await (module as any)();
            const cleanPath = path.replace(/\.mdx?$/, "");
            const url = cleanPath === "index" ? "/docs" : `/docs/${cleanPath}`;

            // Extract headings and content separately
            let headings = "";
            let content = "";

            if (mod.structuredData) {
              // Add headings
              if (Array.isArray(mod.structuredData.headings)) {
                headings = mod.structuredData.headings
                  .map((h: any) => h.content || "")
                  .join(" ");
              }

              // Add section contents
              if (Array.isArray(mod.structuredData.contents)) {
                content = mod.structuredData.contents
                  .map((item: any) => item.content || "")
                  .join(" ");
              }
            }

            await insert(orama, {
              title: mod.frontmatter?.title || cleanPath,
              description: mod.frontmatter?.description || "",
              heading: headings,
              content: content,
              url,
            });
          } catch (e) {
            console.error(`Failed to index ${path}:`, e);
          }
        }

        if (mounted) setDb(orama);
      } catch (e) {
        console.error("Failed to build search index:", e);
      }
    }

    buildIndex();

    return () => {
      mounted = false;
    };
  }, []);

  // Search when query changes
  useEffect(() => {
    if (!db || !search) {
      setResults(null);
      return;
    }

    async function doSearch() {
      setIsLoading(true);
      try {
        const results = await oramaSearch(db, {
          term: search,
          limit: 10,
          properties: ["title", "description", "heading", "content"],
        });

        const highlighter = createContentHighlighter(search);
        const mapped: SortedResult[] = [];

        for (const hit of results.hits) {
          const doc = hit.document as any;

          // Add main page result with highlighted title
          mapped.push({
            type: "page",
            content: doc.title,
            contentWithHighlights: highlighter.highlight(doc.title),
            id: doc.url,
            url: doc.url,
          });

          // Add heading results
          if (doc.heading) {
            mapped.push({
              type: "heading",
              content: doc.heading,
              contentWithHighlights: highlighter.highlight(doc.heading),
              id: `${doc.url}-heading`,
              url: doc.url,
            });
          }

          // Add text content results
          if (doc.content) {
            // Find matching snippet
            const lowerContent = doc.content.toLowerCase();
            const lowerSearch = search.toLowerCase();
            const index = lowerContent.indexOf(lowerSearch);

            if (index !== -1) {
              // Get context around the match
              const start = Math.max(0, index - 100);
              const end = Math.min(doc.content.length, index + search.length + 100);
              let snippet = doc.content.substring(start, end);

              // Add ellipsis
              if (start > 0) snippet = "..." + snippet;
              if (end < doc.content.length) snippet = snippet + "...";

              mapped.push({
                type: "text",
                content: snippet,
                contentWithHighlights: highlighter.highlight(snippet),
                id: `${doc.url}-text`,
                url: doc.url,
              });
            }
          }
        }

        setResults(mapped);
      } catch (e) {
        console.error("Search error:", e);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }

    doSearch();
  }, [search, db]);

  return (
    <SearchDialog
      search={search}
      onSearchChange={setSearch}
      isLoading={isLoading || !db}
      {...props}
    >
      <SearchDialogOverlay />
      <SearchDialogContent>
        <SearchDialogHeader>
          <SearchDialogIcon />
          <SearchDialogInput />
          <SearchDialogClose />
        </SearchDialogHeader>
        <SearchDialogList items={results} />
      </SearchDialogContent>
    </SearchDialog>
  );
}
