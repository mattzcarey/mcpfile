import { Effect, Data } from "effect";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { homedir } from "node:os";
import type { StdioServerParameters } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { RequestOptions } from "@modelcontextprotocol/sdk/shared/protocol.js";
import {
  ServerConfigSchema,
  type ServerConfig,
  type McpFileConfig,
  type Allowed,
} from "@mcpfile/schemas";
import type { StreamableHTTPClientTransportOptions } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { SSEClientTransportOptions } from "@modelcontextprotocol/sdk/client/sse.js";

/**
 * Parser errors
 */
export class FileNotFoundError extends Data.TaggedError("FileNotFoundError")<{
  readonly path: string;
  readonly cause?: unknown;
}> {}

export class ParseError extends Data.TaggedError("ParseError")<{
  readonly path: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly serverId: string;
  readonly message: string;
  readonly errors: ReadonlyArray<string>;
}> {}

export class InterpolationError extends Data.TaggedError("InterpolationError")<{
  readonly variable: string;
  readonly message: string;
}> {}

export type ConfigError =
  | FileNotFoundError
  | ParseError
  | ValidationError
  | InterpolationError;

export type HttpTransportConfig = {
  url: URL;
  opts?: StreamableHTTPClientTransportOptions;
};

export type SseTransportConfig = {
  url: URL;
  opts?: SSEClientTransportOptions;
};

/**
 * Transport - either HTTP, SSE, or Stdio, ready to pass to MCP SDK
 */
export type TransportConfig =
  | StdioServerParameters
  | HttpTransportConfig
  | SseTransportConfig;

/**
 * Internal metadata (not passed to directly to SDK). Will be iterated on in the future and liable to change.
 */
export interface ServerMetadata {
  /**
   * MCPFile version
   */
  version: string;

  /**
   * Raw config before interpolation
   */
  rawConfig: Record<string, unknown>;

	/**
	 * Normalized server name
	 */
	serverName: string;

  /**
   * Transport type
   */
  transportType: "stdio" | "http" | "sse";

  /**
   * Whether this server is disabled
   */
  disabled: boolean;

  /**
   * Allowed tools, prompts, and resources
   */
  allowed?: Allowed;
}

/**
 * Connection parameters for a single server
 */
export interface ServerConnectParams {
  /**
   * Transport config - ready to pass to MCP SDK transport constructors
   * - For stdio: pass to `new StdioClientTransport(transportConfig)`
   * - For http: pass to `new StreamableHTTPClientTransport(transportConfig)`
   * - For sse: pass to `new SSEClientTransport(transportConfig)`
   */
  transportConfig: TransportConfig;

  /**
   * Request options to pass to client.connect(transport, options)
   */
  options?: RequestOptions;

  /**
   * Internal metadata for mcpfile
   */
  _metadata: ServerMetadata;
}

/**
 * All connection parameters keyed by server ID
 */
export type ConnectParams = Record<string, ServerConnectParams>;

/**
 * Parse options
 */
export interface ParseOptions {
  /**
   * Include disabled servers
   * @default false
   */
  includeDisabled?: boolean;

  /**
   * Workspace folder for ${workspaceFolder} interpolation
   * Defaults to directory containing the config file
   */
  workspaceFolder?: string;

  /**
   * Custom environment variables for ${env:VAR} interpolation
   * Falls back to process.env if not provided
   */
  env?: Record<string, string>;
}

/**
 * Interpolate variables in a string
 */
