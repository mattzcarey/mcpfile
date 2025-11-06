import { Data } from "effect";
import type { McpError } from "@modelcontextprotocol/sdk/types.js";

/**
 * Transport-level errors
 * Errors related to transport connection and communication
 */
export class ConnectionFailedError extends Data.TaggedError("ConnectionFailedError")<{
	readonly url?: string;
	readonly command?: string;
	readonly message: string;
	readonly cause?: unknown;
}> {}

export class UnauthorizedError extends Data.TaggedError("UnauthorizedError")<{
	readonly url: string;
	readonly message: string;
	readonly cause?: unknown;
}> {}

export class TransportNotImplementedError extends Data.TaggedError(
	"TransportNotImplementedError",
)<{
	readonly transportType: string;
	readonly url: string;
	readonly message: string;
	readonly cause?: unknown;
}> {}

export class ConnectionClosedError extends Data.TaggedError("ConnectionClosedError")<{
	readonly message: string;
	readonly reason?: string;
}> {}

export class TransportSendError extends Data.TaggedError("TransportSendError")<{
	readonly message: string;
	readonly cause?: unknown;
}> {}

export type TransportError =
	| ConnectionFailedError
	| UnauthorizedError
	| TransportNotImplementedError
	| ConnectionClosedError
	| TransportSendError;

/**
 * Protocol-level errors
 * Errors related to MCP protocol communication
 */
export class TimeoutError extends Data.TaggedError("TimeoutError")<{
	readonly method: string;
	readonly timeoutMs: number;
	readonly message: string;
}> {}

export class MethodNotFoundError extends Data.TaggedError("MethodNotFoundError")<{
	readonly method: string;
	readonly message: string;
	readonly mcpError?: McpError;
}> {}

export class InvalidParamsError extends Data.TaggedError("InvalidParamsError")<{
	readonly method: string;
	readonly message: string;
	readonly mcpError?: McpError;
}> {}

export class InternalProtocolError extends Data.TaggedError("InternalProtocolError")<{
	readonly method?: string;
	readonly message: string;
	readonly code?: number;
	readonly mcpError?: McpError;
}> {}

export class InvalidRequestError extends Data.TaggedError("InvalidRequestError")<{
	readonly message: string;
	readonly mcpError?: McpError;
}> {}

export type ProtocolError =
	| TimeoutError
	| MethodNotFoundError
	| InvalidParamsError
	| InternalProtocolError
	| InvalidRequestError;

/**
 * Lifecycle-related errors
 * Errors during client initialization, discovery, and state management
 */
export class InitializationFailedError extends Data.TaggedError(
	"InitializationFailedError",
)<{
	readonly message: string;
	readonly phase: "connecting" | "initializing" | "negotiating";
	readonly cause?: unknown;
}> {}

export class DiscoveryFailedError extends Data.TaggedError("DiscoveryFailedError")<{
	readonly capability: "tools" | "prompts" | "resources" | "resourceTemplates";
	readonly message: string;
	readonly cause?: unknown;
}> {}

export class AlreadyConnectedError extends Data.TaggedError("AlreadyConnectedError")<{
	readonly message: string;
}> {}

export class NotConnectedError extends Data.TaggedError("NotConnectedError")<{
	readonly message: string;
	readonly operation: string;
}> {}

export class DisposedError extends Data.TaggedError("DisposedError")<{
	readonly message: string;
	readonly operation: string;
}> {}

export class CapabilityNotSupportedError extends Data.TaggedError(
	"CapabilityNotSupportedError",
)<{
	readonly capability: string;
	readonly message: string;
}> {}

export type LifecycleError =
	| InitializationFailedError
	| DiscoveryFailedError
	| AlreadyConnectedError
	| NotConnectedError
	| DisposedError
	| CapabilityNotSupportedError;

/**
 * Client operation errors
 * Errors during specific client operations (tools, prompts, resources)
 */
export class ToolExecutionError extends Data.TaggedError("ToolExecutionError")<{
	readonly toolName: string;
	readonly message: string;
	readonly cause?: unknown;
}> {}

export class ResourceReadError extends Data.TaggedError("ResourceReadError")<{
	readonly uri: string;
	readonly message: string;
	readonly cause?: unknown;
}> {}

export class PromptExecutionError extends Data.TaggedError("PromptExecutionError")<{
	readonly promptName: string;
	readonly message: string;
	readonly cause?: unknown;
}> {}

export class ValidationError extends Data.TaggedError("ValidationError")<{
	readonly operation: string;
	readonly message: string;
	readonly details?: unknown;
}> {}

export type OperationError =
	| ToolExecutionError
	| ResourceReadError
	| PromptExecutionError
	| ValidationError;

/**
 * Union of all client errors
 */
export type ClientError = TransportError | ProtocolError | LifecycleError | OperationError;

/**
 * Helper to convert MCP SDK errors to our error types
 */
export function fromMcpError(error: McpError, context?: { method?: string }): ProtocolError {
	const message = error.message;
	const code = error.code;

	// JSON-RPC error codes
	if (code === -32601) {
		return new MethodNotFoundError({
			method: context?.method ?? "unknown",
			message,
			mcpError: error,
		});
	}

	if (code === -32602) {
		return new InvalidParamsError({
			method: context?.method ?? "unknown",
			message,
			mcpError: error,
		});
	}

	if (code === -32600) {
		return new InvalidRequestError({
			message,
			mcpError: error,
		});
	}

	if (code === -32001) {
		return new TimeoutError({
			method: context?.method ?? "unknown",
			timeoutMs: 0, // Unknown from error
			message,
		});
	}

	// Default to internal error
	return new InternalProtocolError({
		method: context?.method,
		message,
		code,
		mcpError: error,
	});
}

/**
 * Helper to classify errors from transport/network operations
 */
export function classifyTransportError(error: unknown, url?: string): TransportError {
	if (error instanceof Error) {
		const message = error.message.toLowerCase();

		// Check for authorization errors
		if (message.includes("unauthorized") || message.includes("401")) {
			return new UnauthorizedError({
				url: url ?? "unknown",
				message: error.message,
				cause: error,
			});
		}

		// Check for "not implemented" or 404/405 errors
		if (
			message.includes("not implemented") ||
			message.includes("404") ||
			message.includes("405")
		) {
			return new TransportNotImplementedError({
				transportType: "unknown",
				url: url ?? "unknown",
				message: error.message,
				cause: error,
			});
		}

		// Check for connection closed
		if (message.includes("closed") || message.includes("disconnect")) {
			return new ConnectionClosedError({
				message: error.message,
				reason: error.message,
			});
		}
	}

	// Default to connection failed
	return new ConnectionFailedError({
		url,
		message: error instanceof Error ? error.message : "Unknown connection error",
		cause: error,
	});
}
