import { resource, task, event, middleware, createContext, index } from "@bluelibs/runner";
import { DurablePipeline, DurableStep, DurableContext } from "./durable_pipeline.js";
import { 
  DistributedPromiseManager, 
  DistributedPromise,
  distributedPromiseManager 
} from "./distributed_promise_manager.js";
import { 
  DistributedAwait, 
  PromiseEventRegistry, 
  SuspendablePromise,
  DistributedTimer,
  DistributedAwaitContext
} from "./distributed_event_system.js";
import { 
  DistributedRecoveryManager,
  FilePersistenceAdapter,
  distributedRecoveryManager,
  filePersistenceAdapter
} from "./distributed_persistence.js";

// Enhanced durable step with distributed execution and BlueLibs features
export interface DistributedDurableStep<TInput, TOutput> {
  id: string;
  maxRetries: number;
  retryDelay: number;
  timeout?: number;
  run: (input: TInput, context: DistributedDurableContext) => Promise<TOutput>;
  compensate?: (input: TInput, output: TOutput, context: DistributedDurableContext) => Promise<void>;
  
  // BlueLibs integration features
  dependencies?: any;
  middleware?: any[];
  on?: any; // Event listener
  meta?: Record<string, any>;
  
  // Distributed execution options
  distributed?: {
    // Allow migration to other machines
    migratable?: boolean;
    // Events that can resume this step
    resumeEvents?: string[];
    // Timeout before considering step for migration
    migrationTimeout?: number;
    // Required machine capabilities
    requiredCapabilities?: string[];
  };
}

// Enhanced durable context with distributed capabilities
export interface DistributedDurableContext {
  executionId: string;
  stepId: string;
  attemptCount: number;
  isResuming: boolean;
  checkpoint: <T>(data: T) => Promise<void>;
  logger: any;
  // Distributed promise management
  createDistributedPromise<T>(
    executor: (resolve: (value: T) => void, reject: (reason?: any) => void) => void,
    options?: { id?: string; metadata?: Record<string, any> }
  ): DistributedPromise<T>;
  
  // Suspend and wait for events
  suspendUntilEvent<T>(
    promise: DistributedPromise<T>, 
    eventId: string,
    condition?: (data: any) => boolean
  ): Promise<T>;
  
  // Timer-based suspension
  suspendForDuration<T>(
    promise: DistributedPromise<T>,
    duration: number
  ): Promise<T>;
  
  // Migration utilities
  requestMigration(reason: string): Promise<void>;
  getMachineCapabilities(): string[];
}

// Distributed pipeline that integrates with existing durable pipeline
export class BlueLibsDistributedPipeline<TInput, TOutput> {
  private distributedManager: DistributedPromiseManager;
  private eventRegistry: PromiseEventRegistry;
  private distributedAwait: DistributedAwait;
  private steps: DistributedDurableStep<any, any>[];
  private id: string;

  constructor(
    id: string,
    steps: DistributedDurableStep<any, any>[],
    distributedManager: DistributedPromiseManager,
    eventRegistry: PromiseEventRegistry
  ) {
    this.id = id;
    this.steps = steps;
    this.distributedManager = distributedManager;
    this.eventRegistry = eventRegistry;
    this.distributedAwait = new DistributedAwait(distributedManager, eventRegistry);
  }

  // Execute with distributed capabilities
  async executeDistributed(
    input: TInput, 
    options: { 
      executionId?: string;
      allowMigration?: boolean;
      requiredCapabilities?: string[];
    } = {}
  ): Promise<TOutput> {
    const executionId = options.executionId || `dist-${Date.now()}-${Math.random()}`;
    
    // Create distributed execution context
    return DistributedAwaitContext.provide(this.distributedAwait, async () => {
      return this.executeSteps(input, executionId);
    });
  }

  // Execute steps with distributed capabilities
  private async executeSteps(input: TInput, executionId: string): Promise<TOutput> {
    let currentInput: any = input;
    
    for (const step of this.steps) {
      const result = await this.executeStep(step, currentInput, executionId);
      if (!result.success) {
        throw new Error(`Step ${step.id} failed: ${result.error}`);
      }
      currentInput = result.output;
    }
    
    return currentInput as TOutput;
  }

