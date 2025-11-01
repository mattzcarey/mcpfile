# McpFile

McpFile is a standard file format for declaring mcp servers for an mcp client (normally an agent). It also comes with a Client SDK.

## TLDR

stick this in a file with a .json extension.

```json
{
  "mcpServer": [
    "my-server-name": { // name of the server.
    "type": "http", // transport name, use http or sse
    "url": "https://example.com/mcp" // if http or sse you can use the url.
    }
  ]
}
```

The application/agent developer can use the Mcpfile SDK to connect to the servers, manage authentication, get lovely lifecycle hooks and helper methods which don't exist on the MCP SDK Client (_yet_).

## Motivation

This came about because every MCP Client (Cursor, Claude Code, Claude Desktop, Windsurf, OpenCode, Gemini CLI, Codex CLI etc) use a slightly different standard for declaring MCP servers for an agent.

Whats more there is no good standard definition for an MCP client which can be used in production. Mcp SDK Client can only connect to one server at a time. there are no lifecycle hooks. you cant dump the state to a file (specifically for durable object hibernation). This causes loads of issues since everyone has to reinvent the wheel. This project will also include a sdk for use with mcpfile. The hope is that this can ll be pushed upstream to the official SDK.

## Spec

mcpfiles are defined in json. They normally have the name .mcp.json but you can call them anything. Particular implementation is up to the client but it would be expected that any file called .mcp.json in a particular working directory should be loaded by default.

### Server Names

When loaded as tools every tools will be prefixed with mcp**<server-name>**<tool-name>. This namespacing is to prevent name collisions. As a result there are restrictions on server names. They should be alphanumeric -\_ with no spaces. These will throw errors.

### Remote Servers

```json
{
  "mcpServer": [
    "my-server-name": {
    "type": "http", // or sse (deprecated)
    "url": "https://example.com/mcp"
    }
  ]
}
```

### Local Servers

- node

```json
{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["-y", "mcp-server"],
      "env": {
        "API_KEY": "value"
      }
    }
  }
}
```

- python

```json
{
  "mcpServers": {
    "server-name": {
      "command": "python",
      "args": ["mcp-server.py"],
      "env": {
        "API_KEY": "value"
      }
    }
  }
}
```

you can also point to an env file with `envFile` param.

```json
{
  "mcpServers": {
    "server-name": {
      "command": "python",
      "args": ["mcp-server.py"],
      "envFile": ".env"
    }
  }
}
```

### Allowed tools

This allows users to specify which tools, prompts and resources are allowed to be used by the agent. This is completely optional. By default all are allowed.

```json
{
  "mcpServer": [
    "my-server-name": {
    "type": "http", // or sse (deprecated)
    "url": "https://example.com/mcp",
    "allowedTools": ["tool1", "tool2"] // optional - these follow either the exact name of the tool or the namespaced version (mcp__<server-name>__<tool-name>)
    "allowedPrompts": ["prompt1", "prompt2"] // optional
    "allowedResources": ["resource1", "resource2"] // optional
    }
  ]
}
```

### Disabled

This allows users to disable a server without removing it from a config. This is completely optional. By default all are enabled.

```json
{
  "mcpServer": [
    "my-server-name": {
    "type": "http", // or sse (deprecated)
    "url": "https://example.com/mcp",
    "disabled": true // optional
    }
  ]
}
```

<!-- it can also be a function, maybe? -->

### Config Interpolation

(borrowed from [cursor](https://cursor.com/docs/context/mcp)) since they did a really good job.

Config interpolation
Use variables in mcp.json values. Mcpfile resolves variables in these fields: command, args, env, url, and headers.

Supported syntax:

${env:NAME} environment variables
${userHome} path to your home folder
${workspaceFolder} project root (the folder that contains .cursor/mcp.json)
${workspaceFolderBasename} name of the project root
${pathSeparator} and ${/} OS path separator
Examples

```json
{
  "mcpServers": {
    "local-server": {
      "command": "python",
      "args": ["${workspaceFolder}/tools/mcp_server.py"],
      "env": {
        "API_KEY": "${env:API_KEY}"
      }
    }
  }
}
```

```json
{
  "mcpServers": {
    "remote-server": {
      "url": "https://api.example.com/mcp",
      "headers": {
        "Authorization": "Bearer ${env:MY_SERVICE_TOKEN}"
      }
    }
  }
}
```

## SDK (for agent developers)

The SDK consists of 4 parts which you can use together or seperately as you see fit.

### Parser

The parser takes a mcpfile and returns a list of servers and the config to connect to each server. This is directly plugable into the MCP SDK Client.connect() function.

### Client

This client is essentially an extension to the McpSDK Client. It adds lifecycle hooks (tbc). It will also handle authentication, lifecycle hooks and helper methods which don't exist on the MCP SDK Client (_yet_).

### Manager

Here we add all the juicy bits that you need for production

It will handle multiple servers connected.

### Router

tbc
