import { BaseToolExecutor, ToolDefinition, ToolExecutionResult, ToolCall } from './base-executor.js';

interface RemoteMCPServer {
  name: string;
  url: string;
  apiKey?: string;
  headers?: Record<string, string>;
  tools: ToolDefinition[];
  ready: boolean;
}

interface RemoteMCPRequest {
  jsonrpc: string;
  id: number;
  method: string;
  params?: any;
}

interface RemoteMCPResponse {
  jsonrpc: string;
  id: number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export class RemoteMCPExecutor extends BaseToolExecutor {
  private servers: Map<string, RemoteMCPServer> = new Map();
  private requestId = 1;

  constructor(private serverConfigs: Array<{
    name: string;
    url: string;
    apiKey?: string;
    headers?: Record<string, string>;
  }>) {
    super('RemoteMCP');
  }

  async initialize(): Promise<void> {
    this.logger.info(`Initializing ${this.serverConfigs.length} remote MCP servers`);
    
    const initPromises = this.serverConfigs.map(config => this.initializeServer(config));
    await Promise.allSettled(initPromises);
    
    const readyServers = Array.from(this.servers.values()).filter(s => s.ready);
    this.logger.info(`Remote MCP initialization complete`, {
      totalServers: this.serverConfigs.length,
      readyServers: readyServers.length,
      servers: readyServers.map(s => ({ name: s.name, url: s.url, tools: s.tools.length }))
    });
  }

  private async initializeServer(config: {
    name: string;
    url: string;
    apiKey?: string;
    headers?: Record<string, string>;
  }): Promise<void> {
    const server: RemoteMCPServer = {
      name: config.name,
      url: config.url,
      apiKey: config.apiKey,
      headers: config.headers || {},
      tools: [],
      ready: false
    };

    try {
      this.logger.debug(`Connecting to remote MCP server`, {
        name: config.name,
        url: config.url
      });

      // Initialize connection
      await this.initializeRemoteMCPProtocol(server);
      
      // Get available tools
      const rawTools = await this.getServerTools(server);
      server.tools = rawTools.map(tool => ({
        ...tool,
        executorType: 'remote-mcp' as const,
        metadata: { 
          serverName: server.name,
          url: server.url
        }
      }));
      
      server.ready = true;
      this.servers.set(config.name, server);
      
      this.logger.info(`Remote MCP server ready`, {
        name: server.name,
        url: server.url,
        toolCount: server.tools.length,
        tools: server.tools.map(t => t.name)
      });
    } catch (error) {
      this.logger.error(`Failed to initialize remote MCP server`, {
        name: config.name,
        url: config.url,
        error: error instanceof Error ? error.message : String(error)
      });
      
      server.ready = false;
      this.servers.set(config.name, server);
    }
  }

  private async initializeRemoteMCPProtocol(server: RemoteMCPServer): Promise<void> {
    const initRequest: RemoteMCPRequest = {
      jsonrpc: '2.0',
      id: ++this.requestId,
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

    this.logger.debug(`Sending remote MCP initialize`, {
      serverName: server.name,
      url: server.url,
      request: initRequest
    });

    const response = await this.makeHttpRequest(server, initRequest);
    
    if (response.error) {
      throw new Error(`Remote MCP init failed: ${response.error.message}`);
    }
    
    this.logger.debug(`Remote MCP initialization successful`, {
      serverName: server.name,
      response: response.result
    });
  }

  private async getServerTools(server: RemoteMCPServer): Promise<ToolDefinition[]> {
    const toolsRequest: RemoteMCPRequest = {
      jsonrpc: '2.0',
      id: ++this.requestId,
      method: 'tools/list'
    };

    this.logger.debug(`Requesting remote tools list`, {
      serverName: server.name,
      url: server.url
    });

    const response = await this.makeHttpRequest(server, toolsRequest);
    
    if (response.error) {
      throw new Error(`Remote tools list failed: ${response.error.message}`);
    }
    
    const tools = (response.result?.tools || []).map((tool: any) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      executorType: 'remote-mcp' as const
    }));
    
    this.logger.debug(`Retrieved remote tools`, {
      serverName: server.name,
      toolCount: tools.length,
      tools: tools.map((t: any) => t.name)
    });
    
    return tools;
  }