function interpolateValue(
  value: string,
  options: ParseOptions
): Effect.Effect<string, InterpolationError> {
  return Effect.gen(function* () {
    const env = options.env ?? process.env;
    let result = value;

    const matches = result.matchAll(/\$\{([^}]+)\}/g);

    for (const match of matches) {
      const placeholder = match[0];
      const variable = match[1];

      if (variable.startsWith("env:")) {
        const envVar = variable.slice(4);
        const envValue = env[envVar];

        if (envValue === undefined) {
          return yield* new InterpolationError({
            variable: envVar,
            message: `Environment variable ${envVar} is not defined`,
          });
        }

        result = result.replace(placeholder, envValue);
      } else if (variable === "userHome") {
        result = result.replace(placeholder, homedir());
      } else if (variable === "workspaceFolder") {
        if (!options.workspaceFolder) {
          return yield* new InterpolationError({
            variable: "workspaceFolder",
            message: "workspaceFolder is not defined in parse options",
          });
        }
        result = result.replace(placeholder, options.workspaceFolder);
      } else {
        return yield* new InterpolationError({
          variable,
          message: `Unknown interpolation variable: ${variable}`,
        });
      }
    }

    return result;
  });
}

/**
 * Recursively interpolate variables in a value
 */
function interpolate(
  value: unknown,
  options: ParseOptions
): Effect.Effect<unknown, InterpolationError> {
  if (typeof value === "string") {
    return interpolateValue(value, options);
  }
  if (Array.isArray(value)) {
    return Effect.all(value.map((v) => interpolate(v, options)));
  }
  if (value && typeof value === "object") {
    return Effect.all(
      Object.entries(value).map(([k, v]) =>
        Effect.map(interpolate(v, options), (interpolated) => [k, interpolated])
      )
    ).pipe(Effect.map((entries) => Object.fromEntries(entries)));
  }
  return Effect.succeed(value);
}

/**
 * Validate and parse server configuration using Zod
 * Returns the parsed config with defaults applied
 */
function validateServerConfig(
  serverId: string,
  config: ServerConfig
): Effect.Effect<ServerConfig, ValidationError> {
  return Effect.gen(function* () {
    const result = ServerConfigSchema.safeParse(config);

    if (!result.success) {
      return yield* new ValidationError({
        serverId,
        message: "Server configuration validation failed",
        errors: result.error.issues.map(
          (e) => `${e.path.join(".")}: ${e.message}`
        ),
      });
    }

    return result.data;
  });
}

/**
 * Convert server config to transport
 */
function configToTransport(
  serverId: string,
  config: ServerConfig
): Effect.Effect<
  { transportConfig: TransportConfig; transportType: "stdio" | "http" | "sse" },
  never
> {
  return Effect.gen(function* () {
    // Use the type field from parsed config (defaults are applied by schema)
    const serverType = config.type;

    if (serverType === "http") {
      // HTTP server
      if (!("url" in config)) {
        return yield* Effect.die(`HTTP server ${serverId} missing url field`);
      }

      const transportConfig: HttpTransportConfig = {
        url: new URL(config.url),
        opts: config.headers ? { requestInit: { headers: config.headers } } : undefined,
      };

      return { transportConfig, transportType: "http" as const };
    }

    if (serverType === "sse") {
      // SSE server
      if (!("url" in config)) {
        return yield* Effect.die(`SSE server ${serverId} missing url field`);
      }

      const transportConfig: SseTransportConfig = {
        url: new URL(config.url),
        opts: config.headers ? { requestInit: { headers: config.headers } } : undefined,
      };

      return { transportConfig, transportType: "sse" as const };
    }

    if (serverType === "stdio") {
      // Stdio server
      if (!("command" in config)) {
        return yield* Effect.die(
          `Stdio server ${serverId} missing command field`
        );
      }

      const envVars: Record<string, string> = {};

      // Copy process.env
      for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined) {
          envVars[key] = value;
        }
      }

      // Merge with config.env
      if (config.env) {
        Object.assign(envVars, config.env);
      }

      const transportConfig: StdioServerParameters = {
        command: config.command,
        args: config.args,
        env: envVars,
        cwd: config.cwd,
      };

      return { transportConfig, transportType: "stdio" as const };
    }

    return yield* Effect.die(
      `Unknown server type "${serverType}" for ${serverId}`
    );
  });
}

