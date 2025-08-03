// streaming-block-executor.ts - Enhanced streaming execution with full control flow support
import { blockParser, Block, PromptDefinition } from './simple-tools.js';
import { executeBlocksStreaming, BlockResult } from './block-executor.js';
import { interactiveBlockExecutor, UserInputHandler } from './interactive-block-executor.js';
import { systemEventEmitter } from './system-events.js';

export interface StreamingExecutionOptions {
  timeout?: number;
  maxRetries?: number;
  variables?: Record<string, any>;
  inputHandler?: UserInputHandler;
  interactive?: boolean;
}

export interface StreamingExecutionResult {
  id: string;
  type: 'block' | 'tool' | 'assignment' | 'prompt' | 'error' | 'status' | 'tool_start' | 'tool_complete' | 'execution_queued' | 'tool_approval_needed';
  result?: any;
  partial?: any;
  error?: string;
  done: boolean;
  variables?: Record<string, any>;
  promptNeeded?: PromptDefinition;
  userResponse?: any;
  waitingForInput?: boolean;
  toolName?: string;
  toolCall?: any;
  validationError?: {
    error: string;
    correctionPrompt: string;
  };
}

/**
 * Enhanced streaming block executor with full control flow support
 */
export class StreamingBlockExecutor {
  private executionId = 0;

  /**
   * Execute a prompt with streaming control flow resolution
   */
  async *executePromptStreaming(
    prompt: string, 
    options: StreamingExecutionOptions = {}
  ): AsyncGenerator<StreamingExecutionResult, void, unknown> {
    // Use interactive executor if interactive mode is enabled or inputHandler is provided
    if (options.interactive || options.inputHandler) {
      yield* this.executeInteractivePrompt(prompt, options);
      return;
    }
    const execId = `exec_${++this.executionId}_${Date.now()}`;
    
    try {
      systemEventEmitter.emitTaskStart(execId, 'system', 'Execute streaming prompt with control flow');
      
      // Parse the prompt into blocks
      const blocks: Block[] = [];
      for await (const token of blockParser.parseBlocksStreaming(prompt)) {
        if (token.kind === 'block') {
          blocks.push(token.block);
        } else if (token.kind === 'error') {
          yield {
            id: execId,
            type: 'error',
            error: token.message,
            done: true
          };
          return;
        }
      }

      if (blocks.length === 0) {
        yield {
          id: execId,
          type: 'error',
          error: 'No executable blocks found in prompt',
          done: true
        };
        return;
      }

      // Execute each block with streaming
      let variables = { ...(options.variables || {}) };
      
      for (const block of blocks) {
        const blockScript = this.blockToScript(block);
        
        try {
          for await (const result of executeBlocksStreaming(blockScript, options.inputHandler)) {
            // Update variables from assignments
            if (result.result && typeof result.result === 'object' && result.id?.startsWith('assign_')) {
              const varName = this.extractVariableName(result.id);
              if (varName) {
                variables[varName] = result.result;
              }
            }

            // Handle validation errors
            if (result.validationError) {
              yield {
                id: result.id,
                type: 'error',
                error: `Validation error: ${result.validationError.error}`,
                done: false,
                variables: { ...variables }
              };
              continue;
            }

            yield {
              id: result.id,
              type: this.getResultType(result),
              result: result.result,
              partial: result.partial,
              error: result.error,
              done: result.done,
              variables: { ...variables }
            };
          }
        } catch (error) {
          yield {
            id: execId,
            type: 'error',
            error: error instanceof Error ? error.message : String(error),
            done: true,
            variables: { ...variables }
          };
        }
      }

      systemEventEmitter.emitTaskComplete(execId, { blocks: blocks.length, variables });
      
    } catch (error) {
      systemEventEmitter.emitTaskError(execId, error instanceof Error ? error.message : String(error));
      yield {
        id: execId,
        type: 'error',
        error: error instanceof Error ? error.message : String(error),
        done: true
      };
    }
  }

  /**
   * Execute prompt with interactive capabilities
   */
  private async *executeInteractivePrompt(
    prompt: string,
    options: StreamingExecutionOptions
  ): AsyncGenerator<StreamingExecutionResult, void, unknown> {
    for await (const result of interactiveBlockExecutor.executeInteractiveBlocks(prompt, options)) {
      yield {
        id: result.id,
        type: result.promptNeeded ? 'prompt' : 
              result.id?.startsWith('assign_') ? 'assignment' :
              result.tool ? 'tool' : 'block',
        result: result.result,
        partial: result.partial,
        error: result.error,
        done: result.done,
        promptNeeded: result.promptNeeded,
        userResponse: result.userResponse,
        waitingForInput: result.waitingForInput
      };
    }
  }

