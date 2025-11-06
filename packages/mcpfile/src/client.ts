import { Effect, Data, Ref, Schedule, Scope, Exit } from "effect";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { Implementation as ClientInfo } from "@modelcontextprotocol/sdk/types.js";
import type { ServerConnectParams } from "./file.js";

/**
 * Connection state
 */
export type ConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting" | "failed";

/**
 * Client configuration
 */
export interface ClientConfig {
	info: ClientInfo;
	server: ServerConnectParams;
	/**
	 * Max reconnection attempts before giving up
	 * @default 5
	 */
	maxReconnectAttempts?: number;
	/**
	 * Initial reconnection delay in ms
	 * @default 1000
	 */
	initialReconnectDelay?: number;
	/**
	 * Max reconnection delay in ms
	 * @default 30000
	 */
	maxReconnectDelay?: number;
}

/**
 * Client errors
 */
export class ConnectionError extends Data.TaggedError("ConnectionError")<{
	message: string;
	cause?: unknown;
}> {}

export class NotConnectedError extends Data.TaggedError("NotConnectedError")<{
	message: string;
}> {}

export class FilteredError extends Data.TaggedError("FilteredError")<{
	type: "tool" | "prompt" | "resource";
	name: string;
}> {}

/**
 * Create MCP transport from ServerConnectParams
 */
function createTransport(server: ServerConnectParams) {
	const { transportConfig, transportType } = server;

	if (transportType === "stdio") {
		if (!("command" in transportConfig)) {
			throw new Error("Stdio transport requires command in config");
		}
		return new StdioClientTransport(transportConfig);
	}

	if (transportType === "http") {
		if (!("url" in transportConfig)) {
			throw new Error("HTTP transport requires url in config");
		}
		return new StreamableHTTPClientTransport(transportConfig.url, transportConfig.opts);
	}

	if (transportType === "sse") {
		if (!("url" in transportConfig)) {
			throw new Error("SSE transport requires url in config");
		}
		return new SSEClientTransport(transportConfig.url, transportConfig.opts);
	}

	throw new Error(`Unknown transport type: ${transportType}`);
}

/**
 * Check if item is allowed based on ServerConnectParams
 */
function isAllowed(type: "tools" | "prompts" | "resources", name: string, server: ServerConnectParams): boolean {
	const allowed = server._metadata.allowed?.[type];
	if (!allowed) return true; // No filter means allow all
	return allowed.includes(name);
}

/**
 * Client internal state
 */
interface ClientState {
	readonly mcpClient: McpClient;
	readonly transport: StdioClientTransport | StreamableHTTPClientTransport | SSEClientTransport;
	readonly connectionState: Ref.Ref<ConnectionState>;
	readonly reconnectAttempts: Ref.Ref<number>;
	readonly server: ServerConnectParams;
	readonly config: ClientConfig;
}

/**
 * Create a managed MCP client with Effect-based lifecycle
 */
