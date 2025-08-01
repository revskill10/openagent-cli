// streaming-ai-parser.ts - Linear streaming AI response parser with concurrent execution
import { BlockParser, Block, Step } from './simple-tools.js';
import { durableBlockExecutor } from './durable-block-executor.js';
import { UserInputHandler } from './interactive-block-executor.js';
import { systemEventEmitter } from './system-events.js';

export interface StreamingParseResult {
  id: string;
  type: 'partial_block' | 'complete_block' | 'execution_result' | 'error';
  block?: Block;
  partialContent?: string;
  executionResult?: any;
  error?: string;
  executionId?: string;
}

export interface ConcurrentExecutionOptions {
  inputHandler?: UserInputHandler;
  maxConcurrentBlocks?: number;
  executionTimeout?: number;
  persistExecution?: boolean;
}


/**
 * Streaming AI response parser that processes linear AI output and executes blocks concurrently
 */
export class StreamingAIParser {
  private parseId = 0;
  private activeExecutions = new Map<string, AsyncGenerator<any, void, unknown>>();
  private blockParser = new BlockParser();

  private async *withTimeout<T>(iterable: AsyncIterable<T>, ms: number) {
  const timer = setTimeout(() => {
    throw new Error('Model response timeout');
  }, ms);
  try {
    for await (const value of iterable) {
      clearTimeout(timer);
      yield value;
    }
  } finally {
    clearTimeout(timer);
  }
}
  /**
   * Process streaming AI response and execute blocks concurrently as they're parsed
   */
  async *processStreamingResponse(
    aiResponseStream: AsyncIterable<string>,
    options: ConcurrentExecutionOptions = {}
  ): AsyncGenerator<StreamingParseResult, void, unknown> {
    const sessionId = `parse_session_${++this.parseId}_${Date.now()}`;
    const responseBuffer = new StreamingResponseBuffer();
    const executionQueue = new ConcurrentExecutionQueue(options);

    try {
      systemEventEmitter.emitTaskStart(sessionId, 'streaming-parser', 'Processing streaming AI response');

      // Process AI response stream linearly
     for await (const chunk of aiResponseStream) {
        // Add chunk to buffer
        responseBuffer.addChunk(chunk);

        // Yield partial content for real-time display
        yield {
          id: `${sessionId}_partial_${Date.now()}`,
          type: 'partial_block',
          partialContent: chunk,
        };

        // Try to parse complete blocks from buffer
        const completedBlocks = responseBuffer.extractCompleteBlocks();
        for (const block of completedBlocks) {
          // Yield the parsed block
          yield {
            id: `${sessionId}_block_${Date.now()}`,
            type: 'complete_block',
            block,
          };

          // Start concurrent execution of the block
          const executionId = `${sessionId}_exec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          const executionStream = this.executeBlockConcurrently(block, executionId, options);
          executionQueue.addExecution(executionId, executionStream);
        }

        // Yield any execution results that are ready
        for await (const result of executionQueue.pollResults()) {
          yield {
            id: result.id,
            type: 'execution_result',
            executionResult: result.data,
            executionId: result.executionId,
          };
        }
      }

      // Process any remaining content in buffer
      const finalBlocks = await responseBuffer.extractRemainingBlocks(); // ✅ Await async method
      for (const block of finalBlocks) {
        yield {
          id: `${sessionId}_final_block_${Date.now()}`,
          type: 'complete_block',
          block,
        };

        const executionId = `${sessionId}_final_${Date.now()}`;
        const executionStream = this.executeBlockConcurrently(block, executionId, options);
        executionQueue.addExecution(executionId, executionStream);
      }

      // Wait for all executions to complete
      for await (const result of executionQueue.waitForAll()) {
        yield {
          id: result.id,
          type: 'execution_result',
          executionResult: result.data,
          executionId: result.executionId,
        };
      }

      systemEventEmitter.emitTaskComplete(sessionId, {
        totalBlocks: responseBuffer.extractCompleteBlocks().length + finalBlocks.length,
        executions: executionQueue.getCompletedCount(),
      });
    } catch (error) {
      systemEventEmitter.emitTaskError(sessionId, error instanceof Error ? error.message : String(error));
      yield {
        id: `${sessionId}_error`,
        type: 'error',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Execute a single block concurrently
   */
  private async *executeBlockConcurrently(
    block: Block,
    executionId: string,
    options: ConcurrentExecutionOptions
  ): AsyncGenerator<any, void, unknown> {
    try {
      const blockScript = this.blockToScript(block);
      for await (const result of durableBlockExecutor.executeDurable(blockScript, {
        executionId,
        inputHandler: options.inputHandler,
        autoCleanup: !options.persistExecution,
        timeout: options.executionTimeout,
      })) {
        yield {
          id: result.id,
          executionId,
          data: result,
          timestamp: Date.now(),
        };
      }
    } catch (error) {
      yield {
        id: `${executionId}_error`,
        executionId,
        data: { error: error instanceof Error ? error.message : String(error) },
        timestamp: Date.now(),
      };
    }
  }

  private blockToScript(block: Block): string {
    switch (block.type) {
      case 'SEQUENTIAL':
        return `[SEQUENTIAL]${JSON.stringify({ steps: block.steps })}[END_SEQUENTIAL]`;
      case 'PARALLEL':
        return `[PARALLEL]${JSON.stringify(block.steps)}[END_PARALLEL]`;
      case 'IF':
        return `[IF]${block.cond}
${this.blockToScript(block.body)}[END_IF]`;
      case 'WHILE':
        return `[WHILE]${block.cond}
${this.blockToScript(block.body)}[END_WHILE]`;
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
}

/**
 * Buffer for streaming response that can extract complete blocks as they arrive
 */
class StreamingResponseBuffer {
  private buffer = '';
  private blockParser = new BlockParser();
private parseAnyBlock(text: string): Block | null {
  const types: Array<'ASSIGN' | 'TOOL' | 'PROMPT' | 'SEQUENTIAL' | 'PARALLEL' | 'IF' | 'WHILE'> = 
    ['ASSIGN', 'TOOL', 'PROMPT', 'SEQUENTIAL', 'PARALLEL', 'IF', 'WHILE'];
  
  for (const type of types) {
    const result = this.parseBlockText(text, type);
    if (result) return result;
  }
  return null;
}
  // Replace the addChunk method in StreamingResponseBuffer with:
addChunk(chunk: string): void {
  this.buffer += chunk;
  
  // 🚨 FIXED: Allow multiple sequential tool requests
  // Don't remove subsequent tool requests - they should all be executed
}

// Add new method to handle streaming fragments
private isCompleteBlock(text: string): boolean {
  const patterns = [
    /\[TOOL_REQUEST\][\s\S]*?\[END_TOOL_REQUEST\]/,
    /\[ASSIGN\][\s\S]*?\[END_ASSIGN\]/,
    /\[PROMPT\][\s\S]*?\[END_PROMPT\]/,
  ];
  
  return patterns.some(pattern => pattern.test(text));
}

  // Add these helper methods to StreamingResponseBuffer:

private normalizeBlockText(blockText: string): string {
  return blockText
    // Fix common JSON issues
    .replace(/([{,]\s*)(\w+):/g, '$1"$2":')  // Unquoted keys
    .replace(/'/g, '"')  // Single quotes to double
    .replace(/,\s*}/g, '}')  // Trailing commas
    .replace(/,\s*]/g, ']')
    // Fix block boundaries
    .replace(/\[TOOL_REQUEST\]\s*/g, '[TOOL_REQUEST]')
    .replace(/\s*\[END_TOOL_REQUEST\]/g, '[END_TOOL_REQUEST]');
}
private logRawOutput(buffer: string): void {
  console.log('=== RAW AI OUTPUT ===');
  console.log(JSON.stringify(buffer));
  console.log('=== END RAW ===');
}
// Update extractCompleteBlocks to use normalization:
// Update the patterns in extractCompleteBlocks method to be more precise
extractCompleteBlocks(): Block[] {
  const newBlocks: Block[] = [];
  
  // 🚨 FIXED: Extract ALL complete blocks sequentially
  const completeToolPattern = /\[TOOL_REQUEST\](\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})\[END_TOOL_REQUEST\]/g;
  
  let match;
  let processedBuffer = this.buffer;
  
  // Extract all complete blocks in order
  while ((match = completeToolPattern.exec(this.buffer)) !== null) {
    try {
      const blockText = match[0];
      const jsonStr = match[1];
      
      // Try parsing, skip if fails
      JSON.parse(jsonStr);
      
      const block = this.parseBlockText(blockText, 'TOOL');
      if (block) {
        newBlocks.push(block);
        // Remove this block from buffer so we don't process it again
        processedBuffer = processedBuffer.replace(blockText, '');
      }
    } catch (error) {
      // Skip incomplete/invalid blocks
      console.warn('Skipping incomplete block:', match[0].substring(0, 50));
    }
  }
  
  // Update buffer to remove processed blocks
  this.buffer = processedBuffer.trim();
  
  return newBlocks;
}
// Add this method to StreamingResponseBuffer
extractStreamingBlock(): Block | null {
  // Handle the case where we have partial JSON
  const toolMatch = /\[TOOL_REQUEST\](.*)/.exec(this.buffer);
  if (toolMatch && !toolMatch[1].includes('[END_TOOL_REQUEST]')) {
    // Look for the closing tag in subsequent chunks
    const endMatch = /(.*\[END_TOOL_REQUEST\])/.exec(this.buffer);
    if (endMatch) {
      const completeBlock = '[TOOL_REQUEST]' + endMatch[1];
      const block = this.parseBlockText(completeBlock, 'TOOL');
      if (block) {
        this.buffer = this.buffer.replace(completeBlock, '').trim();
        return block;
      }
    }
  }
  return null;
}
  /**
   * Extract any remaining blocks using the async parser
   */
  async extractRemainingBlocks(): Promise<Block[]> {
    const remainingBlocks: Block[] = [];
    if (!this.buffer.trim()) return remainingBlocks;

    try {
      const parseGenerator = this.blockParser.parseBlocksStreaming(this.buffer);
      let result = await parseGenerator.next();
      while (!result.done) {
        if (result.value.kind === 'block') {
          remainingBlocks.push(result.value.block);
        }
        result = await parseGenerator.next();
      }
    } catch (error) {
      console.warn('Failed to parse remaining blocks:', error);
    }

    return remainingBlocks;
  }

  private sanitizeJsonString(jsonStr: string): string {
    return jsonStr
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')
      .replace(/"/g, '\\"')
      .trim();
}
private ensureBlockClosed(blockText: string, start: string, end: string): string {
  if (blockText.includes(start) && !blockText.includes(end)) {
    return blockText.trim() + end;
  }
  return blockText;
}

  private parseBlockText(blockText: string, type: string): Block | null {
  try {
    switch (type) {
      case 'ASSIGN': {
        const match = /\[ASSIGN\]\s*([^=\n]+?)\s*=\s*([\s\S]*?)\[END_ASSIGN\]/.exec(blockText);
        if (match) {
          return {
            type: 'ASSIGN',
            variable: match[1].trim(),
            expression: match[2].trim(),
          };
        }
        break;
      }

      // Update the TOOL case in parseBlockText with better validation:
// Replace the TOOL case with this ultra-resilient version:
case 'TOOL': {
  const match = /\[TOOL_REQUEST\]([\s\S]*?)\[END_TOOL_REQUEST\]/.exec(blockText);
  if (match) {
    try {
      let jsonStr = match[1].trim();
      
      // 🛡️ Aggressive JSON sanitization
      jsonStr = jsonStr
        .replace(/'/g, '"')                    // Single quotes to double
        .replace(/([{,]\s*)(\w+):/g, '$1"$2":') // Unquoted keys
        .replace(/,\s*([}\]])/g, '$1')         // Remove trailing commas
        .replace(/\\"/g, '"')                  // Fix escaped quotes
        .replace(/"\s*:\s*"/g, '":"')          // Clean spacing
        .replace(/\s+/g, ' ')                  // Normalize whitespace
        .trim();

      // 🛡️ Try parsing, fallback to error recovery
      let step: any;
      try {
        step = JSON.parse(jsonStr);
      } catch (parseError) {
        console.warn(`JSON parse failed, trying repair: ${jsonStr}`);
        
        // 🛡️ Emergency repair for common issues
        const repaired = jsonStr
          .replace(/(\w+):/g, '"$1":')         // Quote all keys
          .replace(/:\s*([^"{[\d-]\w*)\s*([,}])/g, ':"$1"$2') // Quote string values
          .replace(/:\s*"(\d+\.?\d*)"/g, ':$1'); // Unquote numbers
        
        step = JSON.parse(repaired);
      }

      // ✅ Build guaranteed-valid step
      return {
        type: 'TOOL',
        step: {
          id: String(step.id || `tool_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`),
          tool: String(step.tool || step.name || 'echo'),
          params: step.params || step.arguments || {}
        }
      };
    } catch (error) {
      console.error(`Unrecoverable TOOL_REQUEST parse error:`, error);
      
      // 🛡️ Return safe fallback that won't break execution
      return {
        type: 'TOOL',
        step: {
          id: `fallback_${Date.now()}`,
          tool: 'echo',
          params: { 
            message: `Parse failed for: ${blockText.substring(0, 100)}...`,
            original: blockText
          }
        }
      };
    }
  }
  return null;
}

      case 'PROMPT': {
        const match = /\[PROMPT\]([\s\S]*?)\[END_PROMPT\]/.exec(blockText);
        if (match) {
          try {
            const jsonStr = this.sanitizeJsonString(match[1].trim());
            const prompt = JSON.parse(jsonStr);
            return { type: 'PROMPT', prompt };
          } catch (jsonError) {
            console.warn(`Invalid JSON in PROMPT: ${match[1].trim().substring(0, 100)}...`);
            return null;
          }
        }
        break;
      }

      case 'SEQUENTIAL': {
        const match = /\[SEQUENTIAL\]([\s\S]*?)\[END_SEQUENTIAL\]/.exec(blockText);
        if (match) {
          try {
            const jsonStr = this.sanitizeJsonString(match[1].trim());
            const data = JSON.parse(jsonStr);
            const steps = Array.isArray(data) ? data : (data.steps || []);
            return { type: 'SEQUENTIAL', steps };
          } catch (jsonError) {
            console.warn(`Invalid JSON in SEQUENTIAL: ${match[1].trim().substring(0, 100)}...`);
            return null;
          }
        }
        break;
      }

      case 'PARALLEL': {
        const match = /\[PARALLEL\]([\s\S]*?)\[END_PARALLEL\]/.exec(blockText);
        if (match) {
          try {
            const jsonStr = this.sanitizeJsonString(match[1].trim());
            const data = JSON.parse(jsonStr);
            const steps = Array.isArray(data) ? data : (data.steps || []);
            return { type: 'PARALLEL', steps };
          } catch (jsonError) {
            console.warn(`Invalid JSON in PARALLEL: ${match[1].trim().substring(0, 100)}...`);
            return null;
          }
        }
        break;
      }

      case 'IF': {
        const match = /\[IF\]\s*([^\n]+?)\n([\s\S]*?)\[END_IF\]/.exec(blockText);
        if (match) {
          const condition = match[1].trim();
          const bodyText = match[2].trim();

          // Try to parse the body as any block
          const bodyBlock = this.parseAnyBlock(bodyText);

          // Fallback: valid TOOL block with full Step
          const fallbackStep = {
            id: `fallback_if_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            tool: 'noop',
            params: {}
          };

          return {
            type: 'IF',
            cond: condition,
            body: bodyBlock || { type: 'TOOL', step: fallbackStep }
          };
        }
        break;
      }

      case 'WHILE': {
        const match = /\[WHILE\]\s*([^\n]+?)\n([\s\S]*?)\[END_WHILE\]/.exec(blockText);
        if (match) {
          const condition = match[1].trim();
          const bodyText = match[2].trim();

          const bodyBlock = this.parseAnyBlock(bodyText);

          const fallbackStep = {
            id: `fallback_while_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            tool: 'noop',
            params: {}
          };

          return {
            type: 'WHILE',
            cond: condition,
            body: bodyBlock || { type: 'TOOL', step: fallbackStep }
          };
        }
        break;
      }

      default:
        console.warn(`Unknown block type requested: ${type}`);
        return null;
    }
  } catch (error) {
    console.warn(`Failed to parse ${type} block:`, error);
  }
  return null;
  }
}

/**
 * Queue for managing concurrent block executions
 */
class ConcurrentExecutionQueue {
  private executions = new Map<string, AsyncGenerator<any, void, unknown>>();
  private results: Array<{ id: string; executionId: string; data: any; timestamp: number }> = [];
  private completedExecutions = new Set<string>();
  private maxConcurrent: number;

  constructor(options: ConcurrentExecutionOptions) {
    this.maxConcurrent = options.maxConcurrentBlocks || 5;
  }

  addExecution(executionId: string, execution: AsyncGenerator<any, void, unknown>): void {
    this.executions.set(executionId, execution);
    this.processExecution(executionId, execution);
  }

  private async processExecution(executionId: string, execution: AsyncGenerator<any, void, unknown>): Promise<void> {
    try {
      for await (const result of execution) {
        this.results.push(result);
      }
    } catch (error) {
      this.results.push({
        id: `${executionId}_error`,
        executionId,
        data: { error: error instanceof Error ? error.message : String(error) },
        timestamp: Date.now(),
      });
    } finally {
      this.completedExecutions.add(executionId);
      this.executions.delete(executionId);
    }
  }

  async *pollResults(): AsyncGenerator<{ id: string; executionId: string; data: any; timestamp: number }, void, unknown> {
    while (this.results.length > 0) {
      const result = this.results.shift()!;
      yield result;
    }
  }

  async *waitForAll(): AsyncGenerator<{ id: string; executionId: string; data: any; timestamp: number }, void, unknown> {
    yield* this.pollResults();
    while (this.executions.size > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
      yield* this.pollResults();
    }
    yield* this.pollResults();
  }

  getCompletedCount(): number {
    return this.completedExecutions.size;
  }

  getActiveCount(): number {
    return this.executions.size;
  }
}

export const streamingAIParser = new StreamingAIParser();