/**
 * MCP File - represents a parsed .mcp.json configuration
 *
 * @example
 * ```ts
 * import { File } from "mcpfile";
 * import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
 * import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
 * import { Client } from "@modelcontextprotocol/sdk/client/index.js";
 *
 * // Load from file
 * const file = await File.fromPath("./config.mcp.json");
 *
 * // Get connection parameters
 * const params = file.getConnectParams();
 *
 * // Connect to all servers
 * for (const [serverId, { transport, options, metadata }] of Object.entries(params)) {
 *   const mcpTransport = transport.type === "stdio"
 *     ? new StdioClientTransport(transport)
 *     : new StreamableHTTPClientTransport(transport.url);
 *
 *   const client = new Client({ name: "my-app", version: "1.0.0" });
 *   await client.connect(mcpTransport, options);
 *
 *   console.log(`Connected to ${serverId}`);
 * }
 * ```
 */
export class File {
  private constructor(private readonly params: ConnectParams) {}

  /**
   * Load and parse an MCP configuration file
   */
  static async fromPath(
    filepath: string,
    options: ParseOptions = {}
  ): Promise<File> {
    return Effect.runPromise(
      Effect.gen(function* () {
        const absolutePath = resolve(filepath);

        const workspaceFolder =
          options.workspaceFolder ?? dirname(absolutePath);
        const parseOptions: ParseOptions = {
          ...options,
          workspaceFolder,
        };

        const content = yield* Effect.tryPromise({
          try: () => readFile(absolutePath, "utf-8"),
          catch: (error) =>
            error &&
            typeof error === "object" &&
            "code" in error &&
            error.code === "ENOENT"
              ? new FileNotFoundError({ path: absolutePath, cause: error })
              : new ParseError({
                  path: absolutePath,
                  message: "Failed to read file",
                  cause: error,
                }),
        });

        const json = yield* Effect.try({
          try: () => JSON.parse(content),
          catch: (error) =>
            new ParseError({
              path: absolutePath,
              message: error instanceof Error ? error.message : "Invalid JSON",
              cause: error,
            }),
        });

        return yield* Effect.promise(() => File.fromJson(json, parseOptions));
      })
    );
  }

  /**
   * Parse an MCP configuration from a JSON object
   */
  static async fromJson(
    json: unknown,
    options: ParseOptions = {}
  ): Promise<File> {
    return Effect.runPromise(
      Effect.gen(function* () {
        const parsed = json as McpFileConfig;

        if (!parsed.mcpServers || typeof parsed.mcpServers !== "object") {
          return yield* new ValidationError({
            serverId: "<root>",
            message: "Invalid config structure",
            errors: ["mcpServers field is required and must be an object"],
          });
        }

        const params: ConnectParams = {};

        for (const [serverId, config] of Object.entries(parsed.mcpServers)) {
          // Store rawConfig before validation/defaults
          const rawConfig = config as Record<string, unknown>;

          // Validate and parse to apply defaults
          const parsedConfig = yield* validateServerConfig(serverId, config);

          if (parsedConfig.disabled && !options.includeDisabled) {
            continue;
          }

          const interpolatedConfig = (yield* interpolate(
            parsedConfig,
            options
          )) as ServerConfig;

          const { transportConfig, transportType } = yield* configToTransport(
            serverId,
            interpolatedConfig
          );

          params[serverId] = {
            transportConfig,
            options: undefined,
            _metadata: {
              version: "0.0.1",
              rawConfig,
              serverName: serverId,
              transportType,
              disabled: parsedConfig.disabled ?? false,
              allowed: parsedConfig.allowed,
            },
          };
        }

        return new File(params);
      })
    );
  }

  /**
   * Get connection parameters for all servers
   * Returns an object keyed by server ID
   */
  getConnectParams(): ConnectParams {
    return this.params;
  }

  /**
   * Get connection parameters for a specific server
   */
  getServer(serverId: string): ServerConnectParams | undefined {
    return this.params[serverId];
  }

  /**
   * Get all server IDs
   */
  getServerIds(): string[] {
    return Object.keys(this.params);
  }
}
