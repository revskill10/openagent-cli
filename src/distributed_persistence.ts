import { resource } from "@bluelibs/runner";
import { 
  PromisePersistenceAdapter, 
  DistributedPromiseState, 
  DistributedPromiseEvent,
  SerializedContinuation 
} from "./distributed_promise_manager.js";

// Enhanced persistence with recovery capabilities
export interface DistributedPersistenceAdapter extends PromisePersistenceAdapter {
  // Machine health tracking
  registerMachine(machineId: string, metadata: MachineMetadata): Promise<void>;
  updateMachineHeartbeat(machineId: string): Promise<void>;
  getMachineStatus(machineId: string): Promise<MachineStatus | null>;
  listMachines(): Promise<MachineStatus[]>;
  
  // Recovery operations
  findOrphanedPromises(deadMachineThreshold: number): Promise<DistributedPromiseState[]>;
  reassignPromise(promiseId: string, newMachineId: string): Promise<void>;
  createRecoveryCheckpoint(promiseId: string, checkpoint: RecoveryCheckpoint): Promise<void>;
  getRecoveryCheckpoints(promiseId: string): Promise<RecoveryCheckpoint[]>;
  
  // Distributed coordination
  acquireGlobalLock(lockId: string, machineId: string, ttl: number): Promise<boolean>;
  releaseGlobalLock(lockId: string, machineId: string): Promise<void>;
  
  // Batch operations for efficiency
  batchSavePromises(states: DistributedPromiseState[]): Promise<void>;
  batchLogEvents(events: DistributedPromiseEvent[]): Promise<void>;
}

export interface MachineMetadata {
  hostname: string;
  platform: string;
  nodeVersion: string;
  startedAt: Date;
  capabilities: string[];
  tags: Record<string, string>;
}

export interface MachineStatus {
  machineId: string;
  metadata: MachineMetadata;
  lastHeartbeat: Date;
  status: 'active' | 'inactive' | 'dead';
  activePromises: number;
  totalProcessed: number;
}

export interface RecoveryCheckpoint {
  promiseId: string;
  machineId: string;
  timestamp: Date;
  stepNumber: number;
  localState: Record<string, any>;
  stackSnapshot: any[];
  dependencies: string[];
  metadata: Record<string, any>;
}

// FilePersistenceAdapter that implements both interfaces
export class FilePersistenceAdapter implements DistributedPersistenceAdapter, PromisePersistenceAdapter {
  private baseDir: string;
  private machines = new Map<string, MachineStatus>();
  private locks = new Map<string, { machineId: string; expiresAt: Date }>();

