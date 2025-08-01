// validating-tool-executor.ts - Tool executor with validation error handling and user correction
import { ToolCall, ToolDefinition, ToolExecutionResult } from './base-executor.js';
import { unifiedToolRegistry } from './unified-tool-registry.js';
import { unifiedToolExecutor, UnifiedToolExecutionContext, StreamingToolResult } from './unified-tool-executor.js';
import { ToolDocumentationFormatter } from './tool-documentation-formatter.js';
import { UserInputHandler } from '../interactive-block-executor.js';
import { PromptDefinition } from '../simple-tools.js';

export interface ValidationError {
  type: 'validation_error';
  toolName: string;
  error: string;
  providedParams: any;
  toolDefinition: ToolDefinition;
  correctionPrompt: PromptDefinition;
}

export interface ValidatingToolExecutionContext extends UnifiedToolExecutionContext {
  inputHandler?: UserInputHandler;
  maxValidationRetries?: number;
  enableValidationPrompts?: boolean;
}

/**
 * Enhanced tool executor that handles validation errors by prompting users for corrections
 */
export class ValidatingToolExecutor {
  private baseExecutor = unifiedToolExecutor;

  /**
   * Execute tool with validation error handling and user correction prompts
   */
  async *executeToolCallWithValidation(
    toolCall: ToolCall,
    context: ValidatingToolExecutionContext = {}
  ): AsyncGenerator<StreamingToolResult | ValidationError, void, unknown> {
    const maxRetries = context.maxValidationRetries || 3;
    const enablePrompts = context.enableValidationPrompts !== false;
    
    let attempt = 0;
    let currentToolCall = { ...toolCall };

    while (attempt <= maxRetries) {
      try {
        // Try to execute the tool
        let hasError = false;
        for await (const result of this.baseExecutor.executeToolCallStreaming(currentToolCall, context)) {
          // Check for validation errors in both error field and result content
          const validationErrorText = result.error && this.isValidationError(result.error) 
            ? result.error 
            : this.hasValidationErrorInResult(result.result);

          if (validationErrorText && enablePrompts && context.inputHandler) {
            hasError = true;
            
            // Get tool definition for documentation
            const tool = unifiedToolRegistry.getTool(currentToolCall.name);
            if (!tool) {
              yield result; // Can't help without tool definition
              return;
            }

            // Create validation error with correction prompt
            const validationError = await this.createValidationError(
              currentToolCall,
              validationErrorText,
              tool,
              context.inputHandler
            );

            yield validationError;

            // Wait for user correction
            const correctedParams = await context.inputHandler.handlePrompt(validationError.correctionPrompt);
            
            // Update tool call with corrected parameters
            currentToolCall = {
              ...currentToolCall,
              arguments: this.mergeParameters(currentToolCall.arguments, correctedParams)
            };

            attempt++;
            break; // Break inner loop to retry with corrected parameters
          } else {
            yield result;
            if (result.done) return; // Success, exit
          }
        }

        if (!hasError) {
          return; // No validation error, execution completed
        }

      } catch (error) {
        yield {
          toolCall: currentToolCall,
          result: null,
          error: error instanceof Error ? error.message : String(error),
          executionTime: 0,
          done: true,
        };
        return;
      }
    }

    // Max retries exceeded
    yield {
      toolCall: currentToolCall,
      result: null,
      error: `Validation failed after ${maxRetries} attempts. Please check the tool documentation and try again.`,
      executionTime: 0,
      done: true,
    };
  }

  /**
   * Check if an error is a validation error that can be corrected
   */
  private isValidationError(error: string): boolean {
    const validationKeywords = [
      'required', 'missing', 'invalid', 'parameter', 'argument',
      'schema', 'validation', 'format', 'type', 'expected'
    ];
    
    const lowerError = error.toLowerCase();
    return validationKeywords.some(keyword => lowerError.includes(keyword));
  }

  /**
   * Check if a result contains validation errors (for MCP servers that return errors as results)
   */
  private hasValidationErrorInResult(result: any): string | null {
    if (!result) return null;
    
    // Check for MCP error format with isError flag
    if (result.isError && result.content) {
      for (const item of result.content) {
        if (item.type === 'text' && item.text) {
          const errorText = item.text;
          if (this.isValidationError(errorText)) {
            return errorText;
          }
        }
      }
    }
    
    // Check for direct error text
    if (typeof result === 'string' && this.isValidationError(result)) {
      return result;
    }
    
    return null;
  }

