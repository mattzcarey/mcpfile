import { Link } from "react-router";
import { BookOpen, Github } from "lucide-react";

export function HomePage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="container mx-auto max-w-4xl text-center">
        <h1 className="text-5xl font-bold mb-6 md:text-6xl lg:text-7xl">
          MCP File
        </h1>
        <p className="text-lg text-fd-muted-foreground mb-12 max-w-xl mx-auto">
          MCP Server Configuration file for Clients and Agents.
        </p>
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Link
            to="/docs"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full font-medium bg-fd-primary text-fd-primary-foreground hover:bg-fd-primary/90 transition-colors"
          >
            <BookOpen className="size-4" />
            Documentation
          </Link>
          <a
            href="https://github.com/mattzcarey/mcpfile"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full font-medium border bg-fd-secondary text-fd-secondary-foreground hover:bg-fd-accent transition-colors"
          >
            <Github className="size-4" />
            GitHub
          </a>
        </div>
      </div>
    </div>
  );
}
