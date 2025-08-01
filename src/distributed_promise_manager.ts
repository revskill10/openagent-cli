import { resource, task, event, createContext } from "@bluelibs/runner";
import * as crypto from "crypto";

// Core types for distributed promises
export interface DistributedPromiseState {
  id: string;
  machineId: string;
  status: 'pending' | 'running' | 'fulfilled' | 'rejected' | 'suspended';
  result?: any;
  error?: Error;
  createdAt: Date;
  updatedAt: Date;
  suspendedAt?: Date;
  continuationData?: SerializedContinuation;
  dependencies: string[];
  dependents: string[];
  metadata: Record<string, any>;
}

export interface SerializedContinuation {
  promiseId: string;
  taskId: string;
  stackTrace: any[];
  localState: Record<string, any>;
  position: number;
  awaitedPromises: string[];
}

export interface DistributedPromiseEvent {
  type: 'created' | 'resumed' | 'suspended' | 'fulfilled' | 'rejected' | 'migrated';
  promiseId: string;
  machineId: string;
  timestamp: Date;
  data?: any;
}

// Promise persistence interface
export interface PromisePersistenceAdapter {
  savePromise(state: DistributedPromiseState): Promise<void>;
  loadPromise(id: string): Promise<DistributedPromiseState | null>;
  listPromises(filter: {
    status?: string[];
    machineId?: string;
    taskId?: string;
  }): Promise<DistributedPromiseState[]>;
  deletePromise(id: string): Promise<void>;
  
  // Event log for distributed coordination
  logEvent(event: DistributedPromiseEvent): Promise<void>;
  getEvents(promiseId: string): Promise<DistributedPromiseEvent[]>;
  
  // Lease management for exactly-once execution
  acquireLease(promiseId: string, machineId: string, ttl: number): Promise<boolean>;
  renewLease(promiseId: string, machineId: string, ttl: number): Promise<boolean>;
  releaseLease(promiseId: string, machineId: string): Promise<void>;
}

// In-memory implementation for development
export class InMemoryPromisePersistence implements PromisePersistenceAdapter {
  private promises = new Map<string, DistributedPromiseState>();
  private events = new Map<string, DistributedPromiseEvent[]>();
  private leases = new Map<string, { machineId: string; expiresAt: Date }>();

  async savePromise(state: DistributedPromiseState): Promise<void> {
    state.updatedAt = new Date();
    this.promises.set(state.id, { ...state });
  }

  async loadPromise(id: string): Promise<DistributedPromiseState | null> {
    return this.promises.get(id) || null;
  }

  async listPromises(filter: {
    status?: string[];
    machineId?: string;
    taskId?: string;
  }): Promise<DistributedPromiseState[]> {
    return Array.from(this.promises.values()).filter(promise => {
      if (filter.status && !filter.status.includes(promise.status)) return false;
      if (filter.machineId && promise.machineId !== filter.machineId) return false;
      if (filter.taskId && promise.metadata.taskId !== filter.taskId) return false;
      return true;
    });
  }

  async deletePromise(id: string): Promise<void> {
    this.promises.delete(id);
    this.events.delete(id);
  }

  async logEvent(event: DistributedPromiseEvent): Promise<void> {
    const events = this.events.get(event.promiseId) || [];
    events.push(event);
    this.events.set(event.promiseId, events);
  }

  async getEvents(promiseId: string): Promise<DistributedPromiseEvent[]> {
    return this.events.get(promiseId) || [];
  }

  async acquireLease(promiseId: string, machineId: string, ttl: number): Promise<boolean> {
    const existing = this.leases.get(promiseId);
    const now = new Date();
    
    if (existing && existing.expiresAt > now && existing.machineId !== machineId) {
      return false;
    }
    
    this.leases.set(promiseId, {
      machineId,
      expiresAt: new Date(Date.now() + ttl),
    });
    return true;
  }

  async renewLease(promiseId: string, machineId: string, ttl: number): Promise<boolean> {
    const existing = this.leases.get(promiseId);
    if (!existing || existing.machineId !== machineId) return false;
    
    existing.expiresAt = new Date(Date.now() + ttl);
    return true;
  }

