import { useLocation, Link } from "react-router";
import { source } from "../lib/source";
import { docs } from "../../.source";
import { toClientRenderer } from "fumadocs-mdx/runtime/vite";
import defaultMdxComponents from "fumadocs-ui/mdx";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import {
  DocsBody,
  DocsDescription,
  DocsPage as FumaDocsPage,
  DocsTitle,
} from "fumadocs-ui/page";

const renderer = toClientRenderer(
  docs.doc,
  ({ toc, default: Mdx, frontmatter }) => {
    return (
      <FumaDocsPage toc={toc}>
        <DocsTitle>{frontmatter.title}</DocsTitle>
        <DocsDescription>{frontmatter.description}</DocsDescription>
        <DocsBody>
          <Mdx components={{ ...defaultMdxComponents }} />
        </DocsBody>
      </FumaDocsPage>
    );
  },
);

export function DocsPage() {
  const location = useLocation();
  const slugs = location.pathname
    .replace("/docs", "")
    .split("/")
    .filter((v) => v.length > 0);

  const page = source.getPage(slugs);

  if (!page) {
    return (
      <div className="container mx-auto p-8">
        <h1 className="text-4xl font-bold mb-4">Page Not Found</h1>
        <p className="text-xl mb-4">The documentation page you're looking for doesn't exist.</p>
        <Link to="/docs" className="text-blue-600 hover:underline">
          Back to docs home
        </Link>
      </div>
    );
  }

  const tree = source.pageTree;
  const Content = renderer[page.file.path];

  if (!Content) {
    return (
      <div className="container mx-auto p-8">
        <h1 className="text-4xl font-bold mb-4">Content Not Found</h1>
        <p className="text-xl mb-4">Unable to load the content for this page.</p>
        <Link to="/docs" className="text-blue-600 hover:underline">
          Back to docs home
        </Link>
      </div>
    );
  }

  return (
    <DocsLayout
      tree={tree}
      nav={{ title: "MCP File" }}
      githubUrl="https://github.com/mattzcarey/mcpfile"
    >
      <Content />
    </DocsLayout>
  );
}
