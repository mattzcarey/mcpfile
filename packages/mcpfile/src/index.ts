// File class exports (primary API)
export {
	File,
	type ConnectParams,
	type ServerConnectParams,
	type TransportConfig,
	type HttpTransportConfig,
	type SseTransportConfig,
	type ServerMetadata,
	type TransportType,
	type ParseOptions,
	FileNotFoundError,
	ParseError,
	ValidationError,
	InterpolationError,
	type ConfigError,
} from "./file.js";

// Client
export {
	ManagedClient,
	makeClient,
	type Client,
	type ClientConfig,
	type ConnectionState,
	ConnectionError,
	NotConnectedError,
	FilteredError,
} from "./client.js";

// Manager
export {
	ClientManager,
	type ServerState,
	type SerializableServerState,
	type ManagerState,
	type ManagerHooks,
	type ManagerConfig,
	ManagerError,
} from "./manager.js";

// Schema exports (types inferred from Zod schemas for .mcp.json file format)
export type {
	ServerConfig,
	HttpServerConfig,
	StdioServerConfig,
	McpFileConfig,
	Allowed,
} from "@mcpfile/schemas";

// JSON Schema export
export { mcpFileJsonSchema } from "@mcpfile/schemas";
