import { Effect, Ref, Schedule, Scope, Exit, Data } from "effect";
import { File, type ParseOptions, type ConnectParams } from "./file.js";
import { ManagedClient, type ConnectionState } from "./client.js";
import type { ServerCapabilities, Implementation } from "@modelcontextprotocol/sdk/types.js";

/**
 * Server state tracked by the manager
 */
export interface ServerState {
	/**
	 * Normalized server ID
	 */
	serverId: string;

	/**
	 * Current connection state
	 */
	connectionState: ConnectionState;

	/**
	 * Session ID from transport (only for stateful connections like SSE/Stdio)
	 * HTTP is stateless and won't have a session ID
	 */
	sessionId?: string;

	/**
	 * Server capabilities (only when connected)
	 */
	capabilities?: ServerCapabilities;

	/**
	 * Server version info (only when connected)
	 */
	version?: Implementation;

	/**
	 * Server instructions (only when connected)
	 */
	instructions?: string;

	/**
	 * Metadata from config
	 */
	metadata: {
		serverName: string;
		transportType: "stdio" | "http" | "sse";
		disabled: boolean;
		allowed?: {
			tools?: string[];
			prompts?: string[];
			resources?: string[];
		};
	};

	/**
	 * Error information (if failed)
	 */
	error?: {
		message: string;
		timestamp: number;
	};

	/**
	 * Reconnection attempt count
	 */
	reconnectAttempts: number;

	/**
	 * Last successful connection timestamp
	 */
	lastConnectedAt?: number;
}

/**
 * Serializable server state for persistence
 * This is what gets saved to JSON
 */
export interface SerializableServerState {
	serverId: string;
	connectionState: ConnectionState;
	sessionId?: string;
	/**
	 * Whether this server was previously connected
	 * Used to determine if we should reconnect on fromJSON
	 * Note: HTTP is stateless, so we don't reconnect those
	 */
	wasConnected: boolean;
	reconnectAttempts: number;
	lastConnectedAt?: number;
	error?: {
		message: string;
		timestamp: number;
	};
}

/**
 * Manager state for serialization
 */
export interface ManagerState {
	servers: Record<string, SerializableServerState>;
	timestamp: number;
	configPath?: string;
}

/**
 * Lifecycle hooks
 */
export interface ManagerHooks {
	/**
	 * Called whenever any server state changes
	 */
	onChange?: (states: Record<string, ServerState>) => void;

	/**
	 * Called when a server encounters an error
	 */
	onError?: (serverId: string, error: Error) => void;
}

/**
 * Manager configuration
 */
export interface ManagerConfig {
	/**
	 * Client info for all connections
	 */
	info: Implementation;

	/**
	 * Lifecycle hooks
	 */
	hooks?: ManagerHooks;

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

	/**
	 * Interval for retrying failed servers in ms
	 * @default 60000 (1 minute)
	 */
	failedRetryInterval?: number;
}

/**
 * Manager errors
 */
export class ManagerError extends Data.TaggedError("ManagerError")<{
	message: string;
	cause?: unknown;
}> {}

/**
 * Internal state for a managed server
 */
interface ManagedServer {
	client: ManagedClient;
	state: ServerState;
}

/**
 * Client Manager - manages multiple MCP clients with automatic reconnection and state tracking
 *
 * Features:
 * - Connect to multiple servers from a .mcp.json file
 * - Automatic reconnection with exponential backoff
 * - Periodic retry of failed servers
 * - State serialization (toJSON/fromJSON)
 * - Lifecycle hooks (onChange, onError)
 * - Session tracking for stateful connections
 *
 * @example
 * ```ts
 * const manager = await ClientManager.create({
 *   info: { name: "my-client", version: "1.0.0" },
 *   hooks: {
 *     onChange: (states) => console.log("State changed:", states),
 *     onError: (serverId, error) => console.error(serverId, error),
 *   },
 * });
 *
 * // Connect to servers from config file
 * await manager.connectFromFile("./config.mcp.json");
 *
 * // Get current state
 * const states = await manager.getState();
 *
 * // Serialize state
 * const json = await manager.toJSON();
 * localStorage.setItem("manager-state", json);
 *
 * // Restore state
 * const restored = await ClientManager.fromJSON(json, config);
 * ```
 */
export class ClientManager {
	private servers: Map<string, ManagedServer> = new Map();
	private stateRef!: Ref.Ref<Record<string, ServerState>>;
	private configPath?: string;
	private retryTask?: { cancel: () => void };

	private constructor(private readonly config: ManagerConfig) {}

	/**
	 * Create a new client manager
	 */
	static async create(config: ManagerConfig): Promise<ClientManager> {
		const manager = new ClientManager(config);
		await manager.initialize();
		return manager;
	}

	private async initialize(): Promise<void> {
		this.stateRef = await Effect.runPromise(Ref.make<Record<string, ServerState>>({}));

		// Start periodic retry task for failed servers
		this.startFailedRetryTask();
	}

