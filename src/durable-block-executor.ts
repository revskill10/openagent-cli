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
  status: 'running' | 'paused' | 'completed' | 'failed';
  startTime: number;
  lastUpdate: number;
  errors: string[];
}

export interface DurableExecutionOptions extends StreamingExecutionOptions {
  executionId?: string;
  persistenceDir?: string;
  autoCleanup?: boolean;
  resumeOnRestart?: boolean;
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

  constructor(persistenceDir: string = '.tmp/executions') {
    this.persistenceDir = persistenceDir;
    this.ensurePersistenceDir();
    this.loadActiveExecutions();
  }

  /**
   * Execute blocks with durable persistence
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
        status: 'running',
        startTime: Date.now(),
        lastUpdate: Date.now(),
        errors: []
      };
    } else {
      // Resume existing execution
      state.status = 'running';
      state.lastUpdate = Date.now();
      console.log(`🔄 Resuming execution ${executionId} with ${state.completedSteps.length} completed steps`);
    }

    this.activeExecutions.set(executionId, state);
    this.saveExecutionState(state);

    try {
      systemEventEmitter.emitTaskStart(executionId, 'durable-executor', `Durable execution: ${script.substring(0, 50)}...`);

      // Execute with streaming and state tracking
      for await (const result of streamingBlockExecutor.executePromptStreaming(script, {
        ...options,
        variables: state.variables
      })) {
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

        // Yield result with execution state
        yield {
          ...result,
          executionState: { ...state }
        };
      }

      // Mark execution as completed
      state.status = 'completed';
      state.lastUpdate = Date.now();
      this.saveExecutionState(state);

      systemEventEmitter.emitTaskComplete(executionId, { 
        completedSteps: state.completedSteps.length,
        variables: Object.keys(state.variables).length,
        duration: Date.now() - state.startTime
      });

      // Cleanup if auto-cleanup is enabled
      if (options.autoCleanup !== false) {
        await this.cleanupExecution(executionId);
      }

    } catch (error) {
      state.status = 'failed';
      state.errors.push(error instanceof Error ? error.message : String(error));
      state.lastUpdate = Date.now();
      this.saveExecutionState(state);
      
      systemEventEmitter.emitTaskError(executionId, state.errors.join('; '));
      
      yield {
        id: executionId,
        type: 'error',
        error: `Durable execution failed: ${error instanceof Error ? error.message : String(error)}`,
        done: true,
        executionState: { ...state }
      };
    }
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