  async releaseLease(promiseId: string, machineId: string): Promise<void> {
    const existing = this.leases.get(promiseId);
    if (existing && existing.machineId === machineId) {
      this.leases.delete(promiseId);
    }
  }
}

// Distributed Promise implementation
export class DistributedPromise<T> extends Promise<T> {
  public readonly id: string;
  public readonly machineId: string;
  private manager: DistributedPromiseManager;
  private state: DistributedPromiseState;

  constructor(
    executor: (resolve: (value: T) => void, reject: (reason?: any) => void) => void,
    manager: DistributedPromiseManager,
    options: {
      id?: string;
      taskId?: string;
      metadata?: Record<string, any>;
    } = {}
  ) {
    let resolveOuter: (value: T) => void;
    let rejectOuter: (reason?: any) => void;

    super((resolve, reject) => {
      resolveOuter = resolve;
      rejectOuter = reject;
    });

    this.id = options.id || crypto.randomUUID();
    this.machineId = manager.machineId;
    this.manager = manager;

    this.state = {
      id: this.id,
      machineId: this.machineId,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
      dependencies: [],
      dependents: [],
      metadata: options.metadata || {},
    };

    // Register with manager
    this.manager.registerPromise(this);

    // Execute with distributed coordination
    this.executeDistributed(executor, resolveOuter!, rejectOuter!);
  }

  private async executeDistributed(
    executor: (resolve: (value: T) => void, reject: (reason?: any) => void) => void,
    resolve: (value: T) => void,
    reject: (reason?: any) => void
  ): Promise<void> {
    try {
      this.state.status = 'running';
      await this.manager.persistence.savePromise(this.state);
      
      await this.manager.persistence.logEvent({
        type: 'created',
        promiseId: this.id,
        machineId: this.machineId,
        timestamp: new Date(),
      });

      executor(
        async (value: T) => {
          this.state.status = 'fulfilled';
          this.state.result = value;
          await this.manager.persistence.savePromise(this.state);
          
          await this.manager.persistence.logEvent({
            type: 'fulfilled',
            promiseId: this.id,
            machineId: this.machineId,
            timestamp: new Date(),
            data: value,
          });

          resolve(value);
        },
        async (reason: any) => {
          this.state.status = 'rejected';
          this.state.error = reason;
          await this.manager.persistence.savePromise(this.state);
          
          await this.manager.persistence.logEvent({
            type: 'rejected',
            promiseId: this.id,
            machineId: this.machineId,
            timestamp: new Date(),
            data: reason,
          });

          reject(reason);
        }
      );
    } catch (error) {
      this.state.status = 'rejected';
      this.state.error = error as Error;
      await this.manager.persistence.savePromise(this.state);
      reject(error);
    }
  }

  // Suspend this promise for migration
  async suspend(): Promise<SerializedContinuation> {
    this.state.status = 'suspended';
    this.state.suspendedAt = new Date();
    
    const continuation: SerializedContinuation = {
      promiseId: this.id,
      taskId: this.state.metadata.taskId || '',
      stackTrace: [], // Stack trace capture not implemented
      localState: this.state.metadata,
      position: 0,
      awaitedPromises: this.state.dependencies,
    };
    
    this.state.continuationData = continuation;
    await this.manager.persistence.savePromise(this.state);
    
    await this.manager.persistence.logEvent({
      type: 'suspended',
      promiseId: this.id,
      machineId: this.machineId,
      timestamp: new Date(),
    });

    return continuation;
  }

  // Get current state
  getState(): DistributedPromiseState {
    return { ...this.state };
  }
}

// Main Promise Dependency Manager
export class DistributedPromiseManager {
  public readonly machineId: string;
  private promises = new Map<string, DistributedPromise<any>>();
  private resumeCallbacks = new Map<string, (event: any) => void>();

  constructor(
    public readonly persistence: PromisePersistenceAdapter,
    machineId?: string
  ) {
    this.machineId = machineId || crypto.randomUUID();
  }