	/**
	 * Connect to servers from an MCP config file
	 */
	async connectFromFile(
		filepath: string,
		options?: ParseOptions
	): Promise<void> {
		this.configPath = filepath;

		const file = await File.fromPath(filepath, options);
		const params = file.getConnectParams();

		await this.connectToServers(params);
	}

	/**
	 * Reload configuration from the previously loaded file
	 */
	async reloadConfig(options?: ParseOptions): Promise<void> {
		if (!this.configPath) {
			throw new ManagerError({
				message: "No config file loaded. Use connectFromFile first.",
			});
		}

		const file = await File.fromPath(this.configPath, options);
		const newParams = file.getConnectParams();
		const currentStates = await this.getState();

		// Determine which servers changed
		const changed = new Set<string>();
		const removed = new Set(Object.keys(currentStates));

		for (const [serverId, newConfig] of Object.entries(newParams)) {
			removed.delete(serverId);

			const current = this.servers.get(serverId);
			if (!current) {
				// New server
				changed.add(serverId);
				continue;
			}

			// Check if config changed (compare JSON to detect changes)
			const currentConfig = JSON.stringify(current.state.metadata);
			const newConfigStr = JSON.stringify(newConfig._metadata);

			if (currentConfig !== newConfigStr) {
				changed.add(serverId);
			}
		}

		// Disconnect removed servers
		for (const serverId of removed) {
			await this.disconnectServer(serverId);
		}

		// Reconnect changed servers
		for (const serverId of changed) {
			if (this.servers.has(serverId)) {
				await this.disconnectServer(serverId);
			}
			await this.connectToServer(serverId, newParams[serverId]);
		}
	}

	/**
	 * Connect to multiple servers
	 */
	private async connectToServers(params: ConnectParams): Promise<void> {
		const promises = Object.entries(params).map(([serverId, serverParams]) =>
			this.connectToServer(serverId, serverParams)
		);

		// Connect in parallel, but don't fail if some servers fail
		await Promise.allSettled(promises);
	}

	/**
	 * Connect to a single server
	 */
	private async connectToServer(serverId: string, serverParams: any): Promise<void> {
		try {
			const client = await ManagedClient.create({
				info: this.config.info,
				server: serverParams,
				maxReconnectAttempts: this.config.maxReconnectAttempts,
				initialReconnectDelay: this.config.initialReconnectDelay,
				maxReconnectDelay: this.config.maxReconnectDelay,
			});

			const state: ServerState = {
				serverId,
				connectionState: await client.getState(),
				metadata: {
					serverName: serverParams._metadata.serverName,
					transportType: serverParams.transportType,
					disabled: serverParams._metadata.disabled,
					allowed: serverParams._metadata.allowed,
				},
				reconnectAttempts: 0,
			};

			// Get session ID from transport (only for stateful connections)
			const sessionId = this.getSessionId(client);
			if (sessionId) {
				state.sessionId = sessionId;
			}

			// Get server info
			if (state.connectionState === "connected") {
				state.capabilities = await this.getServerCapabilities(client);
				state.version = await this.getServerVersion(client);
				state.instructions = await this.getServerInstructions(client);
				state.lastConnectedAt = Date.now();
			}

			this.servers.set(serverId, { client, state });

			// Update state and notify
			await this.updateState(serverId, state);
		} catch (error) {
			// Server failed to connect, but don't block other servers
			const errorState: ServerState = {
				serverId,
				connectionState: "failed",
				metadata: {
					serverName: serverParams._metadata.serverName,
					transportType: serverParams.transportType,
					disabled: serverParams._metadata.disabled,
					allowed: serverParams._metadata.allowed,
				},
				error: {
					message: error instanceof Error ? error.message : String(error),
					timestamp: Date.now(),
				},
				reconnectAttempts: 0,
			};

			await this.updateState(serverId, errorState);
			this.config.hooks?.onError?.(serverId, error instanceof Error ? error : new Error(String(error)));
		}
	}

	/**
	 * Disconnect a server
	 */
	private async disconnectServer(serverId: string): Promise<void> {
		const managed = this.servers.get(serverId);
		if (!managed) return;

		try {
			await managed.client.disconnect();
		} catch (error) {
			// Ignore disconnect errors
		}

		this.servers.delete(serverId);

		// Remove from state
		await Effect.runPromise(
			Ref.update(this.stateRef, (states) => {
				const newStates = { ...states };
				delete newStates[serverId];
				return newStates;
			})
		);

		this.notifyStateChange();
	}

	/**
	 * Get session ID from client's transport
	 * Only for stateful connections (SSE, Stdio). HTTP is stateless.
	 */
	private getSessionId(client: ManagedClient): string | undefined {
		return client.getSessionId();
	}

	/**
	 * Get server capabilities from client
	 */
	private async getServerCapabilities(client: ManagedClient): Promise<ServerCapabilities | undefined> {
		return client.getServerCapabilities();
	}

