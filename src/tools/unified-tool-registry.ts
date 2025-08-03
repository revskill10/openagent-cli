import { BaseToolExecutor, ToolDefinition, ToolExecutionResult, ToolCall, SimpleLogger } from './base-executor.js';
import { LocalMCPExecutor } from './local-mcp-executor.js';
import { RemoteMCPExecutor } from './remote-mcp-executor.js';
import { FunctionExecutor, ToolFunction } from './function-executor.js';
import { intelligentFileTools } from './intelligent-file-tool.js';
import { shellExecutionTools } from './shell-execution-tools.js';
import { dockerTools } from './docker-tools.js';

export interface ToolRegistryConfig {
  localMCP?: Array<{
    name: string;
    command: string;
    args: string[];
    env?: Record<string, string>;
  }>;
  remoteMCP?: Array<{
    name: string;
    url: string;
    apiKey?: string;
    headers?: Record<string, string>;
  }>;
  functions?: Array<{
    name: string;
    description: string;
    inputSchema: any;
    fn: ToolFunction;
  }>;
}

export class UnifiedToolRegistry {
  private executors: Map<string, BaseToolExecutor> = new Map();
  private allTools: Map<string, ToolDefinition> = new Map();
  private logger = new SimpleLogger('ToolRegistry');
  private initialized = false;

