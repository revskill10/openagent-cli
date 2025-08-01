import { spawn, ChildProcess } from 'child_process';
import { BaseToolExecutor, ToolDefinition, ToolExecutionResult, ToolCall } from './base-executor.js';

interface MCPServer {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  process: ChildProcess | null;
  tools: ToolDefinition[];
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

export class LocalMCPExecutor extends BaseToolExecutor {
  private servers: Map<string, MCPServer> = new Map();
  private requestId = 1;

  constructor(private serverConfigs: Array<{name: string, command: string, args: string[], env?: Record<string, string>}>) {
    super('LocalMCP');
  }

  async initialize(): Promise<void> {
    this.logger.info(`Initializing ${this.serverConfigs.length} MCP servers`);
    
    const initPromises = this.serverConfigs.map(config => this.initializeServer(config));
    await Promise.allSettled(initPromises);
    
    const readyServers = Array.from(this.servers.values()).filter(s => s.ready);
    this.logger.info(`Initialization complete`, {
      totalServers: this.serverConfigs.length,
      readyServers: readyServers.length,
      servers: readyServers.map(s => ({ name: s.name, tools: s.tools.length }))
    });
  }

  private async initializeServer(config: {name: string, command: string, args: string[], env?: Record<string, string>}): Promise<void> {
    const server: MCPServer = {
      name: config.name,
      command: config.command,
      args: config.args,
      env: config.env,
      process: null,
      tools: [],
      ready: false
    };

    try {
      this.logger.debug(`Starting MCP server`, { 
        name: config.name, 
        command: `${config.command} ${config.args.join(' ')}` 
      });

      // Merge environment variables
      const processEnv = { ...process.env };
      if (config.env) {
        Object.assign(processEnv, config.env);
      }
      
      server.process = spawn(config.command, config.args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: processEnv
      });

      if (!server.process.stdout || !server.process.stdin) {
        throw new Error('Failed to create stdio pipes');
      }

      this.setupProcessHandlers(server);
      await this.initializeMCPProtocol(server);
      
      const rawTools = await this.getServerTools(server);
      server.tools = rawTools.map(tool => ({
        ...tool,
        executorType: 'local-mcp' as const,
        metadata: { serverName: server.name }
      }));
      
      server.ready = true;
      this.servers.set(config.name, server);
      
      this.logger.info(`MCP server ready`, {
        name: server.name,
        toolCount: server.tools.length,
        tools: server.tools.map(t => t.name)
      });
    } catch (error) {
      this.logger.error(`Failed to initialize MCP server`, {
        name: config.name,
        error: error instanceof Error ? error.message : String(error)
      });
      
      if (server.process) {
        server.process.kill();
      }
      
      server.ready = false;
      this.servers.set(config.name, server);
    }
  }

