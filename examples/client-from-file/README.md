# MCP Client from File Example

This example demonstrates how to:

1. Load an MCP configuration from a `.mcp.json` file using `File.fromPath()`
2. Create a managed client with `ManagedClient.create()`
3. List tools, prompts, and resources
4. Gracefully disconnect

## Running the Example

```bash
npm install
npm start
```

## Features Demonstrated

- **Configuration Loading**: Parse `.mcp.json` files with variable interpolation support
- **Managed Client**: Auto-connection, health monitoring, and graceful shutdown
- **Lifecycle Management**: Connection state tracking
- **Allowed List Filtering**: Automatically filter tools/prompts/resources (if configured)
- **Graceful Error Handling**: Handle servers that don't implement all capabilities (tools/prompts/resources)

## How it Works

The example connects to the Cloudflare Docs MCP server configured in `.mcp.json`:

```json
{
  "mcpServers": {
    "cloudflare-docs": {
      "type": "http",
      "url": "https://docs.mcp.cloudflare.com/mcp"
    }
  }
}
```

The `ManagedClient` handles:
- Automatic connection on create
- Connection health monitoring
- Auto-reconnection with exponential backoff (on unexpected disconnects)
- Graceful shutdown on disconnect

## Client Features

### Auto-Reconnection

If the connection drops unexpectedly, the client will automatically:
1. Detect the disconnect
2. Wait with exponential backoff (1s, 2s, 4s, 8s, 16s...)
3. Retry up to 5 times (configurable)
4. Mark as "failed" if all attempts fail

### Allowed List Filtering

If you add an `allowed` field to your server config, the client will automatically filter responses:

```json
{
  "mcpServers": {
    "cloudflare-docs": {
      "type": "http",
      "url": "https://docs.mcp.cloudflare.com/mcp",
      "allowed": {
        "tools": ["search", "get-document"],
        "prompts": ["help"],
        "resources": ["docs://"]
      }
    }
  }
}
```

The client will:
- Filter list results to only show allowed items
- Throw `FilteredError` if you try to access disallowed items

### Handling Missing Capabilities

Not all MCP servers support all capabilities. A server might only implement tools, or only resources, etc. The example wraps all capability checks in try-catch blocks:

```typescript
try {
  const tools = await client.listTools();
  // Use tools...
} catch (error) {
  console.log("Tools not supported");
}
```

This ensures the example works with any MCP server, regardless of which capabilities it implements.
