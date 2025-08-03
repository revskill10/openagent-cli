import { BaseToolExecutor, ToolDefinition, ToolExecutionResult, ToolCall } from './base-executor.js';

export type ToolFunction = (args: any) => Promise<any> | any;

interface FunctionTool {
  name: string;
  description: string;
  inputSchema: any;
  fn: ToolFunction;
}

export class FunctionExecutor extends BaseToolExecutor {
  private functions: Map<string, FunctionTool> = new Map();

  constructor(private functionConfigs: Array<{
    name: string;
    description: string;
    inputSchema: any;
    fn: ToolFunction;
  }>) {
    super('Function');
  }

  async initialize(): Promise<void> {
    this.logger.info(`Initializing ${this.functionConfigs.length} function tools`);
    
    for (const config of this.functionConfigs) {
      try {
        this.validateFunction(config);
        
        const tool: FunctionTool = {
          name: config.name,
          description: config.description,
          inputSchema: config.inputSchema,
          fn: config.fn
        };
        
        this.functions.set(config.name, tool);
        
        this.logger.debug(`Function tool registered`, {
          name: config.name,
          description: config.description,
          hasInputSchema: !!config.inputSchema
        });
      } catch (error) {
        this.logger.error(`Failed to register function tool`, {
          name: config.name,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    this.logger.info(`Function tools initialization complete`, {
      totalConfigured: this.functionConfigs.length,
      registered: this.functions.size,
      tools: Array.from(this.functions.keys())
    });
  }

  private validateFunction(config: {
    name: string;
    description: string;
    inputSchema: any;
    fn: ToolFunction;
  }): void {
    if (!config.name || typeof config.name !== 'string') {
      throw new Error('Function name must be a non-empty string');
    }
    
    if (!config.description || typeof config.description !== 'string') {
      throw new Error('Function description must be a non-empty string');
    }
    
    if (typeof config.fn !== 'function') {
      throw new Error('Function must be a callable function');
    }
    
    if (!config.inputSchema || typeof config.inputSchema !== 'object') {
      throw new Error('Function must have an input schema object');
    }
  }

  async getTools(): Promise<ToolDefinition[]> {
    const tools: ToolDefinition[] = [];
    
    for (const tool of Array.from(this.functions.values())) {
      tools.push({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        executorType: 'function',
        metadata: { functionName: tool.name }
      });
    }
    
    this.logger.debug(`Retrieved function tools`, {
      totalTools: tools.length,
      tools: tools.map(t => t.name)
    });
    
    return tools;
  }

  async executeTool(toolCall: ToolCall): Promise<ToolExecutionResult> {
    this.logger.debug(`Looking for function tool`, { toolName: toolCall.name });

    const tool = this.functions.get(toolCall.name);
    
    if (!tool) {
      const availableTools = Array.from(this.functions.keys());
      
      this.logger.error(`Function tool not found`, {
        toolName: toolCall.name,
        availableTools
      });
      
      return {
        success: false,
        error: `Function ${toolCall.name} not found`,
        executionTime: 0,
        executorType: 'function'
      };
    }

    this.logger.debug(`Executing function tool`, {
      toolName: toolCall.name,
      arguments: toolCall.arguments
    });

    try {
      // Validate arguments against schema if needed
      const validationResult = this.validateArguments(tool, toolCall.arguments);
      if (!validationResult.valid) {
        this.logger.error(`Function argument validation failed`, {
          toolName: toolCall.name,
          errors: validationResult.errors
        });
        
        return {
          success: false,
          error: `Argument validation failed: ${validationResult.errors.join(', ')}`,
          executionTime: 0,
          executorType: 'function',
          metadata: { functionName: tool.name }
        };
      }

      // Execute the function
      const result = await Promise.resolve(tool.fn(toolCall.arguments));
      
      this.logger.debug(`Function execution successful`, {
        toolName: toolCall.name,
        resultType: typeof result,
        hasResult: result !== undefined
      });
      
      return {
        success: true,
        result,
        executionTime: 0,
        executorType: 'function',
        metadata: { functionName: tool.name }
      };
    } catch (error) {
      this.logger.error(`Function execution failed`, {
        toolName: toolCall.name,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime: 0,
        executorType: 'function',
        metadata: { functionName: tool.name }
      };
    }
  }

  private validateArguments(tool: FunctionTool, args: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    try {
      // Basic validation - check required properties
      if (tool.inputSchema.required && Array.isArray(tool.inputSchema.required)) {
        for (const requiredProp of tool.inputSchema.required) {
          if (!(requiredProp in args)) {
            errors.push(`Missing required property: ${requiredProp}`);
          }
        }
      }
      
      // Type validation for properties
      if (tool.inputSchema.properties && typeof tool.inputSchema.properties === 'object') {
        for (const [propName, propSchema] of Object.entries(tool.inputSchema.properties)) {
          if (propName in args) {
            const propValue = args[propName];
            const schema = propSchema as any;
            
            if (schema.type && typeof propValue !== schema.type) {
              errors.push(`Property ${propName} should be of type ${schema.type}, got ${typeof propValue}`);
            }
          }
        }
      }
      
      this.logger.debug(`Argument validation completed`, {
        toolName: tool.name,
        valid: errors.length === 0,
        errorCount: errors.length
      });
      
      return {
        valid: errors.length === 0,
        errors
      };
    } catch (error) {
      this.logger.warn(`Argument validation error`, {
        toolName: tool.name,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // If validation fails, assume arguments are valid
      return { valid: true, errors: [] };
    }
  }

  async cleanup(): Promise<void> {
    this.logger.info(`Cleaning up function tools`);
    this.functions.clear();
  }

  // Helper method to add functions dynamically
  addFunction(config: {
    name: string;
    description: string;
    inputSchema: any;
    fn: ToolFunction;
  }): void {
    try {
      this.validateFunction(config);
      
      const tool: FunctionTool = {
        name: config.name,
        description: config.description,
        inputSchema: config.inputSchema,
        fn: config.fn
      };
      
      this.functions.set(config.name, tool);
      
      this.logger.info(`Function tool added dynamically`, {
        name: config.name,
        totalFunctions: this.functions.size
      });
    } catch (error) {
      this.logger.error(`Failed to add function tool`, {
        name: config.name,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  // Helper method to remove functions
  removeFunction(name: string): boolean {
    const removed = this.functions.delete(name);
    
    if (removed) {
      this.logger.info(`Function tool removed`, {
        name,
        remainingFunctions: this.functions.size
      });
    } else {
      this.logger.warn(`Function tool not found for removal`, { name });
    }
    
    return removed;
  }
}