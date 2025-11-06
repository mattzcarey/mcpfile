/**
 * Basic Example: Single no auth MCP Server using our Client and File
 */

import { File, ManagedClient } from "mcpfile";
import { join } from "node:path";

async function main() {
	// Load MCP configuration
	const configPath = join(import.meta.dirname, "..", ".mcp.json");
	const file = await File.fromPath(configPath);

	// Get connection parameters for all servers
	const params = file.getConnectParams();

	// Connect to the cloudflare-docs server
	const serverParams = params["cloudflare-docs"];
	if (!serverParams) {
		throw new Error("Server 'cloudflare-docs' not found in config");
	}

	console.log("Creating client...");
	const client = await ManagedClient.create({
		info: {
			name: "example-client",
			version: "1.0.0",
		},
		server: serverParams,
	});

	console.log("Connected! Connection state:", await client.getState());

	// List available tools
	try {
		console.log("\nListing tools...");
		const tools = await client.listTools();
		console.log(`Found ${tools.tools.length} tools:`);
		for (const tool of tools.tools) {
			console.log(`  - ${tool.name}: ${tool.description}`);
		}
	} catch (error) {
		console.log("Tools not supported or error:", error instanceof Error ? error.message : error);
	}

	// List available prompts
	try {
		console.log("\nListing prompts...");
		const prompts = await client.listPrompts();
		console.log(`Found ${prompts.prompts.length} prompts:`);
		for (const prompt of prompts.prompts) {
			console.log(`  - ${prompt.name}: ${prompt.description}`);
		}
	} catch (error) {
		console.log("Prompts not supported or error:", error instanceof Error ? error.message : error);
	}

	// List available resources
	try {
		console.log("\nListing resources...");
		const resources = await client.listResources();
		console.log(`Found ${resources.resources.length} resources:`);
		for (const resource of resources.resources) {
			console.log(`  - ${resource.uri}: ${resource.name}`);
		}
	} catch (error) {
		console.log("Resources not supported or error:", error instanceof Error ? error.message : error);
	}

	// Disconnect
	console.log("\nDisconnecting...");
	await client.disconnect();
	console.log("Disconnected! Final state:", await client.getState());
}

main().catch(console.error);