export const makeClient = (config: ClientConfig): Effect.Effect<{
	connect: Effect.Effect<void, ConnectionError>;
	disconnect: Effect.Effect<void, ConnectionError>;
	getState: Effect.Effect<ConnectionState>;
	listTools: Effect.Effect<any, ConnectionError | NotConnectedError>;
	callTool: (name: string, args?: Record<string, unknown>) => Effect.Effect<any, ConnectionError | NotConnectedError | FilteredError>;
	listPrompts: Effect.Effect<any, ConnectionError | NotConnectedError>;
	getPrompt: (name: string, args?: Record<string, string>) => Effect.Effect<any, ConnectionError | NotConnectedError | FilteredError>;
	listResources: Effect.Effect<any, ConnectionError | NotConnectedError>;
	readResource: (uri: string) => Effect.Effect<any, ConnectionError | NotConnectedError | FilteredError>;
}, ConnectionError, Scope.Scope> =>
	Effect.gen(function* () {
		// Initialize client state
		const mcpClient = new McpClient(config.info);
		const transport = createTransport(config.server);
		const connectionState = yield* Ref.make<ConnectionState>("disconnected");
		const reconnectAttempts = yield* Ref.make(0);

		const state: ClientState = {
			mcpClient,
			transport,
			connectionState,
			reconnectAttempts,
			server: config.server,
			config,
		};

		// Connect implementation
		const connect = Effect.gen(function* () {
			yield* Ref.set(connectionState, "connecting");

			yield* Effect.tryPromise({
				try: () => mcpClient.connect(transport),
				catch: (error) => new ConnectionError({ message: "Failed to connect to MCP server", cause: error }),
			});

			yield* Ref.set(connectionState, "connected");
			yield* Ref.set(reconnectAttempts, 0);
		});

		// Handle disconnection with auto-reconnect
		const handleDisconnect = Effect.gen(function* () {
			const currentState = yield* Ref.get(connectionState);
			if (currentState === "disconnected") return; // Intentional disconnect

			const maxAttempts = config.maxReconnectAttempts ?? 5;
			const attempts = yield* Ref.get(reconnectAttempts);

			if (attempts >= maxAttempts) {
				yield* Ref.set(connectionState, "failed");
				yield* Effect.logError(`Failed to reconnect after ${maxAttempts} attempts`);
				return;
			}

			yield* Ref.set(connectionState, "reconnecting");
			yield* Ref.update(reconnectAttempts, (n) => n + 1);

			const currentAttempt = yield* Ref.get(reconnectAttempts);
			const initialDelay = config.initialReconnectDelay ?? 1000;
			const maxDelay = config.maxReconnectDelay ?? 30000;
			const delay = Math.min(initialDelay * Math.pow(2, currentAttempt - 1), maxDelay);

			yield* Effect.logInfo(`Reconnecting in ${delay}ms (attempt ${currentAttempt}/${maxAttempts})`);
			yield* Effect.sleep(delay);

			// Try to reconnect
			yield* Effect.either(connect);
		});

		// Set up connection monitoring
		mcpClient.onclose = () => {
			Effect.runFork(handleDisconnect);
		};

		mcpClient.onerror = (error) => {
			Effect.runSync(Effect.logError(`MCP client error: ${error}`));
		};

		// Disconnect implementation
		const disconnect = Effect.gen(function* () {
			yield* Ref.set(connectionState, "disconnected");
			yield* Effect.tryPromise({
				try: () => mcpClient.close(),
				catch: () => new ConnectionError({ message: "Failed to close client" }),
			});
		});

		// Helper to ensure connected
		const ensureConnected = Effect.gen(function* () {
			const currentState = yield* Ref.get(connectionState);
			if (currentState !== "connected") {
				return yield* new NotConnectedError({ message: "Client is not connected" });
			}
		});

		// Client operations
		const client = {
			// Lifecycle
			connect,
			disconnect,
			getState: Ref.get(connectionState),

			// Tools
			listTools: Effect.gen(function* () {
				yield* ensureConnected;
				const result = yield* Effect.tryPromise({
					try: () => mcpClient.listTools(),
					catch: (error) => new ConnectionError({ message: "Failed to list tools", cause: error }),
				});

				// Filter by allowed list
				if (config.server._metadata.allowed?.tools) {
					result.tools = result.tools.filter((tool) => isAllowed("tools", tool.name, config.server));
				}

				return result;
			}),

			callTool: (name: string, args?: Record<string, unknown>) =>
				Effect.gen(function* () {
					yield* ensureConnected;

					if (!isAllowed("tools", name, config.server)) {
						return yield* new FilteredError({ type: "tool", name });
					}

					return yield* Effect.tryPromise({
						try: () => mcpClient.callTool({ name, arguments: args }),
						catch: (error) => new ConnectionError({ message: `Failed to call tool ${name}`, cause: error }),
					});
				}),

			// Prompts
			listPrompts: Effect.gen(function* () {
				yield* ensureConnected;
				const result = yield* Effect.tryPromise({
					try: () => mcpClient.listPrompts(),
					catch: (error) => new ConnectionError({ message: "Failed to list prompts", cause: error }),
				});

				if (config.server._metadata.allowed?.prompts) {
					result.prompts = result.prompts.filter((prompt) =>
						isAllowed("prompts", prompt.name, config.server),
					);
				}

				return result;
			}),

			getPrompt: (name: string, args?: Record<string, string>) =>
				Effect.gen(function* () {
					yield* ensureConnected;

					if (!isAllowed("prompts", name, config.server)) {
						return yield* new FilteredError({ type: "prompt", name });
					}

					return yield* Effect.tryPromise({
						try: () => mcpClient.getPrompt({ name, arguments: args }),
						catch: (error) =>
							new ConnectionError({ message: `Failed to get prompt ${name}`, cause: error }),
					});
				}),

			// Resources
			listResources: Effect.gen(function* () {
				yield* ensureConnected;
				const result = yield* Effect.tryPromise({
					try: () => mcpClient.listResources(),
					catch: (error) => new ConnectionError({ message: "Failed to list resources", cause: error }),
				});

				if (config.server._metadata.allowed?.resources) {
					result.resources = result.resources.filter((resource) =>
						isAllowed("resources", resource.uri, config.server),
					);
				}

				return result;
			}),

			readResource: (uri: string) =>
				Effect.gen(function* () {
					yield* ensureConnected;

					if (!isAllowed("resources", uri, config.server)) {
						return yield* new FilteredError({ type: "resource", name: uri });
					}

					return yield* Effect.tryPromise({
						try: () => mcpClient.readResource({ uri }),
						catch: (error) =>
							new ConnectionError({ message: `Failed to read resource ${uri}`, cause: error }),
					});
				}),
		};

		// Add finalizer to disconnect on scope close
		yield* Effect.addFinalizer(() =>
			Effect.gen(function* () {
				yield* Effect.logInfo("Closing MCP client");
				yield* Effect.ignoreLogged(disconnect);
			}),
		);

		// Connect on creation
		yield* connect;

		return client;
	});