  // Create a new distributed promise
  createPromise<T>(
    executor: (resolve: (value: T) => void, reject: (reason?: any) => void) => void,
    options: {
      id?: string;
      taskId?: string;
      metadata?: Record<string, any>;
    } = {}
  ): DistributedPromise<T> {
    return new DistributedPromise(executor, this, options);
  }

  // Register a promise with the manager
  registerPromise(promise: DistributedPromise<any>): void {
    this.promises.set(promise.id, promise);
  }

  // Resume a suspended promise from continuation
  async resumePromise<T>(
    promiseId: string,
    event?: any
  ): Promise<DistributedPromise<T> | null> {
    const state = await this.persistence.loadPromise(promiseId);
    if (!state || state.status !== 'suspended') {
      return null;
    }

    // Acquire lease for exactly-once execution
    const leaseAcquired = await this.persistence.acquireLease(
      promiseId,
      this.machineId,
      60000 // 1 minute lease
    );

    if (!leaseAcquired) {
      throw new Error(`Cannot acquire lease for promise ${promiseId}`);
    }

    try {
      // Create new promise from continuation
      const resumedPromise = new DistributedPromise<T>(
        (resolve, reject) => {
          // Set up resume callback
          const callback = this.resumeCallbacks.get(promiseId);
          if (callback) {
            callback(event);
          } else {
            // Default resume behavior
            if (state.status === 'fulfilled') {
              resolve(state.result);
            } else if (state.status === 'rejected') {
              reject(state.error);
            }
          }
        },
        this,
        { id: promiseId, metadata: state.metadata }
      );

      await this.persistence.logEvent({
        type: 'resumed',
        promiseId,
        machineId: this.machineId,
        timestamp: new Date(),
        data: event,
      });

      return resumedPromise;
    } finally {
      await this.persistence.releaseLease(promiseId, this.machineId);
    }
  }

  // Set resume callback for event-based resumption
  onResume(promiseId: string, callback: (event: any) => void): void {
    this.resumeCallbacks.set(promiseId, callback);
  }

  // List promises by criteria
  async listPromises(filter: {
    status?: string[];
    taskId?: string;
  } = {}): Promise<DistributedPromiseState[]> {
    return this.persistence.listPromises(filter);
  }

  // Get promise state
  async getPromiseState(promiseId: string): Promise<DistributedPromiseState | null> {
    return this.persistence.loadPromise(promiseId);
  }

  // Clean up completed promises
  async cleanup(olderThan: Date): Promise<void> {
    const completed = await this.persistence.listPromises({
      status: ['fulfilled', 'rejected'],
    });

    for (const promise of completed) {
      if (promise.updatedAt < olderThan) {
        await this.persistence.deletePromise(promise.id);
      }
    }
  }
}

// Context for distributed promise execution
export const DistributedPromiseContext = createContext<DistributedPromiseManager>("distributed.promise.manager");

// Events for promise lifecycle
export const promiseCreated = event<{ promiseId: string; taskId?: string }>({
  id: "distributed.promise.created"
});

export const promiseResumed = event<{ promiseId: string; event?: any }>({
  id: "distributed.promise.resumed"
});

export const promiseSuspended = event<{ promiseId: string; continuation: SerializedContinuation }>({
  id: "distributed.promise.suspended"
});

export const promiseFulfilled = event<{ promiseId: string; result: any }>({
  id: "distributed.promise.fulfilled"
});

export const promiseRejected = event<{ promiseId: string; error: Error }>({
  id: "distributed.promise.rejected"
});

// Resource for distributed promise manager
export const distributedPromiseManager = resource({
  id: "distributed.promise.manager",
  init: async () => {
    const persistence = new InMemoryPromisePersistence();
    return new DistributedPromiseManager(persistence);
  },
});

// Helper function to create distributed async function
export function distributedAsync<TArgs extends any[], TResult>(
  id: string,
  fn: (...args: TArgs) => Promise<TResult>
): (...args: TArgs) => DistributedPromise<TResult> {
  return (...args: TArgs) => {
    const manager = DistributedPromiseContext.use();
    
    return manager.createPromise<TResult>(
      async (resolve, reject) => {
        try {
          const result = await fn(...args);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      },
      { taskId: id, metadata: { args } }
    );
  };
}