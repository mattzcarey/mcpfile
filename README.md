# McpFile

A standard file format for declaring MCP Servers for an MCP Client (normally an agent), with a powerful Client SDK.

## TLDR

Stick this in a file with a `.json` extension:

```json
{
  "mcpServers": {
    "my-server-name": {
      "type": "http",
      "url": "https://example.com/mcp"
    }
  }
}
```

The application/agent developer can use the McpFile SDK to connect to servers, manage authentication, and get lifecycle hooks and helper methods that don't exist in the MCP SDK Client (_yet_).

## Motivation

This came about because every MCP Client (Cursor, Claude Code, Claude Desktop, Windsurf, OpenCode, Gemini CLI, Codex CLI, etc.) uses a slightly different standard for declaring MCP servers for an agent.

What's more, there is no good standard definition for an MCP client that can be used in production. The MCP SDK Client can only connect to one server at a time, has no lifecycle hooks, and you can't dump the state to a file (specifically for durable object hibernation). This causes loads of issues since everyone has to reinvent the wheel.

This project includes both a file format specification and an SDK for use with McpFile. The hope is that this can all be pushed upstream to the official SDK.

## Documentation

For detailed documentation, please visit our [documentation site](https://mcpfile.org).

## SDK (comming soon)

The McpFile SDK is available on npm as `mcpfile`.

```bash
npm install mcpfile
```

## License

MIT
