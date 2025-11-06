/**
 * ClientManager Example: Managing Multiple MCP Servers
 *
 * This example demonstrates:
 * - Creating a ClientManager with multiple servers
 * - Using lifecycle hooks (onChange, onError)
 * - Getting state for all servers
 * - Serializing/deserializing manager state
 * - Accessing individual clients to make requests
 * - Graceful shutdown
 */

import { ClientManager } from "mcpfile";
import { join } from "node:path";

async function main() {
	console.log("=== ClientManager Example: Multiple Servers ===\n");

	// Track state changes
	let changeCount = 0;

	// Create manager with hooks
	console.log("Creating ClientManager with hooks...");
	const manager = await ClientManager.create({
		info: {
			name: "multi-server-example",
			version: "1.0.0",
		},
		hooks: {
			// Called whenever any server state changes
			onChange: (states) => {
				changeCount++;
				console.log(`\n[onChange #${changeCount}] State changed:`);
				for (const [serverId, state] of Object.entries(states)) {
					console.log(`  - ${serverId}: ${state.connectionState}${state.sessionId ? ` (session: ${state.sessionId})` : " (stateless)"}`);
				}
			},

			// Called when a server encounters an error
			onError: (serverId, error) => {
				console.error(`\n[onError] Server ${serverId} error:`, error.message);
			},
		},
		maxReconnectAttempts: 3,
		failedRetryInterval: 30000, // Retry failed servers every 30s
	});

	// Connect to servers from config file
	console.log("\nConnecting to servers from .mcp.json...");
	const configPath = join(import.meta.dirname, "..", ".mcp.json");
	await manager.connectFromFile(configPath);

	// Wait a moment for connections to establish
	await new Promise((resolve) => setTimeout(resolve, 2000));

	// Get current state
	console.log("\n=== Current State ===");
	const states = await manager.getState();
	for (const [serverId, state] of Object.entries(states)) {
		console.log(`\nServer: ${serverId}`);
		console.log(`  Connection: ${state.connectionState}`);
		console.log(`  Transport: ${state.metadata.transportType}`);
		console.log(`  Session ID: ${state.sessionId ?? "N/A (stateless)"}`);

		if (state.version) {
			console.log(`  Server: ${state.version.name} v${state.version.version}`);
		}

		if (state.capabilities) {
			console.log(`  Capabilities:`);
			if (state.capabilities.tools) {
				console.log(`    - Tools: ${JSON.stringify(state.capabilities.tools)}`);
			}
			if (state.capabilities.prompts) {
				console.log(`    - Prompts: ${JSON.stringify(state.capabilities.prompts)}`);
			}
			if (state.capabilities.resources) {
				console.log(`    - Resources: ${JSON.stringify(state.capabilities.resources)}`);
			}
		}

		if (state.error) {
			console.log(`  Error: ${state.error.message}`);
		}
	}

	// Access individual clients to make requests
	console.log("\n=== Making Requests ===");
	const serverIds = manager.getServerIds();

	for (const serverId of serverIds) {
		const client = manager.getClient(serverId);
		if (!client) {
			console.log(`\n${serverId}: No client available`);
			continue;
		}

		try {
			console.log(`\n${serverId}: Listing tools...`);
			const tools = await client.listTools();
			console.log(`  Found ${tools.tools.length} tools:`);
			for (const tool of tools.tools.slice(0, 3)) { // Show first 3
				console.log(`    - ${tool.name}: ${tool.description}`);
			}
			if (tools.tools.length > 3) {
				console.log(`    ... and ${tools.tools.length - 3} more`);
			}
		} catch (error) {
			console.log(`  Error: ${error instanceof Error ? error.message : error}`);
		}

		try {
			console.log(`\n${serverId}: Listing resources...`);
			const resources = await client.listResources();
			console.log(`  Found ${resources.resources.length} resources:`);
			for (const resource of resources.resources.slice(0, 3)) { // Show first 3
				console.log(`    - ${resource.uri}: ${resource.name}`);
			}
			if (resources.resources.length > 3) {
				console.log(`    ... and ${resources.resources.length - 3} more`);
			}
		} catch (error) {
			console.log(`  Error: ${error instanceof Error ? error.message : error}`);
		}
	}

	// Serialize state
	console.log("\n=== State Serialization ===");
	const serialized = await manager.toJSON();
	console.log("Serialized state (for persistence):");
	const parsed = JSON.parse(serialized);
	console.log(`  Timestamp: ${new Date(parsed.timestamp).toISOString()}`);
	console.log(`  Config path: ${parsed.configPath}`);
	console.log(`  Servers: ${Object.keys(parsed.servers).length}`);
	console.log(`  Sample: ${JSON.stringify(parsed.servers, null, 2).slice(0, 200)}...`);

	// Demonstrate restoration (would normally be in a separate process)
	console.log("\n=== State Restoration Demo ===");
	console.log("Note: HTTP connections are stateless and won't be reconnected on restore.");
	console.log("SSE/Stdio connections would be reconnected if they were previously connected.");

	// Close the manager
	console.log("\n=== Cleanup ===");
	console.log("Closing manager and disconnecting all servers...");
	await manager.close();
	console.log("Manager closed successfully!");

	console.log(`\nTotal state changes: ${changeCount}`);
	console.log("\n=== Example Complete ===");
}

main().catch((error) => {
	console.error("Error:", error);
	process.exit(1);
});