  async initialize(config: ToolRegistryConfig): Promise<void> {
    this.logger.info('Initializing tool registry', {
      localMCP: config.localMCP?.length || 0,
      remoteMCP: config.remoteMCP?.length || 0,
      functions: config.functions?.length || 0
    });

    const initPromises: Promise<void>[] = [];

    // Initialize Local MCP Executor
    if (config.localMCP && config.localMCP.length > 0) {
      const localMCPExecutor = new LocalMCPExecutor(config.localMCP);
      this.executors.set('local-mcp', localMCPExecutor);
      initPromises.push(localMCPExecutor.initialize());
    }

    // Initialize Remote MCP Executor
    if (config.remoteMCP && config.remoteMCP.length > 0) {
      const remoteMCPExecutor = new RemoteMCPExecutor(config.remoteMCP);
      this.executors.set('remote-mcp', remoteMCPExecutor);
      initPromises.push(remoteMCPExecutor.initialize());
    }

    // Initialize Function Executor with intelligent file tools, shell execution tools, and Docker tools
    const allFunctions = [
      ...(config.functions || []),
      ...intelligentFileTools,
      ...shellExecutionTools,
      ...dockerTools
    ];

    if (allFunctions.length > 0) {
      const functionExecutor = new FunctionExecutor(allFunctions);
      this.executors.set('function', functionExecutor);
      initPromises.push(functionExecutor.initialize());
    }

    // Wait for all executors to initialize
    const results = await Promise.allSettled(initPromises);
    
    // Log any initialization failures
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const executorTypes = ['local-mcp', 'remote-mcp', 'function'];
        this.logger.error(`Executor initialization failed`, {
          executorType: executorTypes[index],
          error: result.reason
        });
      }
    });

    // Refresh tool catalog
    await this.refreshToolCatalog();
    
    this.initialized = true;
    this.logger.info('Tool registry initialization complete', {
      executors: Array.from(this.executors.keys()),
      totalTools: this.allTools.size
    });
  }

  private async refreshToolCatalog(): Promise<void> {
    this.logger.debug('Refreshing tool catalog');
    
    this.allTools.clear();
    
    for (const [executorType, executor] of this.executors) {
      try {
        const tools = await executor.getTools();
        
        for (const tool of tools) {
          if (this.allTools.has(tool.name)) {
            this.logger.warn('Tool name conflict detected', {
              toolName: tool.name,
              existingExecutor: this.allTools.get(tool.name)?.executorType,
              newExecutor: executorType
            });
          }
          
          this.allTools.set(tool.name, tool);
        }
        
        this.logger.debug('Tools loaded from executor', {
          executorType,
          toolCount: tools.length,
          tools: tools.map(t => t.name)
        });
      } catch (error) {
        this.logger.error('Failed to get tools from executor', {
          executorType,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    this.logger.debug('Tool catalog refreshed', {
      totalTools: this.allTools.size,
      toolsByType: this.getToolCountsByType()
    });
  }

  private getToolCountsByType(): Record<string, number> {
    const counts: Record<string, number> = {};
    
    for (const tool of this.allTools.values()) {
      counts[tool.executorType] = (counts[tool.executorType] || 0) + 1;
    }
    
    return counts;
  }

  async executeTool(toolCall: ToolCall): Promise<ToolExecutionResult> {
    if (!this.initialized) {
      this.logger.error('Tool registry not initialized');
      return {
        success: false,
        error: 'Tool registry not initialized',
        executionTime: 0,
        executorType: 'registry'
      };
    }

    this.logger.debug('Tool execution requested', {
      toolName: toolCall.name,
      hasArguments: !!toolCall.arguments
    });

    const tool = this.allTools.get(toolCall.name);
    
    if (!tool) {
      const availableTools = Array.from(this.allTools.keys());
      this.logger.error('Tool not found', {
        toolName: toolCall.name,
        availableTools: availableTools.slice(0, 10) // Show first 10 to avoid log spam
      });
      
      return {
        success: false,
        error: `Tool '${toolCall.name}' not found. Available tools: ${availableTools.join(', ')}`,
        executionTime: 0,
        executorType: 'registry'
      };
    }

    const executor = this.executors.get(tool.executorType);
    
    if (!executor) {
      this.logger.error('Executor not found for tool', {
        toolName: toolCall.name,
        executorType: tool.executorType,
        availableExecutors: Array.from(this.executors.keys())
      });
      
      return {
        success: false,
        error: `Executor '${tool.executorType}' not found for tool '${toolCall.name}'`,
        executionTime: 0,
        executorType: 'registry'
      };
    }

    this.logger.debug('Tool execution starting', {
      toolName: toolCall.name,
      executorType: tool.executorType
    });

    const result = await executor.executeToolWithTiming(toolCall);
    
    this.logger.info('Tool execution completed', {
      toolName: toolCall.name,
      executorType: tool.executorType,
      success: result.success,
      executionTime: `${result.executionTime}ms`
    });

    return result;
  }

  getAllTools(): ToolDefinition[] {
    return Array.from(this.allTools.values());
  }

  getToolsByType(executorType: string): ToolDefinition[] {
    return Array.from(this.allTools.values()).filter(tool => tool.executorType === executorType);
  }

  getTool(name: string): ToolDefinition | undefined {
    return this.allTools.get(name);
  }

  getToolStats(): {
    totalTools: number;
    byType: Record<string, number>;
    executors: string[];
  } {
    return {
      totalTools: this.allTools.size,
      byType: this.getToolCountsByType(),
      executors: Array.from(this.executors.keys())
    };
  }

  // Dynamic tool management
  async addFunction(config: {
    name: string;
    description: string;
    inputSchema: any;
    fn: ToolFunction;
  }): Promise<void> {
    let functionExecutor = this.executors.get('function') as FunctionExecutor;
    
    if (!functionExecutor) {
      // Create function executor if it doesn't exist
      functionExecutor = new FunctionExecutor([]);
      await functionExecutor.initialize();
      this.executors.set('function', functionExecutor);
    }
    
    functionExecutor.addFunction(config);
    
    // Refresh catalog
    await this.refreshToolCatalog();
    
    this.logger.info('Function tool added dynamically', {
      name: config.name,
      totalTools: this.allTools.size
    });
  }

  async removeFunction(name: string): Promise<boolean> {
    const functionExecutor = this.executors.get('function') as FunctionExecutor;
    
    if (!functionExecutor) {
      this.logger.warn('Function executor not found for removal', { name });
      return false;
    }
    
    const removed = functionExecutor.removeFunction(name);
    
    if (removed) {
      // Refresh catalog
      await this.refreshToolCatalog();
      
      this.logger.info('Function tool removed', {
        name,
        totalTools: this.allTools.size
      });
    }
    
    return removed;
  }

  async refreshTools(): Promise<void> {
    this.logger.info('Manual tool refresh requested');
    await this.refreshToolCatalog();
  }

  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up tool registry');
    
    const cleanupPromises = Array.from(this.executors.values()).map(executor => 
      executor.cleanup().catch(error => 
        this.logger.error('Executor cleanup failed', {
          executorType: executor.constructor.name,
          error: error instanceof Error ? error.message : String(error)
        })
      )
    );
    
    await Promise.allSettled(cleanupPromises);
    
    this.executors.clear();
    this.allTools.clear();
    this.initialized = false;
    
    this.logger.info('Tool registry cleanup complete');
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}

// Global instance
export const unifiedToolRegistry = new UnifiedToolRegistry();