  // Execute individual step with distributed capabilities
  private async executeStep(
    step: DistributedDurableStep<any, any>,
    input: any,
    executionId: string
  ): Promise<{ success: true; output: any } | { success: false; error: string }> {

    // Create distributed context
    const distributedContext: DistributedDurableContext = {
      executionId,
      stepId: step.id,
      attemptCount: 1,
      isResuming: false,
      checkpoint: async (data) => {
        console.log(`Checkpoint created for step ${step.id}:`, data);
      },
      logger: {
        info: (msg: string, data?: any) => console.log(`[${step.id}] ${msg}`, data || ""),
        error: (msg: string, error?: any) => console.error(`[${step.id}] ${msg}`, error || ""),
      },
      
      createDistributedPromise: <T>(
        executor: (resolve: (value: T) => void, reject: (reason?: any) => void) => void,
        options: { id?: string; metadata?: Record<string, any> } = {}
      ) => {
        return this.distributedManager.createPromise(executor, {
          ...options,
          taskId: step.id,
          metadata: { ...options.metadata, stepId: step.id, pipelineId: this.id },
        });
      },

      suspendUntilEvent: async <T>(
        promise: DistributedPromise<T>,
        eventId: string,
        condition?: (data: any) => boolean
      ) => {
        return this.distributedAwait.suspendForEvent(promise, [{
          eventId,
          condition,
          once: true,
        }]);
      },

      suspendForDuration: async <T>(
        promise: DistributedPromise<T>,
        duration: number
      ) => {
        const timerId = `timer-${Date.now()}-${Math.random()}`;
        setTimeout(() => {
          this.eventRegistry.triggerEvent("timer.expired", { timerId });
        }, duration);

        return this.distributedAwait.suspendForEvent(promise, [{
          eventId: "timer.expired",
          condition: (data) => data.timerId === timerId,
          once: true,
        }]);
      },

      requestMigration: async (reason: string) => {
        console.log(`Migration requested for step ${step.id}: ${reason}`);
      },

      getMachineCapabilities: () => {
        return ['distributed-execution', 'event-suspension', 'migration'];
      },
    };

    try {
      console.log(`Executing step ${step.id} with distributed context`);
      
      // Execute with distributed context
      const output = await step.run(input, distributedContext);
      
      console.log(`Step ${step.id} completed successfully`);
      return { success: true, output };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Step ${step.id} failed:`, errorMessage);
      return { success: false, error: errorMessage };
    }
  }

}

// Builder for distributed pipelines
export class DistributedPipelineBuilder {
  private steps: DistributedDurableStep<any, any>[] = [];

  addDistributedStep<TInput, TOutput>(
    step: DistributedDurableStep<TInput, TOutput>
  ): DistributedPipelineBuilder {
    this.steps.push(step);
    return this;
  }

  addSuspendableStep<TInput, TOutput>(
    id: string,
    handler: (input: TInput, context: DistributedDurableContext) => Promise<TOutput>,
    options: {
      maxRetries?: number;
      delay?: number;
      timeout?: number;
      migratable?: boolean;
      resumeEvents?: string[];
      dependencies?: any;
      middleware?: any[];
      on?: any;
      meta?: Record<string, any>;
      compensate?: (input: TInput, output: TOutput, context: DistributedDurableContext) => Promise<void>;
    } = {}
  ): DistributedPipelineBuilder {
    return this.addDistributedStep({
      id,
      maxRetries: options.maxRetries || 3,
      retryDelay: options.delay || 1000,
      timeout: options.timeout,
      run: handler,
      compensate: options.compensate,
      dependencies: options.dependencies,
      middleware: options.middleware,
      on: options.on,
      meta: options.meta,
      distributed: {
        migratable: options.migratable ?? true,
        resumeEvents: options.resumeEvents || [],
      },
    });
  }

  build(
    id: string,
    distributedManager: DistributedPromiseManager,
    eventRegistry: PromiseEventRegistry
  ): BlueLibsDistributedPipeline<any, any> {
    return new BlueLibsDistributedPipeline(id, this.steps, distributedManager, eventRegistry);
  }
}

// Tasks for distributed operations
export const distributePromiseExecution = task({
  id: "distributed.promise.execute",
  dependencies: { 
    promiseManager: distributedPromiseManager,
  },
  run: async (
    { promiseId, executor, options }: {
      promiseId?: string;
      executor: (resolve: Function, reject: Function) => void;
      options?: any;
    },
    { promiseManager }
  ) => {
    const promise = promiseManager.createPromise(executor, { 
      id: promiseId, 
      ...options 
    });
    return promise.id;
  },
});

export const resumeDistributedPromise = task({
  id: "distributed.promise.resume",
  dependencies: { 
    promiseManager: distributedPromiseManager,
  },
  run: async (
    { promiseId, event }: { promiseId: string; event?: any },
    { promiseManager }
  ) => {
    const resumedPromise = await promiseManager.resumePromise(promiseId, event);
    return resumedPromise ? (resumedPromise as any).id : null;
  },
});

// Middleware for automatic distributed promise management
export const distributedExecutionMiddleware = middleware({
  id: "distributed.execution",
  dependencies: {
    promiseManager: distributedPromiseManager,
    recovery: distributedRecoveryManager,
  },
  run: async (context: any, { promiseManager, recovery }) => {
    const { next } = context;
    const input = (context as any).input || {};
    
    // In real implementation, would check task metadata for distributed flag
    console.log('Executing task with distributed middleware');
    
    return next(input);
  },
});

// Events for distributed system integration
export const distributedTaskStarted = event<{
  taskId: string;
  promiseId: string;
  machineId: string;
}>({
  id: "distributed.task.started"
});

export const distributedTaskSuspended = event<{
  taskId: string;
  promiseId: string;
  reason: string;
}>({
  id: "distributed.task.suspended"
});

export const distributedTaskResumed = event<{
  taskId: string;
  promiseId: string;
  machineId: string;
}>({
  id: "distributed.task.resumed"
});

// Helper functions for common distributed patterns
export function createDistributedTask<TInput, TOutput>(
  id: string,
  handler: (input: TInput, dependencies?: any, config?: any) => Promise<TOutput>,
  options: {
    dependencies?: any;
    middleware?: any[];
    on?: any;
    meta?: Record<string, any>;
    migratable?: boolean;
    resumeEvents?: string[];
    requiredCapabilities?: string[];
  } = {}
) {
  // Create a wrapped object that provides the correct interface
  const distributedTask = {
    id,
    handler,
    options,
    // Provide a properly typed run method
    run: async (input: TInput, dependencies: any = {}) => {
      return await handler(input, dependencies);
    }
  };
  
  return distributedTask;
}

export function distributedAsync<TArgs extends any[], TResult>(
  id: string,
  fn: (...args: TArgs) => Promise<TResult>
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs) => {
    // Simplified implementation that just calls the function
    // In real implementation, would create distributed promise
    console.log(`Executing distributed async function: ${id}`);
    return await fn(...args);
  };
}

// Complete distributed system resource
export const distributedSystem = resource({
  id: "distributed.system",
  dependencies: {
    promiseManager: distributedPromiseManager,
    persistence: filePersistenceAdapter,
    recovery: distributedRecoveryManager,
  },
  init: async (_, deps) => {
    const eventRegistry = new PromiseEventRegistry();
    const timer = new DistributedTimer(eventRegistry);
    const distributedAwait = new DistributedAwait(deps.promiseManager, eventRegistry);

    // Set up distributed await context
    return {
      promiseManager: deps.promiseManager,
      eventRegistry,
      timer,
      distributedAwait,
      persistence: deps.persistence,
      recovery: deps.recovery,
      
      // Factory methods
      createPipeline: (id: string) => new DistributedPipelineBuilder().build(
        id, 
        deps.promiseManager, 
        eventRegistry
      ),
      
      createDistributedPromise: <T>(
        executor: (resolve: (value: T) => void, reject: (reason?: any) => void) => void,
        options?: any
      ) => deps.promiseManager.createPromise(executor, options),
    };
  },
  dispose: async (system) => {
    system.timer.clearAll();
  },
});

// Index of all distributed resources for easy dependency injection
export const distributedResources = index({
  system: distributedSystem,
  promiseManager: distributedPromiseManager,
  persistence: filePersistenceAdapter,
  recovery: distributedRecoveryManager,
});

export default distributedResources;