  private async makeHttpRequest(server: RemoteMCPServer, request: RemoteMCPRequest): Promise<RemoteMCPResponse> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...server.headers
    };

    if (server.apiKey) {
      headers['Authorization'] = `Bearer ${server.apiKey}`;
    }

    this.logger.debug(`Making HTTP request`, {
      serverName: server.name,
      url: server.url,
      method: request.method,
      headers: Object.keys(headers)
    });

    try {
      const response = await fetch(server.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(request)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json() as RemoteMCPResponse;
      
      this.logger.debug(`HTTP request completed`, {
        serverName: server.name,
        status: response.status,
        hasError: !!result.error
      });

      return result;
    } catch (error) {
      this.logger.error(`HTTP request failed`, {
        serverName: server.name,
        url: server.url,
        error: error instanceof Error ? error.message : String(error)
      });
      
      throw error;
    }
  }

  async getTools(): Promise<ToolDefinition[]> {
    const allTools: ToolDefinition[] = [];
    
    for (const server of this.servers.values()) {
      if (server.ready) {
        allTools.push(...server.tools);
      }
    }
    
    this.logger.debug(`Retrieved all remote tools`, {
      totalTools: allTools.length,
      byServer: Array.from(this.servers.values())
        .filter(s => s.ready)
        .map(s => ({ name: s.name, url: s.url, tools: s.tools.length }))
    });
    
    return allTools;
  }

  async executeTool(toolCall: ToolCall): Promise<ToolExecutionResult> {
    this.logger.debug(`Looking for remote tool`, { toolName: toolCall.name });

    let targetServer: RemoteMCPServer | null = null;
    
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
        
      this.logger.error(`Remote tool not found`, {
        toolName: toolCall.name,
        availableTools
      });
      
      return {
        success: false,
        error: `Tool ${toolCall.name} not found in any remote server`,
        executionTime: 0,
        executorType: 'remote-mcp'
      };
    }

    this.logger.debug(`Executing remote tool`, {
      toolName: toolCall.name,
      serverName: targetServer.name,
      url: targetServer.url,
      arguments: toolCall.arguments
    });

    try {
      const callRequest: RemoteMCPRequest = {
        jsonrpc: '2.0',
        id: ++this.requestId,
        method: 'tools/call',
        params: {
          name: toolCall.name,
          arguments: toolCall.arguments
        }
      };

      const response = await this.makeHttpRequest(targetServer, callRequest);
      
      if (response.error) {
        this.logger.error(`Remote tool execution failed`, {
          toolName: toolCall.name,
          serverName: targetServer.name,
          error: response.error
        });
        
        return {
          success: false,
          error: `Remote tool execution failed: ${response.error.message}`,
          executionTime: 0,
          executorType: 'remote-mcp',
          metadata: { 
            serverName: targetServer.name,
            url: targetServer.url
          }
        };
      }
      
      this.logger.debug(`Remote tool execution successful`, {
        toolName: toolCall.name,
        serverName: targetServer.name,
        result: response.result
      });
      
      return {
        success: true,
        result: response.result,
        executionTime: 0,
        executorType: 'remote-mcp',
        metadata: { 
          serverName: targetServer.name,
          url: targetServer.url
        }
      };
    } catch (error) {
      this.logger.error(`Remote tool execution error`, {
        toolName: toolCall.name,
        serverName: targetServer.name,
        error: error instanceof Error ? error.message : String(error)
      });
      
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime: 0,
        executorType: 'remote-mcp',
        metadata: { 
          serverName: targetServer.name,
          url: targetServer.url
        }
      };
    }
  }

  async cleanup(): Promise<void> {
    this.logger.info(`Cleaning up remote MCP connections`);
    // No cleanup needed for HTTP connections
    this.servers.clear();
  }
}