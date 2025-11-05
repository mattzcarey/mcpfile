import { Hono } from "hono";

const app = new Hono();

// API routes only - docs are handled client-side
app.get("/api/health", (c) => {
  return c.json({ status: "ok" });
});

export default app;