/**
 * Client type from makeClient
 */
export type Client = Effect.Effect.Success<ReturnType<typeof makeClient>>;

/**
 * Promise-based wrapper for ease of use
 */
export class ManagedClient {
	private constructor(
		private readonly client: Client,
		private readonly scope: Scope.CloseableScope,
	) {}

	/**
	 * Create and connect a managed client
	 */
	static async create(config: ClientConfig): Promise<ManagedClient> {
		return Effect.runPromise(
			Effect.gen(function* () {
				const scope = yield* Scope.make();
				const client = yield* Scope.extend(makeClient(config), scope);
				return new ManagedClient(client, scope);
			}),
		);
	}

	/**
	 * Get current connection state
	 */
	async getState(): Promise<ConnectionState> {
		return Effect.runPromise(this.client.getState);
	}

	/**
	 * Disconnect from server and close scope
	 */
	async disconnect(): Promise<void> {
		const scope = this.scope;
		return Effect.runPromise(
			Effect.gen(function* () {
				yield* Scope.close(scope, Exit.void);
			}),
		);
	}

	/**
	 * List available tools
	 */
	async listTools(): Promise<any> {
		return Effect.runPromise(this.client.listTools);
	}

	/**
	 * Call a tool
	 */
	async callTool(name: string, args?: Record<string, unknown>): Promise<any> {
		return Effect.runPromise(this.client.callTool(name, args));
	}

	/**
	 * List available prompts
	 */
	async listPrompts(): Promise<any> {
		return Effect.runPromise(this.client.listPrompts);
	}

	/**
	 * Get a prompt
	 */
	async getPrompt(name: string, args?: Record<string, string>): Promise<any> {
		return Effect.runPromise(this.client.getPrompt(name, args));
	}

	/**
	 * List available resources
	 */
	async listResources(): Promise<any> {
		return Effect.runPromise(this.client.listResources);
	}

	/**
	 * Read a resource
	 */
	async readResource(uri: string): Promise<any> {
		return Effect.runPromise(this.client.readResource(uri));
	}
}
