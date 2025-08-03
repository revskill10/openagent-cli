// durable-block-executor.ts - Durable execution system with persistence and resumption
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync, readdirSync } from 'fs';
import { join } from 'path';
import { streamingBlockExecutor, StreamingExecutionOptions, StreamingExecutionResult } from './streaming-block-executor.js';
import { systemEventEmitter } from './system-events.js';

export interface ExecutionState {
  id: string;
  script: string;
  options: StreamingExecutionOptions;
  variables: Record<string, any>;
  completedSteps: string[];
  currentStep?: string;
  status: 'queued' | 'running' | 'paused' | 'completed' | 'failed';
  startTime: number;
  lastUpdate: number;
  errors: string[];
  backgroundJob?: boolean;
}

export interface BackgroundExecutionJob {
  id: string;
  state: ExecutionState;
  promise: Promise<void>;
  controller: AbortController;
  streamCallback?: (result: StreamingExecutionResult & { executionState?: ExecutionState }) => void;
}

export interface DurableExecutionOptions extends StreamingExecutionOptions {
  executionId?: string;
  persistenceDir?: string;
  autoCleanup?: boolean;
  resumeOnRestart?: boolean;
  requireToolApproval?: boolean;
}

/**
 * Compact system prompt for kimi-k2 token limits  
 */
export const STREAMING_EXECUTION_SYSTEM_PROMPT = `
ONLY [ ] brackets: [TOOL_REQUEST]{"id":"x","tool":"name","params":{}}[END_TOOL_REQUEST]
NO < > brackets. Use \${var}.
`;

/**
 * Create compact AI execution prompt
 */
export function createAIExecutionPrompt(systemPrompt: string, userQuery: string): string {
  return `${systemPrompt}

${STREAMING_EXECUTION_SYSTEM_PROMPT}

REQUEST: ${userQuery}`;
}

/**
 * Durable block executor with persistence and resumption capabilities
 */
export class DurableBlockExecutor {
  private persistenceDir: string;
  private activeExecutions = new Map<string, ExecutionState>();
  private backgroundJobs = new Map<string, BackgroundExecutionJob>();
  private maxConcurrentJobs = 5;

  constructor(persistenceDir: string = '.tmp/executions') {
    this.persistenceDir = persistenceDir;
    this.ensurePersistenceDir();
    this.loadActiveExecutions();
    this.startBackgroundProcessor();
  }

