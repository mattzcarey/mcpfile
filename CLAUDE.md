# Development Guidelines for Claude

This document contains important guidelines for developing the mcpfile project.

## Testing and Examples

**IMPORTANT: Do not use Effect in examples or tests.**

While the core library uses Effect for structured error handling and resource management, examples and tests should be written without Effect to:

1. **Keep examples simple and accessible** - Users should be able to understand the API without learning Effect
2. **Make tests more straightforward** - Tests should be easy to read and understand
3. **Reduce cognitive load** - Effect is an internal implementation detail

### Examples

Examples should demonstrate the public API in the simplest way possible using standard JavaScript/TypeScript patterns:

```typescript
// ✅ GOOD - Simple promise-based example
try {
  const servers = await parse("./config.mcp.json");
  for (const server of servers) {
    console.log(`Found server: ${server.metadata.serverId}`);
  }
} catch (error) {
  console.error("Failed to parse:", error);
}
```

```typescript
// ❌ BAD - Using Effect in examples
import { Effect } from "effect";

const program = Effect.gen(function* () {
  const servers = yield* parse("./config.mcp.json");
  // ...
});
```

### Tests

Tests should use standard testing patterns with vitest:

```typescript
// ✅ GOOD - Simple test
it("should parse a simple HTTP server", async () => {
  const result = await parse(configPath);
  expect(result).toHaveLength(1);
});
```

```typescript
// ❌ BAD - Using Effect in tests
it("should parse a simple HTTP server", async () => {
  const result = await Effect.runPromise(parse(configPath));
  expect(result).toHaveLength(1);
});
```

## API Design

The public API should be designed to work naturally with standard JavaScript patterns:

- Export promise-based functions, not Effect-based functions
- Use standard error handling (throw/try-catch) in public APIs
- Keep Effect as an internal implementation detail for managing resources and errors within the library
