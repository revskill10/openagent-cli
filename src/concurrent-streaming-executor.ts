// concurrent-streaming-executor.ts - Concurrent streaming tool execution with result merging
import { unifiedToolExecutor } from './tools/unified-tool-executor.js';
import { systemEventEmitter } from './system-events.js';

export interface ConcurrentStreamingResult {
  id: string;
  toolName: string;
  type: 'start' | 'progress' | 'complete' | 'error';
  data?: any;
  error?: string;
  timestamp: number;
  executionTime?: number;
}

export interface ConcurrentExecutionContext {
  maxConcurrent?: number;
  timeout?: number;
  retries?: number;
  priority?: 'low' | 'normal' | 'high';
}

/**
 * Concurrent streaming tool executor that can run multiple tools in parallel
 * while streaming their results in real-time
 */
export class ConcurrentStreamingExecutor {
  private activeExecutions = new Map<string, ExecutionState>();
  private executionQueue: PriorityQueue<QueuedExecution>;
  private maxConcurrent: number;
  private executionId = 0;

  constructor(maxConcurrent: number = 10) {
    this.maxConcurrent = maxConcurrent;
    this.executionQueue = new PriorityQueue();
  }

  /**
   * Execute multiple tool calls concurrently with streaming results
   */
  async *executeConcurrentStreaming(
    toolCalls: Array<{ name: string; arguments: any; id?: string; priority?: 'low' | 'normal' | 'high' }>,
    context: ConcurrentExecutionContext = {}
  ): AsyncGenerator<ConcurrentStreamingResult, void, unknown> {
    const sessionId = `concurrent_session_${++this.executionId}_${Date.now()}`;
    
    systemEventEmitter.emitTaskStart(sessionId, 'concurrent-executor', `Executing ${toolCalls.length} tools concurrently`);
    
    // Queue all tool calls
    for (const toolCall of toolCalls) {
      const execution: QueuedExecution = {
        id: toolCall.id || `tool_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        toolName: toolCall.name,
        arguments: toolCall.arguments,
        priority: toolCall.priority || 'normal',
        context,
        queuedAt: Date.now()
      };
      
      this.executionQueue.enqueue(execution, this.getPriorityScore(execution.priority));
    }

    // Process queue with concurrent execution
    const processingPromise = this.processQueue();
    
    // Stream results as they become available
    yield* this.streamResults(sessionId);
    
    // Wait for all executions to complete
    await processingPromise;
    
    systemEventEmitter.emitTaskComplete(sessionId, {
      totalExecutions: toolCalls.length,
      completed: this.getCompletedCount(),
      errors: this.getErrorCount()
    });
  }

  /**
   * Add a single tool execution to the concurrent queue
   */
  async addToolExecution(
    toolName: string,
    arguments_: any,
    context: ConcurrentExecutionContext & { id?: string; priority?: 'low' | 'normal' | 'high' } = {}
  ): Promise<string> {
    const execution: QueuedExecution = {
      id: context.id || `tool_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      toolName,
      arguments: arguments_,
      priority: context.priority || 'normal',
      context,
      queuedAt: Date.now()
    };
    
    this.executionQueue.enqueue(execution, this.getPriorityScore(execution.priority));
    return execution.id;
  }

  /**
   * Stream results from all active executions
   */
  private async *streamResults(sessionId: string): AsyncGenerator<ConcurrentStreamingResult, void, unknown> {
    const resultBuffer = new Map<string, ConcurrentStreamingResult[]>();
    
    while (this.hasActiveExecutions() || !this.executionQueue.isEmpty()) {
      // Collect results from all active executions
      for (const [executionId, state] of this.activeExecutions) {
        if (!resultBuffer.has(executionId)) {
          resultBuffer.set(executionId, []);
        }
        
        // Check for new results
        const newResults = await this.pollExecutionResults(state);
        for (const result of newResults) {
          resultBuffer.get(executionId)!.push(result);
          yield result;
        }
        
        // Clean up completed executions
        if (state.status === 'completed' || state.status === 'error') {
          this.activeExecutions.delete(executionId);
        }
      }
      
      // Small delay to prevent busy waiting
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  /**
   * Process the execution queue with concurrency limits
   */
  private async processQueue(): Promise<void> {
    while (!this.executionQueue.isEmpty() || this.activeExecutions.size > 0) {
      // Start new executions if under limit
      while (this.activeExecutions.size < this.maxConcurrent && !this.executionQueue.isEmpty()) {
        const execution = this.executionQueue.dequeue()!;
        await this.startExecution(execution);
      }
      
      // Wait a bit before checking again
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  /**
   * Start a single tool execution
   */
  private async startExecution(execution: QueuedExecution): Promise<void> {
    const state: ExecutionState = {
      id: execution.id,
      toolName: execution.toolName,
      status: 'running',
      startTime: Date.now(),
      results: [],
      stream: null
    };
    
    this.activeExecutions.set(execution.id, state);
    
    try {
      // Create tool call format
      const toolCall = {
        name: execution.toolName,
        arguments: execution.arguments,
        format: 'custom' as const
      };
      
      // Start streaming tool execution
      state.stream = unifiedToolExecutor.executeToolCallStreaming(toolCall, execution.context);
      
      // Emit start event
      state.results.push({
        id: execution.id,
        toolName: execution.toolName,
        type: 'start',
        timestamp: Date.now()
      });
      
    } catch (error) {
      state.status = 'error';
      state.results.push({
        id: execution.id,
        toolName: execution.toolName,
        type: 'error',
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now()
      });
    }
  }

  /**
   * Poll results from a specific execution
   */
  private async pollExecutionResults(state: ExecutionState): Promise<ConcurrentStreamingResult[]> {
    const newResults: ConcurrentStreamingResult[] = [];
    
    if (!state.stream || state.status !== 'running') {
      return state.results.splice(0); // Return and clear buffered results
    }
    
    try {
      const { value, done } = await state.stream.next();
      
      if (!done && value) {
        // Process streaming result
        const result: ConcurrentStreamingResult = {
          id: state.id,
          toolName: state.toolName,
          type: value.done ? 'complete' : 'progress',
          data: value.result || value.partial,
          timestamp: Date.now(),
          executionTime: value.executionTime
        };
        
        if (value.error) {
          result.type = 'error';
          result.error = value.error;
          state.status = 'error';
        } else if (value.done) {
          state.status = 'completed';
        }
        
        newResults.push(result);
      } else if (done) {
        // Execution completed
        state.status = 'completed';
        
        if (newResults.length === 0) {
          // Add completion marker if no final result was yielded
          newResults.push({
            id: state.id,
            toolName: state.toolName,
            type: 'complete',
            timestamp: Date.now(),
            executionTime: Date.now() - state.startTime
          });
        }
      }
    } catch (error) {
      state.status = 'error';
      newResults.push({
        id: state.id,
        toolName: state.toolName,
        type: 'error',
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
        executionTime: Date.now() - state.startTime
      });
    }
    
    // Add any buffered results
    newResults.unshift(...state.results.splice(0));
    
    return newResults;
  }

  private getPriorityScore(priority: 'low' | 'normal' | 'high'): number {
    switch (priority) {
      case 'high': return 3;
      case 'normal': return 2;
      case 'low': return 1;
      default: return 2;
    }
  }

  private hasActiveExecutions(): boolean {
    return this.activeExecutions.size > 0;
  }

  private getCompletedCount(): number {
    return Array.from(this.activeExecutions.values())
      .filter(state => state.status === 'completed').length;
  }

  private getErrorCount(): number {
    return Array.from(this.activeExecutions.values())
      .filter(state => state.status === 'error').length;
  }

  /**
   * Get current execution status
   */
  getExecutionStatus(): {
    active: number;
    queued: number;
    completed: number;
    errors: number;
  } {
    return {
      active: this.activeExecutions.size,
      queued: this.executionQueue.size(),
      completed: this.getCompletedCount(),
      errors: this.getErrorCount()
    };
  }

  /**
   * Cancel all pending executions
   */
  cancelPending(): number {
    const cancelled = this.executionQueue.size();
    this.executionQueue.clear();
    return cancelled;
  }
}

interface QueuedExecution {
  id: string;
  toolName: string;
  arguments: any;
  priority: 'low' | 'normal' | 'high';
  context: ConcurrentExecutionContext;
  queuedAt: number;
}

interface ExecutionState {
  id: string;
  toolName: string;
  status: 'running' | 'completed' | 'error';
  startTime: number;
  results: ConcurrentStreamingResult[];
  stream: AsyncGenerator<any, void, unknown> | null;
}

/**
 * Priority queue implementation for tool executions
 */
class PriorityQueue<T> {
  private items: Array<{ item: T; priority: number }> = [];

  enqueue(item: T, priority: number): void {
    const element = { item, priority };
    let added = false;
    
    for (let i = 0; i < this.items.length; i++) {
      if (element.priority > this.items[i].priority) {
        this.items.splice(i, 0, element);
        added = true;
        break;
      }
    }
    
    if (!added) {
      this.items.push(element);
    }
  }

  dequeue(): T | undefined {
    return this.items.shift()?.item;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  size(): number {
    return this.items.length;
  }

  clear(): void {
    this.items = [];
  }
}

export const concurrentStreamingExecutor = new ConcurrentStreamingExecutor();