  private setupProcessHandlers(server: MCPServer): void {
    if (!server.process) return;

    server.process.on('error', (error) => {
      this.logger.error(`MCP server process error`, {
        serverName: server.name,
        error: error.message
      });
      
      if (error.message.includes('ENOENT')) {
        this.logger.warn(`Command not found`, {
          serverName: server.name,
          command: server.command,
          suggestion: `Make sure ${server.command} is installed and in PATH`
        });
      }
    });

    server.process.on('exit', (code, signal) => {
      this.logger.warn(`MCP server exited`, {
        serverName: server.name,
        code,
        signal
      });
      server.ready = false;
    });

    server.process.stderr?.on('data', (data) => {
      this.logger.debug(`MCP server stderr`, {
        serverName: server.name,
        stderr: data.toString()
      });
    });
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
      }, 30000);

      const onData = (data: Buffer) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const response = JSON.parse(line) as MCPResponse;
              if (response.id === 1) {
                clearTimeout(timeout);
                server.process!.stdout!.off('data', onData);
                
                if (response.error) {
                  this.logger.error(`MCP initialization failed`, {
                    serverName: server.name,
                    error: response.error
                  });
                  reject(new Error(`MCP init failed: ${response.error.message}`));
                } else {
                  this.logger.debug(`MCP initialization successful`, {
                    serverName: server.name,
                    response: response.result
                  });
                  resolve();
                }
                return;
              }
            } catch (e) {
              this.logger.debug(`Failed to parse MCP response`, {
                serverName: server.name,
                line,
                error: e instanceof Error ? e.message : String(e)
              });
            }
          }
        }
      };

      server.process.stdout.on('data', onData);

      const initRequest: MCPRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          clientInfo: {
            name: 'openagent',
            version: '1.0.0'
          }
        }
      };

      this.logger.debug(`Sending MCP initialize`, {
        serverName: server.name,
        request: initRequest
      });

      server.process.stdin.write(JSON.stringify(initRequest) + '\n');
    });
  }

  private async getServerTools(server: MCPServer): Promise<ToolDefinition[]> {
    return new Promise((resolve, reject) => {
      if (!server.process?.stdout || !server.process?.stdin) {
        reject(new Error('No stdio available'));
        return;
      }

      let buffer = '';
      const requestId = ++this.requestId;
      const timeout = setTimeout(() => {
        reject(new Error('Tools list timeout'));
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
                server.process!.stdout!.off('data', onData);
                
                if (response.error) {
                  this.logger.error(`Tools list failed`, {
                    serverName: server.name,
                    error: response.error
                  });
                  reject(new Error(`Tools list failed: ${response.error.message}`));
                } else {
                  const tools = (response.result?.tools || []).map((tool: any) => ({
                    name: tool.name,
                    description: tool.description,
                    inputSchema: tool.inputSchema,
                    executorType: 'local-mcp' as const
                  }));
                  
                  this.logger.debug(`Retrieved tools`, {
                    serverName: server.name,
                    toolCount: tools.length,
                    tools: tools.map((t: any) => t.name)
                  });
                  
                  resolve(tools);
                }
                return;
              }
            } catch (e) {
              this.logger.debug(`Failed to parse tools response`, {
                serverName: server.name,
                line,
                error: e instanceof Error ? e.message : String(e)
              });
            }
          }
        }
      };

      server.process.stdout.on('data', onData);

      const toolsRequest: MCPRequest = {
        jsonrpc: '2.0',
        id: requestId,
        method: 'tools/list'
      };

      this.logger.debug(`Requesting tools list`, {
        serverName: server.name,
        requestId
      });

      server.process.stdin.write(JSON.stringify(toolsRequest) + '\n');
    });
  }

  async getTools(): Promise<ToolDefinition[]> {
    const allTools: ToolDefinition[] = [];
    
    for (const server of this.servers.values()) {
      if (server.ready) {
        allTools.push(...server.tools);
      }
    }
    
    this.logger.debug(`Retrieved all tools`, {
      totalTools: allTools.length,
      byServer: Array.from(this.servers.values())
        .filter(s => s.ready)
        .map(s => ({ name: s.name, tools: s.tools.length }))
    });
    
    return allTools;
  }

  async executeTool(toolCall: ToolCall): Promise<ToolExecutionResult> {
    this.logger.debug(`Looking for tool`, { toolName: toolCall.name });

    let targetServer: MCPServer | null = null;
    
    for (const server of this.servers.values()) {
      if (server.ready && server.tools.some(tool => tool.name === toolCall.name)) {
        targetServer = server;
        break;
      }
    }

    if (!targetServer) {
      const availableTools = Array.from(this.servers.values())
        .filter(s => s.ready)
        .flatMap(s => s.tools.map(t => t.name));
        
      this.logger.error(`Tool not found`, {
        toolName: toolCall.name,
        availableTools
      });
      
      return {
        success: false,
        error: `Tool ${toolCall.name} not found in any server`,
        executionTime: 0,
        executorType: 'local-mcp'
      };
    }

    this.logger.debug(`Executing tool on server`, {
      toolName: toolCall.name,
      serverName: targetServer.name,
      arguments: toolCall.arguments
    });

    return new Promise((resolve) => {
      if (!targetServer!.process?.stdout || !targetServer!.process?.stdin) {
        resolve({
          success: false,
          error: 'No stdio available',
          executionTime: 0,
          executorType: 'local-mcp'
        });
        return;
      }

      let buffer = '';
      const requestId = ++this.requestId;
      const timeout = setTimeout(() => {
        this.logger.error(`Tool execution timeout`, {
          toolName: toolCall.name,
          serverName: targetServer!.name,
          requestId
        });
        
        resolve({
          success: false,
          error: `Tool execution timeout: ${toolCall.name}`,
          executionTime: 120000,
          executorType: 'local-mcp'
        });
      }, 120000);

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
                  this.logger.error(`Tool execution failed`, {
                    toolName: toolCall.name,
                    serverName: targetServer!.name,
                    error: response.error
                  });
                  
                  resolve({
                    success: false,
                    error: `Tool execution failed: ${response.error.message}`,
                    executionTime: 0,
                    executorType: 'local-mcp',
                    metadata: { serverName: targetServer!.name }
                  });
                } else {
                  this.logger.debug(`Tool execution successful`, {
                    toolName: toolCall.name,
                    serverName: targetServer!.name,
                    result: response.result
                  });
                  
                  resolve({
                    success: true,
                    result: response.result,
                    executionTime: 0,
                    executorType: 'local-mcp',
                    metadata: { serverName: targetServer!.name }
                  });
                }
                return;
              }
            } catch (e) {
              this.logger.debug(`Failed to parse execution response`, {
                toolName: toolCall.name,
                serverName: targetServer!.name,
                line,
                error: e instanceof Error ? e.message : String(e)
              });
            }
          }
        }
      };

      targetServer.process.stdout.on('data', onData);

      const callRequest: MCPRequest = {
        jsonrpc: '2.0',
        id: requestId,
        method: 'tools/call',
        params: {
          name: toolCall.name,
          arguments: toolCall.arguments
        }
      };

      this.logger.debug(`Sending tool call`, {
        toolName: toolCall.name,
        serverName: targetServer.name,
        requestId,
        request: callRequest
      });

      targetServer.process.stdin.write(JSON.stringify(callRequest) + '\n');
    });
  }

  async cleanup(): Promise<void> {
    this.logger.info(`Cleaning up MCP servers`);
    
    for (const server of this.servers.values()) {
      if (server.process) {
        this.logger.debug(`Killing MCP server process`, { serverName: server.name });
        server.process.kill();
      }
    }
    
    this.servers.clear();
  }
}