  /**
   * Create a validation error with user correction prompt
   */
  private async createValidationError(
    toolCall: ToolCall,
    error: string,
    tool: ToolDefinition,
    inputHandler: UserInputHandler
  ): Promise<ValidationError> {
    
    // Format detailed documentation
    const documentation = ToolDocumentationFormatter.formatValidationError(
      toolCall.name,
      error,
      tool,
      toolCall.arguments
    );

    // Create correction prompt
    const correctionPrompt: PromptDefinition = {
      type: 'text',
      message: `${documentation}\n\nPlease provide the corrected parameters as JSON:`,
      required: true,
      validation: {
        pattern: '^\\s*\\{.*\\}\\s*$',
        message: 'Please provide valid JSON object with the corrected parameters'
      },
      default: JSON.stringify(toolCall.arguments, null, 2)
    };

    return {
      type: 'validation_error',
      toolName: toolCall.name,
      error,
      providedParams: toolCall.arguments,
      toolDefinition: tool,
      correctionPrompt
    };
  }

  /**
   * Merge user-provided corrections with original parameters
   */
  private mergeParameters(original: any, correction: any): any {
    try {
      // If correction is a string, try to parse as JSON
      let correctionObj = correction;
      if (typeof correction === 'string') {
        correctionObj = JSON.parse(correction);
      }

      // Merge corrections into original parameters
      return {
        ...original,
        ...correctionObj
      };
    } catch (error) {
      console.warn('Failed to parse correction, using original parameters:', error);
      return original;
    }
  }

  /**
   * Get available tools with their documentation
   */
  getToolsWithDocumentation(): Array<{
    tool: ToolDefinition;
    documentation: string;
  }> {
    const tools = this.baseExecutor.getAvailableTools();
    return tools.map(tool => ({
      tool,
      documentation: ToolDocumentationFormatter.formatAsMarkdown(
        ToolDocumentationFormatter.formatToolDocumentation(tool)
      )
    }));
  }

  /**
   * Get documentation for a specific tool
   */
  getToolDocumentation(toolName: string): string | null {
    const tool = unifiedToolRegistry.getTool(toolName);
    if (!tool) return null;

    const doc = ToolDocumentationFormatter.formatToolDocumentation(tool);
    return ToolDocumentationFormatter.formatAsMarkdown(doc);
  }

  /**
   * Validate tool parameters without executing
   */
  validateToolParameters(toolCall: ToolCall): { valid: boolean; errors: string[] } {
    const tool = unifiedToolRegistry.getTool(toolCall.name);
    if (!tool) {
      return {
        valid: false,
        errors: [`Tool '${toolCall.name}' not found`]
      };
    }

    const errors: string[] = [];
    const schema = tool.inputSchema;
    
    if (!schema) {
      return { valid: true, errors: [] }; // No schema to validate against
    }

    // Basic validation
    if (schema.required) {
      for (const requiredParam of schema.required) {
        if (!(requiredParam in toolCall.arguments)) {
          errors.push(`Missing required parameter: ${requiredParam}`);
        }
      }
    }

    if (schema.properties) {
      for (const [paramName, paramValue] of Object.entries(toolCall.arguments)) {
        const paramSchema = schema.properties[paramName];
        if (!paramSchema) {
          errors.push(`Unknown parameter: ${paramName}`);
          continue;
        }

        // Type validation
        if (paramSchema.type) {
          const actualType = Array.isArray(paramValue) ? 'array' : typeof paramValue;
          if (actualType !== paramSchema.type) {
            errors.push(`Parameter '${paramName}' expected ${paramSchema.type}, got ${actualType}`);
          }
        }

        // Enum validation
        if (paramSchema.enum && !paramSchema.enum.includes(paramValue)) {
          errors.push(`Parameter '${paramName}' must be one of: ${paramSchema.enum.join(', ')}`);
        }

        // Pattern validation for strings
        if (paramSchema.pattern && typeof paramValue === 'string') {
          const regex = new RegExp(paramSchema.pattern);
          if (!regex.test(paramValue)) {
            errors.push(`Parameter '${paramName}' does not match required pattern: ${paramSchema.pattern}`);
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

export const validatingToolExecutor = new ValidatingToolExecutor();