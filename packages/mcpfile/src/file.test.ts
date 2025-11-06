import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { File, type HttpTransportConfig } from "./file.js";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { homedir } from "node:os";

describe("File", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(
      tmpdir(),
      `mcpfile-file-test-${Date.now()}-${Math.random()
        .toString(36)
        .substring(7)}`
    );
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("HTTP Transport", () => {
    it("should parse HTTP server with URL", async () => {
      const file = await File.fromJson({
        mcpServers: {
          "my-server": {
            url: "https://example.com/mcp",
          },
        },
      });

      const params = file.getConnectParams();
      const server = params["my-server"];

      expect(server.transportConfig).toMatchObject({
        url: new URL("https://example.com/mcp"),
      });
      expect(server._metadata.transportType).toBe("http");
      expect(server._metadata.serverName).toBe("my-server");
      expect(server._metadata.version).toBeDefined();
    });

    it("should parse HTTP server with headers", async () => {
      const file = await File.fromJson({
        mcpServers: {
          "my-server": {
            url: "https://example.com/mcp",
            headers: {
              Authorization: "Bearer token",
            },
          },
        },
      });

      const params = file.getConnectParams();
      const config = params["my-server"].transportConfig as HttpTransportConfig;

      expect(config.opts?.requestInit?.headers).toEqual({
        Authorization: "Bearer token",
      });
    });
  });

  describe("SSE Transport", () => {
    it("should parse SSE server", async () => {
      const file = await File.fromJson({
        mcpServers: {
          "my-server": {
            type: "sse",
            url: "https://example.com/sse",
          },
        },
      });

      const params = file.getConnectParams();
      expect(params["my-server"]._metadata.transportType).toBe("sse");
    });
  });

  describe("Stdio Transport", () => {
    it("should parse stdio server", async () => {
      const file = await File.fromJson({
        mcpServers: {
          "my-server": {
            command: "python",
            args: ["server.py"],
          },
        },
      });

      const params = file.getConnectParams();
      const server = params["my-server"];
      const config = server.transportConfig as any;

      expect(server._metadata.transportType).toBe("stdio");
      expect(config.command).toBe("python");
      expect(config.args).toEqual(["server.py"]);
    });

    it("should include environment variables", async () => {
      const file = await File.fromJson({
        mcpServers: {
          "my-server": {
            command: "node",
            args: ["server.js"],
            env: {
              API_KEY: "test-key",
            },
          },
        },
      });

      const params = file.getConnectParams();
      const config = params["my-server"].transportConfig as any;

      expect(config.env?.API_KEY).toBe("test-key");
      expect(config.env?.PATH).toBeDefined(); // Should include process.env
    });
  });

  describe("Metadata", () => {
    it("should include rawConfig in metadata", async () => {
      const rawConfig = {
        url: "https://example.com/mcp",
        headers: { Authorization: "Bearer token" },
      };

      const file = await File.fromJson({
        mcpServers: {
          "my-server": rawConfig,
        },
      });

      const params = file.getConnectParams();
      expect(params["my-server"]._metadata.rawConfig).toEqual(rawConfig);
    });

    it("should include allowed in metadata", async () => {
      const file = await File.fromJson({
        mcpServers: {
          "my-server": {
            url: "https://example.com/mcp",
            allowed: {
              tools: ["tool1"],
              prompts: ["prompt1"],
              resources: ["resource1"],
            },
          },
        },
      });

      const params = file.getConnectParams();
      expect(params["my-server"]._metadata.allowed).toEqual({
        tools: ["tool1"],
        prompts: ["prompt1"],
        resources: ["resource1"],
      });
    });

    it("should mark disabled servers in metadata", async () => {
      const file = await File.fromJson(
        {
          mcpServers: {
            "my-server": {
              url: "https://example.com/mcp",
              disabled: true,
            },
          },
        },
        { includeDisabled: true }
      );

      const params = file.getConnectParams();
      expect(params["my-server"]._metadata.disabled).toBe(true);
    });
  });

  describe("Disabled Servers", () => {
    it("should skip disabled servers by default", async () => {
      const file = await File.fromJson({
        mcpServers: {
          "enabled-server": {
            url: "https://example.com/mcp",
          },
          "disabled-server": {
            url: "https://disabled.com/mcp",
            disabled: true,
          },
        },
      });

      const params = file.getConnectParams();
      expect(Object.keys(params)).toHaveLength(1);
      expect(params["enabled-server"]).toBeDefined();
      expect(params["disabled-server"]).toBeUndefined();
    });

    it("should include disabled servers when requested", async () => {
      const file = await File.fromJson(
        {
          mcpServers: {
            "disabled-server": {
              url: "https://disabled.com/mcp",
              disabled: true,
            },
          },
        },
        { includeDisabled: true }
      );

      const params = file.getConnectParams();
      expect(params["disabled-server"]).toBeDefined();
      expect(params["disabled-server"]._metadata.disabled).toBe(true);
    });
  });

  describe("Variable Interpolation", () => {
    it("should interpolate env variables", async () => {
      const file = await File.fromJson(
        {
          mcpServers: {
            "my-server": {
              command: "python",
              args: ["${env:SCRIPT_NAME}"],
            },
          },
        },
        {
          env: {
            SCRIPT_NAME: "server.py",
          },
        }
      );

      const params = file.getConnectParams();
      const config = params["my-server"].transportConfig as any;
      expect(config.args).toEqual(["server.py"]);
    });

    it("should interpolate userHome", async () => {
      const file = await File.fromJson({
        mcpServers: {
          "my-server": {
            command: "python",
            args: ["${userHome}/server.py"],
          },
        },
      });

      const params = file.getConnectParams();
      const config = params["my-server"].transportConfig as any;
      expect(config.args?.[0]).toBe(`${homedir()}/server.py`);
    });

    it("should interpolate workspaceFolder", async () => {
      const file = await File.fromJson(
        {
          mcpServers: {
            "my-server": {
              command: "python",
              args: ["${workspaceFolder}/server.py"],
            },
          },
        },
        {
          workspaceFolder: "/my/project",
        }
      );

      const params = file.getConnectParams();
      const config = params["my-server"].transportConfig as any;
      expect(config.args).toEqual(["/my/project/server.py"]);
    });

    it("should interpolate in headers", async () => {
      const file = await File.fromJson(
        {
          mcpServers: {
            "my-server": {
              url: "https://example.com/mcp",
              headers: {
                Authorization: "Bearer ${env:TOKEN}",
              },
            },
          },
        },
        {
          env: {
            TOKEN: "secret-token",
          },
        }
      );

      const params = file.getConnectParams();
      const config = params["my-server"].transportConfig as any;
      expect(config.opts?.requestInit?.headers?.Authorization).toBe(
        "Bearer secret-token"
      );
    });
  });

  describe("File Methods", () => {
    it("should load from file path", async () => {
      const configPath = join(testDir, "config.mcp.json");
      await writeFile(
        configPath,
        JSON.stringify({
          mcpServers: {
            "my-server": {
              url: "https://example.com/mcp",
            },
          },
        })
      );

      const file = await File.fromPath(configPath);
      const params = file.getConnectParams();

      expect(params["my-server"]).toBeDefined();
    });

    it("should get specific server", async () => {
      const file = await File.fromJson({
        mcpServers: {
          "server-1": {
            url: "https://example1.com/mcp",
          },
          "server-2": {
            command: "node",
            args: ["server.js"],
          },
        },
      });

      const server = file.getServer("server-1");
      expect(server?._metadata.serverName).toBe("server-1");
      expect(server?._metadata.transportType).toBe("http");
    });

    it("should return undefined for non-existent server", async () => {
      const file = await File.fromJson({
        mcpServers: {
          "server-1": {
            url: "https://example.com/mcp",
          },
        },
      });

      expect(file.getServer("non-existent")).toBeUndefined();
    });

    it("should get all server IDs", async () => {
      const file = await File.fromJson({
        mcpServers: {
          "server-1": {
            url: "https://example.com/mcp",
          },
          "server-2": {
            command: "node",
            args: ["server.js"],
          },
        },
      });

      const ids = file.getServerIds();
      expect(ids).toHaveLength(2);
      expect(ids).toContain("server-1");
      expect(ids).toContain("server-2");
    });
  });
});
