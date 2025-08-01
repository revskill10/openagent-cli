import { spawn, ChildProcess } from 'child_process';
import { Config } from './simple-config.js';

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
}

export interface MCPServer {
  name: string;
  process: ChildProcess | null;
  tools: MCPTool[];
  ready: boolean;
}

interface MCPRequest {
  jsonrpc: string;
  id: number;
  method: string;
  params?: any;
}

interface MCPResponse {
  jsonrpc: string;
  id: number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export class MCPManager {
  private servers: Map<string, MCPServer> = new Map();
  private requestId = 1;

  async initialize(config: Config) {
    const initPromises = config.mcpServers.map(serverConfig => 
      this.initializeServer(serverConfig)
    );
    
    await Promise.all(initPromises);
  }

  private async initializeServer(serverConfig: Config['mcpServers'][number]) {
    const server: MCPServer = {
      name: serverConfig.name,
      process: null,
      tools: [],
      ready: false
    };

    try {
      console.log(`🚀 Starting MCP server: ${serverConfig.name} (${serverConfig.command} ${serverConfig.args.join(' ')})`);
      
      // Spawn the MCP server process
      server.process = spawn(serverConfig.command, serverConfig.args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      if (!server.process.stdout || !server.process.stdin) {
        throw new Error('Failed to create stdio pipes');
      }

      // Handle process errors
      server.process.on('error', (error) => {
        console.error(`❌ MCP server ${serverConfig.name} process error:`, error.message);
        if (error.message.includes('ENOENT')) {
          console.error(`💡 Suggestion: Make sure ${serverConfig.command} is installed and in PATH`);
          if (serverConfig.command === 'npx') {
            console.error(`💡 Try: npm install @modelcontextprotocol/server-filesystem`);
          }
        }
      });

      server.process.on('exit', (code) => {
        if (code !== 0) {
          console.error(`❌ MCP server ${serverConfig.name} exited with code ${code}`);
        }
      });

      // Initialize MCP protocol
      await this.initializeMCPProtocol(server);
      
      // Get available tools
      server.tools = await this.getServerTools(server);
      server.ready = true;

      this.servers.set(serverConfig.name, server);
      console.log(`✅ MCP Server started: ${serverConfig.name} (${server.tools.length} tools)`);
    } catch (error) {
      console.error(`❌ Failed to initialize MCP server ${serverConfig.name}:`, error instanceof Error ? error.message : String(error));
      if (server.process) {
        server.process.kill();
      }
      // Still add the server to the map but mark it as not ready
      this.servers.set(serverConfig.name, server);
    }
  }

  private async initializeMCPProtocol(server: MCPServer): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!server.process?.stdout || !server.process?.stdin) {
        reject(new Error('No stdio available'));
        return;
      }

      let buffer = '';
      const timeout = setTimeout(() => {
        reject(new Error('MCP initialization timeout'));
      }, 5000);

      const onData = (data: Buffer) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const response = JSON.parse(line) as MCPResponse;
              if (response.id === 1) { // Our initialize request
                clearTimeout(timeout);
                server.process!.stdout!.off('data', onData);
                if (response.error) {
                  reject(new Error(`MCP init failed: ${response.error.message}`));
                } else {
                  resolve();
                }
                return;
              }
            } catch (e) {
              // Ignore parse errors, continue reading
            }
          }
        }
      };

      server.process.stdout.on('data', onData);

      // Send initialize request
      const initRequest: MCPRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {}
          },
          clientInfo: {
            name: 'openagent',
            version: '1.0.0'
          }
        }
      };

      server.process.stdin.write(JSON.stringify(initRequest) + '\n');
    });
  }

  private async getServerTools(server: MCPServer): Promise<MCPTool[]> {
    return new Promise((resolve, reject) => {
      if (!server.process?.stdout || !server.process?.stdin) {
        reject(new Error('No stdio available'));
        return;
      }

      let buffer = '';
      const requestId = ++this.requestId;
      const timeout = setTimeout(() => {
        reject(new Error('Tools list timeout'));
      }, 5000);

      const onData = (data: Buffer) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const response = JSON.parse(line) as MCPResponse;
              if (response.id === requestId) {
                clearTimeout(timeout);
                server.process!.stdout!.off('data', onData);
                if (response.error) {
                  reject(new Error(`Tools list failed: ${response.error.message}`));
                } else {
                  const tools = (response.result?.tools || []).map((tool: any) => ({
                    name: tool.name,
                    description: tool.description,
                    inputSchema: tool.inputSchema
                  }));
                  resolve(tools);
                }
                return;
              }
            } catch (e) {
              // Ignore parse errors, continue reading
            }
          }
        }
      };

      server.process.stdout.on('data', onData);

      // Send tools/list request
      const toolsRequest: MCPRequest = {
        jsonrpc: '2.0',
        id: requestId,
        method: 'tools/list'
      };

      server.process.stdin.write(JSON.stringify(toolsRequest) + '\n');
    });
  }

  getTools(serverNames: string[]): MCPTool[] {
    const tools: MCPTool[] = [];
    
    for (const serverName of serverNames) {
      const server = this.servers.get(serverName);
      if (server && server.ready) {
        tools.push(...server.tools);
      }
    }
    
    return tools;
  }

  getAllTools(): MCPTool[] {
    const tools: MCPTool[] = [];
    
    for (const server of this.servers.values()) {
      if (server.ready) {
        tools.push(...server.tools);
      }
    }
    
    return tools;
  }

  async executeTool(toolName: string, args: any): Promise<any> {
    // Find which server has this tool
    let targetServer: MCPServer | null = null;
    
    for (const server of this.servers.values()) {
      if (server.ready && server.tools.some(tool => tool.name === toolName)) {
        targetServer = server;
        break;
      }
    }

    if (!targetServer) {
      throw new Error(`Tool ${toolName} not found in any server`);
    }

    return new Promise((resolve, reject) => {
      if (!targetServer!.process?.stdout || !targetServer!.process?.stdin) {
        reject(new Error('No stdio available'));
        return;
      }

      let buffer = '';
      const requestId = ++this.requestId;
      const timeout = setTimeout(() => {
        reject(new Error(`Tool execution timeout: ${toolName}`));
      }, 30000);

      const onData = (data: Buffer) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const response = JSON.parse(line) as MCPResponse;
              if (response.id === requestId) {
                clearTimeout(timeout);
                targetServer!.process!.stdout!.off('data', onData);
                if (response.error) {
                  reject(new Error(`Tool execution failed: ${response.error.message}`));
                } else {
                  resolve(response.result);
                }
                return;
              }
            } catch (e) {
              // Ignore parse errors, continue reading
            }
          }
        }
      };

      targetServer.process.stdout.on('data', onData);

      // Send tools/call request
      const callRequest: MCPRequest = {
        jsonrpc: '2.0',
        id: requestId,
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args
        }
      };

      targetServer.process.stdin.write(JSON.stringify(callRequest) + '\n');
    });
  }

  cleanup() {
    for (const server of this.servers.values()) {
      if (server.process) {
        server.process.kill();
      }
    }
  }
}

export const mcpManager = new MCPManager();