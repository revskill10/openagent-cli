export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: any;
  executorType: 'local-mcp' | 'remote-mcp' | 'function';
  metadata?: {
    serverName?: string;
    url?: string;
    functionName?: string;
    [key: string]: any;
  };
}

export interface ToolExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
  executionTime: number;
  executorType: string;
  metadata?: any;
}

export interface ToolCall {
  name: string;
  arguments: any;
}

export interface Logger {
  debug(message: string, data?: any): void;
  info(message: string, data?: any): void;
  warn(message: string, data?: any): void;
  error(message: string, data?: any): void;
}

export class SimpleLogger implements Logger {
  constructor(private prefix: string) {}

  debug(message: string, data?: any): void {
    console.log(`🔍 [${this.prefix}] ${message}`, data ? JSON.stringify(data, null, 2) : '');
  }

  info(message: string, data?: any): void {
    console.log(`ℹ️  [${this.prefix}] ${message}`, data ? JSON.stringify(data, null, 2) : '');
  }

  warn(message: string, data?: any): void {
    console.warn(`⚠️  [${this.prefix}] ${message}`, data ? JSON.stringify(data, null, 2) : '');
  }

  error(message: string, data?: any): void {
    console.error(`❌ [${this.prefix}] ${message}`, data ? JSON.stringify(data, null, 2) : '');
  }
}

export abstract class BaseToolExecutor {
  protected logger: Logger;

  constructor(protected name: string) {
    this.logger = new SimpleLogger(name);
  }

  abstract initialize(): Promise<void>;
  abstract getTools(): Promise<ToolDefinition[]>;
  abstract executeTool(toolCall: ToolCall): Promise<ToolExecutionResult>;
  abstract cleanup(): Promise<void>;

  async executeToolWithTiming(toolCall: ToolCall): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    this.logger.info(`Executing tool: ${toolCall.name}`, { arguments: toolCall.arguments });

    try {
      const result = await this.executeTool(toolCall);
      const executionTime = Date.now() - startTime;
      
      this.logger.info(`Tool execution completed`, {
        toolName: toolCall.name,
        success: result.success,
        executionTime: `${executionTime}ms`
      });

      return {
        ...result,
        executionTime
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.logger.error(`Tool execution failed`, {
        toolName: toolCall.name,
        error: errorMessage,
        executionTime: `${executionTime}ms`
      });

      return {
        success: false,
        error: errorMessage,
        executionTime,
        executorType: this.name
      };
    }
  }
}