  /**
   * Convert a Block to executable script format
   */
  private blockToScript(block: Block): string {
    switch (block.type) {
      case 'SEQUENTIAL':
        return `[SEQUENTIAL]${JSON.stringify({ steps: block.steps })}[END_SEQUENTIAL]`;
        
      case 'PARALLEL':
        return `[PARALLEL]${JSON.stringify(block.steps)}[END_PARALLEL]`;
        
      case 'IF':
        return `[IF]${block.cond}\n${this.blockToScript(block.body)}[END_IF]`;
        
      case 'WHILE':
        return `[WHILE]${block.cond}\n${this.blockToScript(block.body)}[END_WHILE]`;
        
      case 'ASSIGN':
        return `[ASSIGN]${block.variable} = ${block.expression}[END_ASSIGN]`;
        
      case 'PROMPT':
        return `[PROMPT]${JSON.stringify(block.prompt)}[END_PROMPT]`;
        
      case 'TOOL':
        return `[TOOL_REQUEST]${JSON.stringify(block.step)}[END_TOOL_REQUEST]`;
        
      default:
        throw new Error(`Unknown block type: ${(block as any).type}`);
    }
  }

  /**
   * Determine result type from BlockResult
   */
  private getResultType(result: BlockResult): StreamingExecutionResult['type'] {
    if (result.error) return 'error';
    if (result.id?.startsWith('assign_')) return 'assignment';
    if (result.tool) return 'tool';
    return 'block';
  }

  /**
   * Extract variable name from assignment result ID
   */
  private extractVariableName(resultId: string): string | null {
    // This is a simple implementation - in practice you'd need to track this better
    return null; // TODO: Implement proper variable name tracking
  }

  /**
   * Create a simple tool execution script
   */
  createToolScript(toolName: string, params: any, options: { id?: string; retry?: number; timeout?: number } = {}): string {
    const step = {
      id: options.id || `tool_${Date.now()}`,
      tool: toolName,
      params,
      retry: options.retry,
      timeout: options.timeout
    };
    
    return `[TOOL_REQUEST]${JSON.stringify(step)}[END_TOOL_REQUEST]`;
  }

  /**
   * Create a sequential execution script
   */
  createSequentialScript(steps: Array<{ tool: string; params: any; id?: string }>): string {
    const stepsWithIds = steps.map((step, i) => ({
      id: step.id || `step_${i}_${Date.now()}`,
      tool: step.tool,
      params: step.params
    }));
    
    return `[SEQUENTIAL]${JSON.stringify({ steps: stepsWithIds })}[END_SEQUENTIAL]`;
  }

  /**
   * Create a parallel execution script
   */
  createParallelScript(steps: Array<{ tool: string; params: any; id?: string }>): string {
    const stepsWithIds = steps.map((step, i) => ({
      id: step.id || `step_${i}_${Date.now()}`,
      tool: step.tool,
      params: step.params
    }));
    
    return `[PARALLEL]${JSON.stringify(stepsWithIds)}[END_PARALLEL]`;
  }

  /**
   * Create a conditional execution script
   */
  createConditionalScript(condition: string, body: string): string {
    return `[IF]${condition}\n${body}[END_IF]`;
  }

  /**
   * Create a loop execution script
   */
  createLoopScript(condition: string, body: string): string {
    return `[WHILE]${condition}\n${body}[END_WHILE]`;
  }

  /**
   * Create an assignment script
   */
  createAssignmentScript(variable: string, expression: string): string {
    return `[ASSIGN]${variable} = ${expression}[END_ASSIGN]`;
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
    return `[PROMPT]${JSON.stringify(prompt)}[END_PROMPT]`;
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
    return `[PROMPT]${JSON.stringify(prompt)}[END_PROMPT]`;
  }

  createConfirmPrompt(variable: string, message: string, options: Partial<PromptDefinition> = {}): string {
    const prompt: PromptDefinition = {
      id: `confirm_prompt_${variable}_${Date.now()}`,
      type: 'confirm',
      message,
      variable,
      ...options
    };
    return `[PROMPT]${JSON.stringify(prompt)}[END_PROMPT]`;
  }

  createNumberPrompt(variable: string, message: string, options: Partial<PromptDefinition> = {}): string {
    const prompt: PromptDefinition = {
      id: `number_prompt_${variable}_${Date.now()}`,
      type: 'number',
      message,
      variable,
      ...options
    };
    return `[PROMPT]${JSON.stringify(prompt)}[END_PROMPT]`;
  }
}

export const streamingBlockExecutor = new StreamingBlockExecutor();