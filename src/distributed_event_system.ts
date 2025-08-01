import { task, event, middleware, createContext } from "@bluelibs/runner";
import { DistributedPromiseManager, DistributedPromise, promiseResumed } from "./distributed_promise_manager.js";

// Event types for promise resumption
export interface PromiseResumptionEvent {
  type: 'external_trigger' | 'timeout' | 'dependency_resolved' | 'manual_resume';  
  promiseId: string;
  data?: any;
  triggeredBy?: string;
  timestamp: Date;
}

export interface EventTrigger {
  eventId: string;
  condition?: (eventData: any) => boolean;
  transform?: (eventData: any) => any;
  once?: boolean; // Auto-unregister after first trigger
}

// Promise event binding registry
export class PromiseEventRegistry {
  private bindings = new Map<string, EventTrigger[]>();
  private suspendedPromises = new Map<string, {
    promiseId: string;
    resumeCallback: (data: any) => void;
    triggers: EventTrigger[];
  }>();

  // Bind a promise to resume on specific events
  bindPromiseToEvent(
    promiseId: string, 
    triggers: EventTrigger[],
    resumeCallback: (data: any) => void
  ): void {
    this.suspendedPromises.set(promiseId, {
      promiseId,
      resumeCallback,
      triggers,
    });

    // Register event listeners for each trigger
    for (const trigger of triggers) {
      const existing = this.bindings.get(trigger.eventId) || [];
      existing.push({ ...trigger });
      this.bindings.set(trigger.eventId, existing);
    }
  }

  // Trigger event and resume matching promises
  async triggerEvent(eventId: string, eventData: any): Promise<string[]> {
    const triggers = this.bindings.get(eventId) || [];
    const resumedPromises: string[] = [];

    for (const trigger of triggers) {
      // Check condition
      if (trigger.condition && !trigger.condition(eventData)) {
        continue;
      }

      // Find suspended promises for this trigger
      for (const [promiseId, binding] of this.suspendedPromises) {
        if (binding.triggers.some(t => t.eventId === eventId)) {
          const transformedData = trigger.transform ? trigger.transform(eventData) : eventData;
          
          // Resume the promise
          binding.resumeCallback(transformedData);
          resumedPromises.push(promiseId);

          // Remove if once-only trigger
          if (trigger.once) {
            this.unbindPromise(promiseId);
          }
        }
      }

      // Clean up once-only triggers
      if (trigger.once) {
        const remaining = triggers.filter(t => t !== trigger);
        if (remaining.length === 0) {
          this.bindings.delete(eventId);
        } else {
          this.bindings.set(eventId, remaining);
        }
      }
    }

    return resumedPromises;
  }

  // Remove promise bindings
  unbindPromise(promiseId: string): void {
    const binding = this.suspendedPromises.get(promiseId);
    if (!binding) return;

    // Remove from event bindings
    for (const trigger of binding.triggers) {
      const triggers = this.bindings.get(trigger.eventId) || [];
      const filtered = triggers.filter(t => t !== trigger);
      if (filtered.length === 0) {
        this.bindings.delete(trigger.eventId);
      } else {
        this.bindings.set(trigger.eventId, filtered);
      }
    }

    this.suspendedPromises.delete(promiseId);
  }

  // List all suspended promises waiting for events
  listSuspendedPromises(): Array<{
    promiseId: string;
    triggers: EventTrigger[];
  }> {
    return Array.from(this.suspendedPromises.values()).map(binding => ({
      promiseId: binding.promiseId,
      triggers: binding.triggers,
    }));
  }

  // Get triggers for specific event
  getTriggersForEvent(eventId: string): EventTrigger[] {
    return this.bindings.get(eventId) || [];
  }
}

// Distributed await implementation with event resumption
export class DistributedAwait {
  constructor(
    private promiseManager: DistributedPromiseManager,
    private eventRegistry: PromiseEventRegistry
  ) {}

  // Suspend promise and wait for event
  async suspendForEvent<T>(
    promise: DistributedPromise<T>,
    triggers: EventTrigger[]
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      // Set up resumption callback
      this.eventRegistry.bindPromiseToEvent(
        promise.id,
        triggers,
        (eventData) => {
          // Resume promise with event data
          this.promiseManager.resumePromise(promise.id, eventData)
            .then(resumedPromise => {
              if (resumedPromise) {
                resumedPromise.then((value: any) => resolve(value)).catch(reject);
              } else {
                reject(new Error(`Failed to resume promise ${promise.id}`));
              }
            })
            .catch(reject);
        }
      );

      // Suspend the original promise
      promise.suspend().then(() => {
        // Promise is now suspended and waiting for event
      }).catch(reject);
    });
  }

  // Create suspendable async function
  suspendable<TArgs extends any[], TResult>(
    fn: (...args: TArgs) => Promise<TResult>
  ): (...args: TArgs) => SuspendablePromise<TResult> {
    return (...args: TArgs) => {
      const distributedPromise = this.promiseManager.createPromise<TResult>(
        async (resolve, reject) => {
          try {
            const result = await fn(...args);
            resolve(result);
          } catch (error) {
            reject(error);
          }
        }
      );

      return new SuspendablePromise(distributedPromise, this);
    };
  }
}

