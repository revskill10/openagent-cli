// interactive-block-executor.ts - Enhanced block executor with interactive user prompts
import { executeBlocksStreaming, BlockResult } from './block-executor.js';
import { PromptDefinition } from './simple-tools.js';
import { systemEventEmitter } from './system-events.js';

export interface UserInputHandler {
  /**
   * Handle user input prompts
   * @param prompt The prompt definition
   * @returns Promise resolving to user's input
   */
  handlePrompt(prompt: PromptDefinition): Promise<any>;
}

export interface InteractiveExecutionOptions {
  timeout?: number;
  maxRetries?: number;
  variables?: Record<string, any>;
  inputHandler?: UserInputHandler;
}

export interface InteractiveBlockResult extends BlockResult {
  waitingForInput?: boolean;
  userResponse?: any;
}

/**
 * Enhanced block executor that handles interactive user prompts
 */
export class InteractiveBlockExecutor {
  private executionId = 0;

  /**
   * Execute blocks with interactive prompt handling
   */
  async *executeInteractiveBlocks(
    script: string,
    options: InteractiveExecutionOptions = {}
  ): AsyncGenerator<InteractiveBlockResult, void, unknown> {
    const execId = `interactive_exec_${++this.executionId}_${Date.now()}`;
    
    try {
      systemEventEmitter.emitTaskStart(execId, 'system', 'Execute interactive blocks with prompts');
      
      // Variables context for the execution
      const variables: Record<string, any> = { ...(options.variables || {}) };
      
      // Check for missing arguments and create prompts as needed
      const processedScript = await this.preprocessScript(script, variables, options.inputHandler);
      
      // Execute the processed script
      for await (const result of executeBlocksStreaming(processedScript)) {
        // Handle prompt results
        if (result.promptNeeded && options.inputHandler) {
          yield { ...result, waitingForInput: true };
          
          try {
            const userResponse = await options.inputHandler.handlePrompt(result.promptNeeded);
            
            // Validate user input
            const validatedResponse = this.validateUserInput(result.promptNeeded, userResponse);
            
            // Store in variables context
            variables[result.promptNeeded.variable] = validatedResponse;
            
            yield {
              ...result,
              done: true,
              result: validatedResponse,
              userResponse: validatedResponse,
              waitingForInput: false
            };
          } catch (error) {
            yield {
              ...result,
              done: true,
              error: `Prompt failed: ${error instanceof Error ? error.message : String(error)}`,
              waitingForInput: false
            };
          }
        } else {
          yield result as InteractiveBlockResult;
        }
      }
      
      systemEventEmitter.emitTaskComplete(execId, { variables });
      
    } catch (error) {
      systemEventEmitter.emitTaskError(execId, error instanceof Error ? error.message : String(error));
      yield {
        id: execId,
        done: true,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Preprocess script to inject missing argument prompts
   */
  private async preprocessScript(
    script: string, 
    variables: Record<string, any>,
    inputHandler?: UserInputHandler
  ): Promise<string> {
    // Find tool calls with missing arguments
    const toolRegex = /\[TOOL_REQUEST\]\s*(\{.*?\})\s*\[END_TOOL_REQUEST\]/gs;
    const matches = Array.from(script.matchAll(toolRegex));
    
    let processedScript = script;
    let offset = 0;
    
    for (const match of matches) {
      try {
        const toolData = JSON.parse(match[1]);
        const missingArgs = this.findMissingArguments(toolData, variables);
        
        if (missingArgs.length > 0 && inputHandler) {
          // Create prompts for missing arguments
          const prompts = this.createPromptsForMissingArgs(toolData.id || 'tool', missingArgs);
          const promptsScript = prompts.map(p => this.promptToScript(p)).join('\n');
          
          // Insert prompts before the tool call
          const insertPos = match.index! + offset;
          processedScript = processedScript.slice(0, insertPos) + 
            promptsScript + '\n' + 
            processedScript.slice(insertPos);
          offset += promptsScript.length + 1;
        }
      } catch {
        // Invalid JSON, skip
      }
    }
    
    return processedScript;
  }

  /**
   * Find missing arguments in a tool call
   */
  private findMissingArguments(toolData: any, variables: Record<string, any>): string[] {
    const missing: string[] = [];
    
    if (!toolData.params) return missing;
    
    // Check for undefined variables in parameters
    const checkObject = (obj: any, path: string = ''): void => {
      if (typeof obj === 'string') {
        // Check for variable references like ${variableName}
        const varMatches = obj.matchAll(/\$\{([^}]+)\}/g);
        for (const varMatch of varMatches) {
          const varName = varMatch[1];
          if (!(varName in variables)) {
            missing.push(varName);
          }
        }
      } else if (Array.isArray(obj)) {
        obj.forEach((item, index) => checkObject(item, `${path}[${index}]`));
      } else if (obj && typeof obj === 'object') {
        for (const [key, value] of Object.entries(obj)) {
          checkObject(value, path ? `${path}.${key}` : key);
        }
      }
    };
    
    checkObject(toolData.params);
    return [...new Set(missing)]; // Remove duplicates
  }

  /**
   * Create prompt definitions for missing arguments
   */
  private createPromptsForMissingArgs(toolId: string, missingArgs: string[]): PromptDefinition[] {
    return missingArgs.map((arg, index) => ({
      id: `${toolId}_prompt_${arg}_${Date.now()}_${index}`,
      type: this.guessPromptType(arg),
      message: `Please provide value for: ${arg}`,
      variable: arg,
      required: true
    }));
  }

  /**
   * Guess the appropriate prompt type based on argument name
   */
  private guessPromptType(argName: string): PromptDefinition['type'] {
    const name = argName.toLowerCase();
    
    if (name.includes('confirm') || name.includes('agree') || name.includes('accept')) {
      return 'confirm';
    }
    if (name.includes('count') || name.includes('number') || name.includes('amount') || name.includes('size')) {
      return 'number';
    }
    if (name.includes('select') || name.includes('choose') || name.includes('option')) {
      return 'select';
    }
    
    return 'text'; // Default to text input
  }

  /**
   * Convert prompt definition to script format
   */
  private promptToScript(prompt: PromptDefinition): string {
    return `[PROMPT]${JSON.stringify(prompt)}[END_PROMPT]`;
  }

  /**
   * Validate user input against prompt definition
   */
  private validateUserInput(prompt: PromptDefinition, input: any): any {
    // Handle required fields
    if (prompt.required && (input === null || input === undefined || input === '')) {
      throw new Error(`${prompt.message} is required`);
    }
    
    // Type-specific validation
    switch (prompt.type) {
      case 'number':
        const num = Number(input);
        if (isNaN(num)) {
          throw new Error(`Expected a number for ${prompt.variable}`);
        }
        if (prompt.validation?.min !== undefined && num < prompt.validation.min) {
          throw new Error(`Value must be at least ${prompt.validation.min}`);
        }
        if (prompt.validation?.max !== undefined && num > prompt.validation.max) {
          throw new Error(`Value must be at most ${prompt.validation.max}`);
        }
        return num;
        
      case 'confirm':
        return Boolean(input);
        
      case 'select':
        if (prompt.options) {
          const validValues = prompt.options.map(opt => opt.value);
          if (!validValues.includes(input)) {
            throw new Error(`Invalid selection. Choose from: ${validValues.join(', ')}`);
          }
        }
        return input;
        
      case 'text':
      default:
        const text = String(input);
        if (prompt.validation?.pattern) {
          const regex = new RegExp(prompt.validation.pattern);
          if (!regex.test(text)) {
            throw new Error(prompt.validation.message || `Invalid format for ${prompt.variable}`);
          }
        }
        return text;
    }
  }

  /**
   * Create helper methods for common prompt patterns
   */
  createTextPrompt(variable: string, message: string, options: Partial<PromptDefinition> = {}): string {
    const prompt: PromptDefinition = {
      id: `text_prompt_${variable}_${Date.now()}`,
      type: 'text',
      message,
      variable,
      ...options
    };
    return this.promptToScript(prompt);
  }

  createSelectPrompt(variable: string, message: string, options: Array<{ label: string; value: any }>, promptOptions: Partial<PromptDefinition> = {}): string {
    const prompt: PromptDefinition = {
      id: `select_prompt_${variable}_${Date.now()}`,
      type: 'select',
      message,
      variable,
      options,
      ...promptOptions
    };
    return this.promptToScript(prompt);
  }

  createConfirmPrompt(variable: string, message: string, options: Partial<PromptDefinition> = {}): string {
    const prompt: PromptDefinition = {
      id: `confirm_prompt_${variable}_${Date.now()}`,
      type: 'confirm',
      message,
      variable,
      ...options
    };
    return this.promptToScript(prompt);
  }

  createNumberPrompt(variable: string, message: string, options: Partial<PromptDefinition> = {}): string {
    const prompt: PromptDefinition = {
      id: `number_prompt_${variable}_${Date.now()}`,
      type: 'number',
      message,
      variable,
      ...options
    };
    return this.promptToScript(prompt);
  }
}

export const interactiveBlockExecutor = new InteractiveBlockExecutor();