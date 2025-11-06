# ClientManager Example: Multiple Servers

This example demonstrates how to use the `ClientManager` to manage multiple MCP servers simultaneously with automatic reconnection, state tracking, and lifecycle hooks.

## Features Demonstrated

- ✅ **Multiple Server Management**: Connect to multiple servers from a `.mcp.json` config
- ✅ **Lifecycle Hooks**: Track state changes and errors across all servers
- ✅ **State Tracking**: Monitor connection state, session IDs, capabilities, and errors
- ✅ **Individual Client Access**: Get clients to make requests to specific servers
- ✅ **State Serialization**: Save and restore manager state (for persistence)
- ✅ **Graceful Shutdown**: Clean disconnection from all servers
- ✅ **Automatic Reconnection**: Failed servers are retried automatically
- ✅ **Error Isolation**: One server failing doesn't affect others

## Configuration

The `.mcp.json` file configures two instances of the Cloudflare Docs MCP server:

```json
{
  "mcpServers": {
    "cloudflare-docs-1": {
      "type": "http",
      "url": "https://docs.mcp.cloudflare.com/mcp"
    },
    "cloudflare-docs-2": {
      "type": "http",
      "url": "https://docs.mcp.cloudflare.com/mcp"
    }
  }
}
```

Note: **HTTP connections are stateless** - they don't have session IDs. SSE and Stdio connections would have session IDs.

## Running the Example

```bash
npm install
npm start
```

## What to Expect

The example will:

1. **Create the manager** with hooks that log state changes and errors
2. **Connect to both servers** from the config file
3. **Display current state** for each server including:
   - Connection state (connected, connecting, failed, etc.)
   - Transport type (http, sse, stdio)
   - Session ID (for stateful connections)
   - Server capabilities and version
4. **Make requests** to each server (list tools and resources)
5. **Show serialization** - how to save state for persistence
6. **Clean shutdown** - disconnect all servers gracefully

## Key Concepts

### Connection States

Each server can be in one of these states:
- `disconnected` - Not connected
- `connecting` - Establishing connection
- `connected` - Successfully connected
- `reconnecting` - Attempting to reconnect after disconnect
- `failed` - Failed after max reconnection attempts

### Stateless vs Stateful

- **HTTP (stateless)**: No session ID, each request is independent
  - Won't be reconnected when restoring from JSON
- **SSE/Stdio (stateful)**: Has session ID, maintains connection
  - Will be reconnected when restoring from JSON (if previously connected)

### Automatic Error Handling

- Failed servers don't block other servers from connecting
- Failed servers are retried periodically (default: every 60 seconds)
- Each server has its own reconnection logic with exponential backoff
- Error hooks allow you to log/handle errors without crashing

## State Serialization

The manager can serialize its state for persistence:

```typescript
// Save state
const json = await manager.toJSON();
localStorage.setItem("manager-state", json);

// Restore state later
const manager = await ClientManager.fromJSON(json, config);
```

This is useful for:
- Persisting session state across restarts
- Implementing session management in web applications
- Debugging and monitoring

## Learn More

- [ClientManager API Documentation](../../packages/mcpfile/README.md)
- [MCP Protocol Specification](https://modelcontextprotocol.io)