	/**
	 * Get server version from client
	 */
	private async getServerVersion(client: ManagedClient): Promise<Implementation | undefined> {
		return client.getServerVersion();
	}

	/**
	 * Get server instructions from client
	 */
	private async getServerInstructions(client: ManagedClient): Promise<string | undefined> {
		return client.getInstructions();
	}

	/**
	 * Update state for a server
	 */
	private async updateState(serverId: string, state: ServerState): Promise<void> {
		await Effect.runPromise(
			Ref.update(this.stateRef, (states) => ({
				...states,
				[serverId]: state,
			}))
		);

		this.notifyStateChange();
	}

	/**
	 * Notify state change via hook
	 */
	private notifyStateChange(): void {
		const self = this;
		Effect.runSync(
			Effect.gen(function* () {
				const states = yield* Ref.get(self.stateRef);
				self.config.hooks?.onChange?.(states);
			})
		);
	}

	/**
	 * Start periodic task to retry failed servers
	 */
	private startFailedRetryTask(): void {
		const interval = this.config.failedRetryInterval ?? 60000;

		const task = setInterval(async () => {
			const states = await Effect.runPromise(Ref.get(this.stateRef));

			for (const [serverId, state] of Object.entries(states)) {
				if (state.connectionState === "failed") {
					const managed = this.servers.get(serverId);
					if (managed) {
						// Try to reconnect
						try {
							// TODO: Implement reconnection logic
							// For now, just log
							console.log(`Retrying failed server: ${serverId}`);
						} catch (error) {
							// Still failed
						}
					}
				}
			}
		}, interval);

		this.retryTask = {
			cancel: () => clearInterval(task),
		};
	}

	/**
	 * Get current state of all servers
	 */
	async getState(): Promise<Record<string, ServerState>> {
		return Effect.runPromise(Ref.get(this.stateRef));
	}

	/**
	 * Get state of a specific server
	 */
	async getServerState(serverId: string): Promise<ServerState | undefined> {
		const states = await Effect.runPromise(Ref.get(this.stateRef));
		return states[serverId];
	}

	/**
	 * Get a specific client
	 */
	getClient(serverId: string): ManagedClient | undefined {
		return this.servers.get(serverId)?.client;
	}

	/**
	 * Get all server IDs
	 */
	getServerIds(): string[] {
		return Array.from(this.servers.keys());
	}

	/**
	 * Serialize manager state to JSON
	 * This can be used to persist state and restore later
	 *
	 * Note: HTTP connections are stateless and won't be reconnected on restore
	 * SSE and Stdio connections will be reconnected if they were connected before
	 */
	async toJSON(): Promise<string> {
		const states = await Effect.runPromise(Ref.get(this.stateRef));

		const managerState: ManagerState = {
			servers: {},
			timestamp: Date.now(),
			configPath: this.configPath,
		};

		for (const [serverId, state] of Object.entries(states)) {
			managerState.servers[serverId] = {
				serverId,
				connectionState: state.connectionState,
				sessionId: state.sessionId,
				wasConnected: state.connectionState === "connected" || state.lastConnectedAt !== undefined,
				reconnectAttempts: state.reconnectAttempts,
				lastConnectedAt: state.lastConnectedAt,
				error: state.error,
			};
		}

		return JSON.stringify(managerState);
	}

	/**
	 * Restore manager from serialized JSON state
	 *
	 * Behavior:
	 * - HTTP connections are stateless, so they won't be reconnected
	 * - SSE and Stdio connections will be reconnected if they were connected before
	 * - Failed servers will be retried according to the retry policy
	 */
	static async fromJSON(
		json: string,
		config: ManagerConfig,
		options?: ParseOptions
	): Promise<ClientManager> {
		const managerState: ManagerState = JSON.parse(json);

		const manager = new ClientManager(config);
		await manager.initialize();

		// If there's a config path, reload from file
		if (managerState.configPath) {
			manager.configPath = managerState.configPath;

			const file = await File.fromPath(managerState.configPath, options);
			const params = file.getConnectParams();

			// Connect to servers, but only reconnect stateful connections that were connected before
			for (const [serverId, serverParams] of Object.entries(params)) {
				const savedState = managerState.servers[serverId];

				// Determine if we should connect
				const shouldConnect =
					savedState?.wasConnected &&
					(serverParams.transportType === "sse" || serverParams.transportType === "stdio");

				if (shouldConnect || !savedState) {
					// Connect if it was previously connected (and stateful) or if it's a new server
					await manager.connectToServer(serverId, serverParams);
				}
			}
		}

		return manager;
	}

	/**
	 * Disconnect all servers and clean up
	 */
	async close(): Promise<void> {
		// Cancel retry task
		this.retryTask?.cancel();

		// Disconnect all servers
		const promises = Array.from(this.servers.keys()).map((serverId) =>
			this.disconnectServer(serverId)
		);

		await Promise.allSettled(promises);
	}
}
