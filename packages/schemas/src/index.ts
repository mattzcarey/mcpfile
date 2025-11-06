import { z } from "zod";

/**
 * Allowed lists for tools, prompts, and resources
 */
export const AllowedSchema = z.object({
  tools: z.array(z.string()).optional(),
  prompts: z.array(z.string()).optional(),
  resources: z.array(z.string()).optional(),
});

export type Allowed = z.infer<typeof AllowedSchema>;

/**
 * Base server configuration shared by all server types
 */
export const BaseServerConfigSchema = z.object({
  disabled: z.boolean().default(false),
  allowed: AllowedSchema.optional(),
  env: z.record(z.string(), z.string()).optional(),
  envFile: z.string().optional(),
});

export type BaseServerConfig = z.infer<typeof BaseServerConfigSchema>;

/**
 * HTTP server configuration
 */
export const HttpServerConfigSchema = BaseServerConfigSchema.extend({
  type: z.string().default("http"),
  url: z.url(),
  headers: z.record(z.string(), z.string()).optional(),
});

export type HttpServerConfig = z.infer<typeof HttpServerConfigSchema>;

/**
 * Stdio server configuration
 */
export const StdioServerConfigSchema = BaseServerConfigSchema.extend({
  type: z.string().default("stdio"),
  command: z.string(),
  args: z.array(z.string()).optional(),
  cwd: z.string().optional(),
});

export type StdioServerConfig = z.infer<typeof StdioServerConfigSchema>;

/**
 * Server configuration - either HTTP or Stdio
 * Preprocesses to add type field if missing
 */
export const ServerConfigSchema = z.preprocess((val) => {
	if (typeof val === "object" && val !== null) {
		const config = val as Record<string, unknown>;

		// If type is already set, leave it
		if ("type" in config && config.type) {
			return config;
		}

		// Determine type based on fields
		if ("url" in config) {
			return { ...config, type: "http" };
		}

		if ("command" in config) {
			return { ...config, type: "stdio" };
		}
	}

	return val;
}, z.union([HttpServerConfigSchema, StdioServerConfigSchema]));

export type ServerConfig = z.infer<typeof ServerConfigSchema>;

/**
 * MCP file configuration
 */
export const McpFileConfigSchema = z.object({
  mcpServers: z.record(z.string(), ServerConfigSchema),
});

export type McpFileConfig = z.infer<typeof McpFileConfigSchema>;

/**
 * JSON Schema representation of the MCP file format
 */
export const mcpFileJsonSchema = z.toJSONSchema(McpFileConfigSchema);

/**
 * Validate an MCP file configuration
 */
export function validateMcpFile(data: unknown): McpFileConfig {
  return McpFileConfigSchema.parse(data);
}

/**
 * Safely validate an MCP file configuration
 */
export function safeParseMcpFile(data: unknown) {
  return McpFileConfigSchema.safeParse(data);
}