  /**
   * Execute blocks with durable persistence (non-blocking)
   */
  async *executeDurable(
    script: string,
    options: DurableExecutionOptions = {}
  ): AsyncGenerator<StreamingExecutionResult & { executionState?: ExecutionState }, void, unknown> {
    const executionId = options.executionId || `exec_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    // Check if this is a resumed execution
    let state = this.loadExecutionState(executionId);
    if (!state) {
      // Create new execution state
      state = {
        id: executionId,
        script,
        options,
        variables: { ...(options.variables || {}) },
        completedSteps: [],
        status: 'queued',
        startTime: Date.now(),
        lastUpdate: Date.now(),
        errors: [],
        backgroundJob: true
      };
    } else {
      // Resume existing execution
      state.status = 'queued';
      state.lastUpdate = Date.now();
      console.log(`🔄 Resuming execution ${executionId} with ${state.completedSteps.length} completed steps`);
    }

    this.activeExecutions.set(executionId, state);
    this.saveExecutionState(state);

    // Start background execution
    yield* this.executeInBackground(state, options);

  }

  /**
   * Execute in background with streaming to UI only when needed
   */
  private async *executeInBackground(
    state: ExecutionState,
    options: DurableExecutionOptions
  ): AsyncGenerator<StreamingExecutionResult & { executionState?: ExecutionState }, void, unknown> {
    const controller = new AbortController();

    // Immediate status update
    yield {
      id: state.id,
      type: 'status',
      result: 'Execution queued for background processing',
      done: false,
      executionState: { ...state }
    };

    try {
      // Create background job
      const job: BackgroundExecutionJob = {
        id: state.id,
        state,
        controller,
        promise: this.runBackgroundExecution(state, options, controller.signal),
        streamCallback: undefined
      };

      this.backgroundJobs.set(state.id, job);

      // Stream status updates
      yield* this.streamBackgroundJobStatus(job);

    } catch (error) {
      state.status = 'failed';
      state.errors.push(String(error));
      this.saveExecutionState(state);

      yield {
        id: state.id,
        type: 'error',
        error: String(error),
        done: true,
        executionState: { ...state }
      };
    }
  }

  /**
   * Run execution in background without blocking
   */
  private async runBackgroundExecution(
    state: ExecutionState,
    options: DurableExecutionOptions,
    signal: AbortSignal
  ): Promise<void> {
    try {
      state.status = 'running';
      state.lastUpdate = Date.now();
      this.saveExecutionState(state);

      systemEventEmitter.emitTaskStart(state.id, 'durable-executor', `Background execution: ${state.script.substring(0, 50)}...`);

      // Execute with streaming and state tracking
      for await (const result of streamingBlockExecutor.executePromptStreaming(state.script, {
        ...options,
        variables: state.variables
      })) {
        if (signal.aborted) {
          throw new Error('Execution aborted');
        }

        // Update execution state
        state.lastUpdate = Date.now();

        if (result.done && result.id) {
          if (result.error) {
            state.errors.push(`${result.id}: ${result.error}`);
          } else {
            state.completedSteps.push(result.id);

            // Store result as variable if it has a meaningful result
            if (result.result !== undefined && result.id) {
              state.variables[result.id] = result.result;
            }
          }
        }

        if (result.variables) {
          // Merge any new variables from the execution
          state.variables = { ...state.variables, ...result.variables };
        }

        // Save state after each step
        this.saveExecutionState(state);

        // Check if tool approval is needed
        if (result.type === 'tool' && !result.done && options.requireToolApproval) {
          const job = this.backgroundJobs.get(state.id);
          if (job?.streamCallback) {
            job.streamCallback({
              id: result.id,
              type: 'tool_approval_needed',
              toolName: result.tool || 'unknown',
              toolResult: result.result,
              done: false,
              executionState: { ...state }
            });
          }
          // Pause execution until approval is received
          // This would need to be implemented with a proper approval mechanism
        }

        // Notify UI of important updates only
        const job = this.backgroundJobs.get(state.id);
        if (job?.streamCallback && (result.done || result.error || result.type === 'tool_start' || result.type === 'tool_complete')) {
          job.streamCallback({
            ...result,
            executionState: { ...state }
          });
        }
      }

      // Mark execution as completed
      state.status = 'completed';
      state.lastUpdate = Date.now();
      this.saveExecutionState(state);

      systemEventEmitter.emitTaskComplete(state.id, {
        completedSteps: state.completedSteps.length,
        variables: Object.keys(state.variables).length,
        duration: Date.now() - state.startTime
      });

      // Cleanup if auto-cleanup is enabled
      if (options.autoCleanup !== false) {
        await this.cleanupExecution(state.id);
      }

    } catch (error) {
      state.status = 'failed';
      state.errors.push(error instanceof Error ? error.message : String(error));
      state.lastUpdate = Date.now();
      this.saveExecutionState(state);

      systemEventEmitter.emitTaskError(state.id, state.errors.join('; '));
      throw error;
    } finally {
      this.backgroundJobs.delete(state.id);
    }
  }

  /**
   * Stream background job status updates
   */
  private async *streamBackgroundJobStatus(
    job: BackgroundExecutionJob
  ): AsyncGenerator<StreamingExecutionResult & { executionState?: ExecutionState }, void, unknown> {
    const results: (StreamingExecutionResult & { executionState?: ExecutionState })[] = [];

    // Set up callback to collect results
    job.streamCallback = (result) => {
      results.push(result);
    };

    // Poll for status updates
    const pollInterval = 100; // 100ms
    const maxWait = 30000; // 30 seconds max wait
    let elapsed = 0;

    while (elapsed < maxWait) {
      // Yield any collected results
      while (results.length > 0) {
        const result = results.shift()!;
        yield result;

        if (result.done && result.executionState?.status === 'completed') {
          return;
        }
      }

      // Check if job is still running
      const currentJob = this.backgroundJobs.get(job.id);
      if (!currentJob) {
        // Job completed or failed
        yield {
          id: job.id,
          type: 'status',
          result: 'Background execution completed',
          done: true,
          executionState: { ...job.state }
        };
        return;
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      elapsed += pollInterval;
    }

    // Timeout - but job continues in background
    yield {
      id: job.id,
      type: 'status',
      result: 'Background execution continues (UI timeout)',
      done: false,
      executionState: { ...job.state }
    };
  }

  /**
   * Start background processor for managing concurrent jobs
   */
  private startBackgroundProcessor(): void {
    setInterval(() => {
      this.cleanupCompletedJobs();
    }, 5000); // Cleanup every 5 seconds
  }

  /**
   * Clean up completed background jobs
   */
  private cleanupCompletedJobs(): void {
    for (const [jobId, job] of this.backgroundJobs.entries()) {
      if (job.state.status === 'completed' || job.state.status === 'failed') {
        this.backgroundJobs.delete(jobId);
        console.log(`🧹 Cleaned up background job ${jobId}`);
      }
    }
  }

  /**
   * Get status of all background jobs
   */
  getBackgroundJobsStatus(): { id: string; status: string; progress: number }[] {
    return Array.from(this.backgroundJobs.values()).map(job => ({
      id: job.id,
      status: job.state.status,
      progress: job.state.completedSteps.length / Math.max(1, job.state.completedSteps.length + 1)
    }));
  }

  /**
   * Cancel a background job
   */
  cancelBackgroundJob(executionId: string): boolean {
    const job = this.backgroundJobs.get(executionId);
    if (job) {
      job.controller.abort();
      job.state.status = 'failed';
      job.state.errors.push('Execution cancelled by user');
      this.saveExecutionState(job.state);
      this.backgroundJobs.delete(executionId);
      return true;
    }
    return false;
  }

  /**
   * Resume a paused or failed execution
   */
  async *resumeExecution(
    executionId: string,
    options: Partial<DurableExecutionOptions> = {}
  ): AsyncGenerator<StreamingExecutionResult & { executionState?: ExecutionState }, void, unknown> {
    const state = this.loadExecutionState(executionId);
    if (!state) {
      throw new Error(`Execution ${executionId} not found`);
    }

    console.log(`🔄 Resuming execution ${executionId}`);
    
    yield* this.executeDurable(state.script, {
      ...state.options,
      ...options,
      executionId,
      variables: state.variables
    });
  }

  /**
   * Pause an active execution
   */
  pauseExecution(executionId: string): boolean {
    const state = this.activeExecutions.get(executionId);
    if (state && state.status === 'running') {
      state.status = 'paused';
      state.lastUpdate = Date.now();
      this.saveExecutionState(state);
      return true;
    }
    return false;
  }

  /**
   * Get execution status
   */
  getExecutionState(executionId: string): ExecutionState | null {
    return this.activeExecutions.get(executionId) || this.loadExecutionState(executionId);
  }

  /**
   * List all executions
   */
  listExecutions(): ExecutionState[] {
    const states: ExecutionState[] = [];
    
    // Add active executions
    for (const state of this.activeExecutions.values()) {
      states.push(state);
    }
    
    // Add persisted executions
    try {
      const files = readdirSync(this.persistenceDir);
      for (const file of files) {
        if (file.endsWith('.json') && !file.startsWith('variables_')) {
          const executionId = file.replace('.json', '');
          if (!this.activeExecutions.has(executionId)) {
            const state = this.loadExecutionState(executionId);
            if (state) states.push(state);
          }
        }
      }
    } catch {
      // Directory doesn't exist or is empty
    }
    
    return states.sort((a, b) => b.lastUpdate - a.lastUpdate);
  }

  /**
   * Clean up completed or failed executions
   */
  async cleanupExecution(executionId: string): Promise<void> {
    try {
      // Remove from active executions
      this.activeExecutions.delete(executionId);
      
      // Remove persistence files
      const stateFile = join(this.persistenceDir, `${executionId}.json`);
      const variablesFile = join(this.persistenceDir, `variables_${executionId}.json`);
      
      if (existsSync(stateFile)) {
        unlinkSync(stateFile);
      }
      if (existsSync(variablesFile)) {
        unlinkSync(variablesFile);
      }
      
      console.log(`🧹 Cleaned up execution ${executionId}`);
    } catch (error) {
      console.warn(`Failed to cleanup execution ${executionId}:`, error);
    }
  }

  /**
   * Clean up all completed executions
   */
  async cleanupCompleted(): Promise<number> {
    const executions = this.listExecutions();
    let cleaned = 0;
    
    for (const execution of executions) {
      if (execution.status === 'completed') {
        await this.cleanupExecution(execution.id);
        cleaned++;
      }
    }
    
    return cleaned;
  }

  private ensurePersistenceDir(): void {
    if (!existsSync(this.persistenceDir)) {
      mkdirSync(this.persistenceDir, { recursive: true });
    }
  }

  private saveExecutionState(state: ExecutionState): void {
    try {
      const stateFile = join(this.persistenceDir, `${state.id}.json`);
      const variablesFile = join(this.persistenceDir, `variables_${state.id}.json`);
      
      // Save execution state without variables (for efficiency)
      const stateWithoutVars = { ...state };
      delete (stateWithoutVars as any).variables;
      writeFileSync(stateFile, JSON.stringify(stateWithoutVars, null, 2));
      
      // Save variables separately (can be large)
      writeFileSync(variablesFile, JSON.stringify(state.variables, null, 2));
    } catch (error) {
      console.warn(`Failed to save execution state ${state.id}:`, error);
    }
  }

  private loadExecutionState(executionId: string): ExecutionState | null {
    try {
      const stateFile = join(this.persistenceDir, `${executionId}.json`);
      const variablesFile = join(this.persistenceDir, `variables_${executionId}.json`);
      
      if (!existsSync(stateFile)) {
        return null;
      }
      
      const state = JSON.parse(readFileSync(stateFile, 'utf8')) as ExecutionState;
      
      // Load variables if available
      if (existsSync(variablesFile)) {
        state.variables = JSON.parse(readFileSync(variablesFile, 'utf8'));
      } else {
        state.variables = {};
      }
      
      return state;
    } catch (error) {
      console.warn(`Failed to load execution state ${executionId}:`, error);
      return null;
    }
  }

  private loadActiveExecutions(): void {
    try {
      const executions = this.listExecutions();
      for (const execution of executions) {
        if (execution.status === 'running' || execution.status === 'paused') {
          this.activeExecutions.set(execution.id, execution);
        }
      }
      console.log(`📂 Loaded ${this.activeExecutions.size} active executions from persistence`);
    } catch (error) {
      console.warn('Failed to load active executions:', error);
    }
  }
}

export const durableBlockExecutor = new DurableBlockExecutor();