// Suspendable promise wrapper  
export class SuspendablePromise<T> {
  private promise: Promise<T>;

  constructor(
    private distributedPromise: DistributedPromise<T>,
    private awaitManager: DistributedAwait
  ) {
    this.promise = distributedPromise;
  }

  // Suspend until specific event occurs  
  suspendUntil(triggers: EventTrigger[]): Promise<T> {
    return this.awaitManager.suspendForEvent(this.distributedPromise, triggers);
  }

  // Suspend until single event with condition
  suspendUntilEvent(
    eventId: string, 
    condition?: (data: any) => boolean,
    transform?: (data: any) => any
  ): Promise<T> {
    return this.suspendUntil([{ eventId, condition, transform, once: true }]);
  }

  // Get the underlying distributed promise
  getDistributedPromise(): DistributedPromise<T> {
    return this.distributedPromise;
  }

  // Make it thenable like a Promise
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.promise.then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null
  ): Promise<T | TResult> {
    return this.promise.catch(onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<T> {
    return this.promise.finally(onfinally);
  }
}

// BlueLibs events for common resumption patterns
export const taskCompleted = event<{ taskId: string; result: any }>({
  id: "task.completed"
});

export const resourceReady = event<{ resourceId: string; resource: any }>({
  id: "resource.ready"
});

export const timerExpired = event<{ timerId: string; duration: number }>({
  id: "timer.expired"
});

export const userAction = event<{ userId: string; action: string; data: any }>({
  id: "user.action"
});

export const httpResponse = event<{ requestId: string; status: number; data: any }>({
  id: "http.response"
});

// Context for distributed await system
export const DistributedAwaitContext = createContext<DistributedAwait>("distributed.await");

// Timer service for time-based resumption
export class DistributedTimer {
  private timers = new Map<string, NodeJS.Timeout>();

  constructor(private eventRegistry: PromiseEventRegistry) {}

  // Set timer that will trigger promise resumption
  setTimer(timerId: string, delay: number, data?: any): void {
    // Clear existing timer
    this.clearTimer(timerId);

    const timeout = setTimeout(() => {
      this.eventRegistry.triggerEvent("timer.expired", {
        timerId,
        duration: delay,
        data,
      });
      this.timers.delete(timerId);
    }, delay);

    this.timers.set(timerId, timeout);
  }

  // Clear timer
  clearTimer(timerId: string): void {
    const timer = this.timers.get(timerId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(timerId);
    }
  }

  // Clear all timers
  clearAll(): void {
    for (const [timerId] of this.timers) {
      this.clearTimer(timerId);
    }
  }
}

// Task for handling external events
export const externalEventHandler = task({
  id: "distributed.external.event.handler",
  run: async (event: { 
    eventId: string; 
    data: any; 
    source?: string;
  }) => {
    // In real implementation, would access event registry from context
    console.log('External event received:', event.eventId);
    
    return {
      eventId: event.eventId,
      resumedPromises: [],
      timestamp: new Date(),
    };
  },
});

// Middleware for automatic promise resumption on events
export const promiseResumptionMiddleware = middleware({
  id: "distributed.promise.resumption",
  run: async (context: any) => {
    const { next } = context;
    const input = (context as any).input || {};
    
    // Check if this task result should trigger promise resumption
    const result = await next(input);
    
    // In real implementation, would access task metadata and trigger events
    console.log('Task completed, result:', result);

    return result;
  },
});

// Helper functions for common patterns
export function createEventTrigger(
  eventId: string,
  options: {
    condition?: (data: any) => boolean;
    transform?: (data: any) => any;
    once?: boolean;
  } = {}
): EventTrigger {
  return {
    eventId,
    condition: options.condition,
    transform: options.transform,
    once: options.once ?? true,
  };
}

export function waitForTask(taskId: string): EventTrigger {
  return createEventTrigger("task.completed", {
    condition: (data) => data.taskId === taskId,
    transform: (data) => data.result,
  });
}

export function waitForResource(resourceId: string): EventTrigger {
  return createEventTrigger("resource.ready", {
    condition: (data) => data.resourceId === resourceId,
    transform: (data) => data.resource,
  });
}

export function waitForUserAction(userId: string, action?: string): EventTrigger {
  return createEventTrigger("user.action", {
    condition: (data) => data.userId === userId && (!action || data.action === action),
    transform: (data) => data.data,
  });
}

export function waitForTimer(duration: number): EventTrigger {
  const timerId = `timer-${Date.now()}-${Math.random()}`;
  
  // Set the timer when trigger is created
  setTimeout(() => {
    // Would emit timer event in real implementation
    console.log('Timer expired:', timerId);
  }, duration);

  return createEventTrigger("timer.expired", {
    condition: (data) => data.timerId === timerId,
  });
}