  constructor(baseDir: string = './distributed-data') {
    this.baseDir = baseDir;
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    const fs = require('fs');
    const path = require('path');
    
    const dirs = [
      this.baseDir,
      path.join(this.baseDir, 'promises'),
      path.join(this.baseDir, 'events'),
      path.join(this.baseDir, 'machines'),
      path.join(this.baseDir, 'checkpoints'),
      path.join(this.baseDir, 'leases'),
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  // Promise persistence
  async savePromise(state: DistributedPromiseState): Promise<void> {
    const fs = require('fs').promises;
    const path = require('path');
    
    const filePath = path.join(this.baseDir, 'promises', `${state.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(state, null, 2));
  }

  async loadPromise(id: string): Promise<DistributedPromiseState | null> {
    const fs = require('fs').promises;
    const path = require('path');
    
    try {
      const filePath = path.join(this.baseDir, 'promises', `${id}.json`);
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }

  // Compatibility methods for base PersistenceAdapter interface
  async list(filter: { pipelineId?: string; status?: string }): Promise<any[]> {
    return this.listPromises({
      status: filter.status ? [filter.status] : undefined
    });
  }

  async save(state: any): Promise<void> {
    return this.savePromise(state);
  }

  async load(executionId: string): Promise<any> {
    return this.loadPromise(executionId);
  }

  async delete(executionId: string): Promise<void> {
    return this.deletePromise(executionId);
  }

  async listPromises(filter: {
    status?: string[];
    machineId?: string;
    taskId?: string;
  }): Promise<DistributedPromiseState[]> {
    const fs = require('fs').promises;
    const path = require('path');
    
    try {
      const promisesDir = path.join(this.baseDir, 'promises');
      const files = await fs.readdir(promisesDir);
      const promises: DistributedPromiseState[] = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const data = await fs.readFile(path.join(promisesDir, file), 'utf8');
            const promise = JSON.parse(data);
            
            // Apply filters
            if (filter.status && !filter.status.includes(promise.status)) continue;
            if (filter.machineId && promise.machineId !== filter.machineId) continue;
            if (filter.taskId && promise.metadata.taskId !== filter.taskId) continue;
            
            promises.push(promise);
          } catch (error) {
            // Skip corrupted files
            continue;
          }
        }
      }

      return promises;
    } catch (error) {
      return [];
    }
  }

  async deletePromise(id: string): Promise<void> {
    const fs = require('fs').promises;
    const path = require('path');
    
    try {
      const filePath = path.join(this.baseDir, 'promises', `${id}.json`);
      await fs.unlink(filePath);
    } catch (error) {
      // File doesn't exist, ignore
    }
  }

  // Event logging
  async logEvent(event: DistributedPromiseEvent): Promise<void> {
    const fs = require('fs').promises;
    const path = require('path');
    
    const eventFile = path.join(this.baseDir, 'events', `${event.promiseId}.log`);
    const eventLine = JSON.stringify(event) + '\n';
    
    await fs.appendFile(eventFile, eventLine);
  }

  async getEvents(promiseId: string): Promise<DistributedPromiseEvent[]> {
    const fs = require('fs').promises;
    const path = require('path');
    
    try {
      const eventFile = path.join(this.baseDir, 'events', `${promiseId}.log`);
      const data = await fs.readFile(eventFile, 'utf8');
      
      return data.trim().split('\n')
        .filter((line: string) => line.trim())
        .map((line: string) => JSON.parse(line));
    } catch (error) {
      return [];
    }
  }

  // Lease management
  async acquireLease(promiseId: string, machineId: string, ttl: number): Promise<boolean> {
    const fs = require('fs').promises;
    const path = require('path');
    
    const leaseFile = path.join(this.baseDir, 'leases', `${promiseId}.json`);
    
    try {
      // Check existing lease
      const existing = await fs.readFile(leaseFile, 'utf8');
      const lease = JSON.parse(existing);
      
      if (new Date(lease.expiresAt) > new Date() && lease.machineId !== machineId) {
        return false;
      }
    } catch (error) {
      // No existing lease
    }

    // Acquire lease
    const lease = {
      promiseId,
      machineId,
      expiresAt: new Date(Date.now() + ttl),
      acquiredAt: new Date(),
    };

    await fs.writeFile(leaseFile, JSON.stringify(lease, null, 2));
    return true;
  }

  async renewLease(promiseId: string, machineId: string, ttl: number): Promise<boolean> {
    const fs = require('fs').promises;
    const path = require('path');
    
    const leaseFile = path.join(this.baseDir, 'leases', `${promiseId}.json`);
    
    try {
      const existing = await fs.readFile(leaseFile, 'utf8');
      const lease = JSON.parse(existing);
      
      if (lease.machineId !== machineId) {
        return false;
      }

      lease.expiresAt = new Date(Date.now() + ttl);
      lease.renewedAt = new Date();
      
      await fs.writeFile(leaseFile, JSON.stringify(lease, null, 2));
      return true;
    } catch (error) {
      return false;
    }
  }

  async releaseLease(promiseId: string, machineId: string): Promise<void> {
    const fs = require('fs').promises;
    const path = require('path');
    
    try {
      const leaseFile = path.join(this.baseDir, 'leases', `${promiseId}.json`);
      const existing = await fs.readFile(leaseFile, 'utf8');
      const lease = JSON.parse(existing);
      
      if (lease.machineId === machineId) {
        await fs.unlink(leaseFile);
      }
    } catch (error) {
      // Lease doesn't exist, ignore
    }
  }

  // Machine management
  async registerMachine(machineId: string, metadata: MachineMetadata): Promise<void> {
    const status: MachineStatus = {
      machineId,
      metadata,
      lastHeartbeat: new Date(),
      status: 'active',
      activePromises: 0,
      totalProcessed: 0,
    };

    this.machines.set(machineId, status);
    
    const fs = require('fs').promises;
    const path = require('path');
    const machineFile = path.join(this.baseDir, 'machines', `${machineId}.json`);
    await fs.writeFile(machineFile, JSON.stringify(status, null, 2));
  }

  async updateMachineHeartbeat(machineId: string): Promise<void> {
    const status = this.machines.get(machineId);
    if (status) {
      status.lastHeartbeat = new Date();
      status.status = 'active';
      
      const fs = require('fs').promises;
      const path = require('path');
      const machineFile = path.join(this.baseDir, 'machines', `${machineId}.json`);
      await fs.writeFile(machineFile, JSON.stringify(status, null, 2));
    }
  }

  async getMachineStatus(machineId: string): Promise<MachineStatus | null> {
    return this.machines.get(machineId) || null;
  }

  async listMachines(): Promise<MachineStatus[]> {
    return Array.from(this.machines.values());
  }

  // Recovery operations
  async findOrphanedPromises(deadMachineThreshold: number): Promise<DistributedPromiseState[]> {
    const allPromises = await this.listPromises({});
    const orphaned: DistributedPromiseState[] = [];
    const deadThreshold = new Date(Date.now() - deadMachineThreshold);

    for (const promise of allPromises) {
      if (promise.status === 'running' || promise.status === 'suspended') {
        const machine = this.machines.get(promise.machineId);
        if (!machine || machine.lastHeartbeat < deadThreshold) {
          orphaned.push(promise);
        }
      }
    }

    return orphaned;
  }

  async reassignPromise(promiseId: string, newMachineId: string): Promise<void> {
    const promise = await this.loadPromise(promiseId);
    if (promise) {
      promise.machineId = newMachineId;
      promise.updatedAt = new Date();
      await this.savePromise(promise);
      
      // Log reassignment event
      await this.logEvent({
        type: 'migrated',
        promiseId,
        machineId: newMachineId,
        timestamp: new Date(),
      });
    }
  }

  async createRecoveryCheckpoint(promiseId: string, checkpoint: RecoveryCheckpoint): Promise<void> {
    const fs = require('fs').promises;
    const path = require('path');
    
    const checkpointFile = path.join(this.baseDir, 'checkpoints', `${promiseId}.log`);
    const checkpointLine = JSON.stringify(checkpoint) + '\n';
    
    await fs.appendFile(checkpointFile, checkpointLine);
  }

  async getRecoveryCheckpoints(promiseId: string): Promise<RecoveryCheckpoint[]> {
    const fs = require('fs').promises;
    const path = require('path');
    
    try {
      const checkpointFile = path.join(this.baseDir, 'checkpoints', `${promiseId}.log`);
      const data = await fs.readFile(checkpointFile, 'utf8');
      
      return data.trim().split('\n')
        .filter((line: string) => line.trim())
        .map((line: string) => JSON.parse(line));
    } catch (error) {
      return [];
    }
  }

  // Global locks for distributed coordination
  async acquireGlobalLock(lockId: string, machineId: string, ttl: number): Promise<boolean> {
    const existing = this.locks.get(lockId);
    const now = new Date();
    
    if (existing && existing.expiresAt > now && existing.machineId !== machineId) {
      return false;
    }
    
    this.locks.set(lockId, {
      machineId,
      expiresAt: new Date(Date.now() + ttl),
    });
    
    return true;
  }

  async releaseGlobalLock(lockId: string, machineId: string): Promise<void> {
    const existing = this.locks.get(lockId);
    if (existing && existing.machineId === machineId) {
      this.locks.delete(lockId);
    }
  }

  // Batch operations
  async batchSavePromises(states: DistributedPromiseState[]): Promise<void> {
    await Promise.all(states.map(state => this.savePromise(state)));
  }

  async batchLogEvents(events: DistributedPromiseEvent[]): Promise<void> {
    await Promise.all(events.map(event => this.logEvent(event)));
  }
}

// Recovery manager
export class DistributedRecoveryManager {
  constructor(
    private persistence: DistributedPersistenceAdapter,
    private machineId: string
  ) {}

  // Start recovery monitoring
  async startRecoveryMonitoring(config: {
    heartbeatInterval: number;
    deadMachineThreshold: number;
    recoveryCheckInterval: number;
  }): Promise<void> {
    // Send regular heartbeats
    setInterval(async () => {
      await this.persistence.updateMachineHeartbeat(this.machineId);
    }, config.heartbeatInterval);

    // Check for orphaned promises
    setInterval(async () => {
      await this.recoverOrphanedPromises(config.deadMachineThreshold);
    }, config.recoveryCheckInterval);
  }

  // Recover orphaned promises from dead machines
  async recoverOrphanedPromises(deadMachineThreshold: number): Promise<void> {
    const orphaned = await this.persistence.findOrphanedPromises(deadMachineThreshold);
    
    for (const promise of orphaned) {
      try {
        // Acquire global lock for recovery
        const lockId = `recovery-${promise.id}`;
        const lockAcquired = await this.persistence.acquireGlobalLock(
          lockId, 
          this.machineId, 
          60000 // 1 minute
        );

        if (lockAcquired) {
          // Reassign to this machine
          await this.persistence.reassignPromise(promise.id, this.machineId);
          
          // Create recovery checkpoint
          await this.persistence.createRecoveryCheckpoint(promise.id, {
            promiseId: promise.id,
            machineId: this.machineId,
            timestamp: new Date(),
            stepNumber: 0,
            localState: promise.metadata,
            stackSnapshot: [],
            dependencies: promise.dependencies,
            metadata: { recoveredFrom: promise.machineId },
          });

          console.log(`Recovered orphaned promise ${promise.id} from machine ${promise.machineId}`);
          
          await this.persistence.releaseGlobalLock(lockId, this.machineId);
        }
      } catch (error) {
        console.error(`Failed to recover promise ${promise.id}:`, error);
      }
    }
  }

  // Register this machine
  async registerMachine(): Promise<void> {
    const os = require('os');
    
    const metadata: MachineMetadata = {
      hostname: os.hostname(),
      platform: os.platform(),
      nodeVersion: process.version,
      startedAt: new Date(),
      capabilities: ['distributed-promises', 'event-resumption'],
      tags: {
        environment: process.env.NODE_ENV || 'development',
        region: process.env.REGION || 'local',
      },
    };

    await this.persistence.registerMachine(this.machineId, metadata);
  }
}

// Resource for file-based persistence
export const filePersistenceAdapter = resource({
  id: "distributed.persistence.file",
  init: async () => {
    const adapter = new FilePersistenceAdapter();
    return adapter;
  },
});

// Resource for recovery manager
export const distributedRecoveryManager = resource({
  id: "distributed.recovery.manager",
  dependencies: { persistence: filePersistenceAdapter },
  init: async (_, { persistence }) => {
    const machineId = require('crypto').randomUUID();
    const recovery = new DistributedRecoveryManager(persistence, machineId);
    
    // Register machine and start monitoring
    await recovery.registerMachine();
    await recovery.startRecoveryMonitoring({
      heartbeatInterval: 30000, // 30 seconds
      deadMachineThreshold: 120000, // 2 minutes
      recoveryCheckInterval: 60000, // 1 minute
    });

    return recovery;
  },
  dispose: async (recovery) => {
    // Cleanup would go here
  },
});