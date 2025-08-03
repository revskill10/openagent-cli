// background-processor.ts - Background agent processing and queue management
import { v4 as uuidv4 } from 'uuid';
import { Task, TaskStatus, taskPlanner } from './task-planner.js';
import { Agent, agentManager } from './agent-manager.js';
import { systemEventEmitter } from '../system-events.js';
import { unifiedToolExecutor } from '../tools/unified-tool-executor.js';

export interface BackgroundJob {
  id: string;
  planId: string;
  taskId: string;
  agentId: string;
  status: JobStatus;
  priority: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  result?: any;
  error?: string;
  retryCount: number;
  maxRetries: number;
}

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'retrying';

export interface ProcessorStats {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  activeJobs: number;
  queuedJobs: number;
  averageExecutionTime: number;
  successRate: number;
}

export class BackgroundProcessor {
  private jobQueue: BackgroundJob[] = [];
  private activeJobs = new Map<string, BackgroundJob>();
  private completedJobs = new Map<string, BackgroundJob>();
  private isProcessing = false;
  private maxConcurrentJobs: number;
  private processingInterval?: NodeJS.Timeout;
  private stats: ProcessorStats = {
    totalJobs: 0,
    completedJobs: 0,
    failedJobs: 0,
    activeJobs: 0,
    queuedJobs: 0,
    averageExecutionTime: 0,
    successRate: 0
  };

  constructor(maxConcurrentJobs = 10) {
    this.maxConcurrentJobs = maxConcurrentJobs;
    this.startProcessing();
  }

  async submitJob(planId: string, taskId: string, priority = 5): Promise<string> {
    const task = taskPlanner.getTask(planId, taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found in plan ${planId}`);
    }

    // Try to assign an agent
    const agent = await agentManager.assignTask(taskId, task);
    if (!agent) {
      throw new Error(`No suitable agent available for task ${taskId}`);
    }

    const jobId = uuidv4();
    const job: BackgroundJob = {
      id: jobId,
      planId,
      taskId,
      agentId: agent.id,
      status: 'queued',
      priority,
      createdAt: new Date(),
      retryCount: 0,
      maxRetries: 3
    };

    // Insert job in priority order
    this.insertJobByPriority(job);
    this.updateStats();

    systemEventEmitter.emitTaskStart(jobId, 'background-processor', `Queued task ${task.name}`);
    
    return jobId;
  }

  private insertJobByPriority(job: BackgroundJob): void {
    let inserted = false;
    for (let i = 0; i < this.jobQueue.length; i++) {
      if (job.priority > this.jobQueue[i].priority) {
        this.jobQueue.splice(i, 0, job);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      this.jobQueue.push(job);
    }
  }

  private startProcessing(): void {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    this.processingInterval = setInterval(() => {
      this.processQueue();
    }, 1000); // Check every second
  }

  private async processQueue(): Promise<void> {
    // Remove completed jobs from active list
    for (const [jobId, job] of this.activeJobs.entries()) {
      if (job.status === 'completed' || job.status === 'failed') {
        this.activeJobs.delete(jobId);
        this.completedJobs.set(jobId, job);
      }
    }

    // Start new jobs if we have capacity
    while (this.activeJobs.size < this.maxConcurrentJobs && this.jobQueue.length > 0) {
      const job = this.jobQueue.shift()!;
      await this.startJob(job);
    }

    this.updateStats();
  }

  private async startJob(job: BackgroundJob): Promise<void> {
    job.status = 'running';
    job.startedAt = new Date();
    this.activeJobs.set(job.id, job);

    const task = taskPlanner.getTask(job.planId, job.taskId);
    const agent = agentManager.getAgent(job.agentId);

    if (!task || !agent) {
      await this.failJob(job, 'Task or agent not found');
      return;
    }

    systemEventEmitter.emitTaskStart(job.id, agent.name, `Executing task: ${task.name}`);

    try {
      // Update task status
      taskPlanner.updateTaskStatus(job.planId, job.taskId, 'in_progress');

      // Execute the task
      const result = await this.executeTask(task, agent);

      // Complete the job
      await this.completeJob(job, result);

    } catch (error) {
      await this.handleJobError(job, error);
    }
  }

  private async executeTask(task: Task, agent: Agent): Promise<any> {
    // Simulate task execution based on task type
    switch (task.type) {
      case 'analysis':
        return await this.executeAnalysisTask(task, agent);
      case 'coding':
        return await this.executeCodingTask(task, agent);
      case 'research':
        return await this.executeResearchTask(task, agent);
      case 'file_operation':
        return await this.executeFileOperationTask(task, agent);
      case 'testing':
        return await this.executeTestingTask(task, agent);
      default:
        return await this.executeGenericTask(task, agent);
    }
  }

  private async executeAnalysisTask(task: Task, agent: Agent): Promise<any> {
    // Simulate analysis work
    await this.simulateWork(task.estimatedDuration * 1000);
    
    return {
      type: 'analysis_result',
      summary: `Analysis completed by ${agent.name}`,
      findings: ['Key finding 1', 'Key finding 2', 'Key finding 3'],
      confidence: 0.85,
      recommendations: ['Recommendation 1', 'Recommendation 2']
    };
  }

  private async executeCodingTask(task: Task, agent: Agent): Promise<any> {
    // Simulate coding work
    await this.simulateWork(task.estimatedDuration * 1000);
    
    return {
      type: 'code_result',
      filesModified: ['file1.ts', 'file2.ts'],
      linesAdded: 150,
      linesModified: 75,
      testsAdded: 5,
      quality: 'high'
    };
  }

  private async executeResearchTask(task: Task, agent: Agent): Promise<any> {
    // Simulate research work
    await this.simulateWork(task.estimatedDuration * 1000);
    
    return {
      type: 'research_result',
      sourcesFound: 12,
      relevantSources: 8,
      keyInsights: ['Insight 1', 'Insight 2', 'Insight 3'],
      confidence: 0.78
    };
  }

  private async executeFileOperationTask(task: Task, agent: Agent): Promise<any> {
    // Simulate file operations
    await this.simulateWork(task.estimatedDuration * 1000);
    
    return {
      type: 'file_operation_result',
      filesProcessed: 5,
      totalSize: '2.5MB',
      operations: ['read', 'analyze', 'summarize']
    };
  }

  private async executeTestingTask(task: Task, agent: Agent): Promise<any> {
    // Simulate testing work
    await this.simulateWork(task.estimatedDuration * 1000);
    
    return {
      type: 'testing_result',
      testsRun: 25,
      testsPassed: 23,
      testsFailed: 2,
      coverage: '92%',
      issues: ['Minor issue 1', 'Minor issue 2']
    };
  }

  private async executeGenericTask(task: Task, agent: Agent): Promise<any> {
    // Simulate generic work
    await this.simulateWork(task.estimatedDuration * 1000);
    
    return {
      type: 'generic_result',
      status: 'completed',
      message: `Task ${task.name} completed by ${agent.name}`
    };
  }

  private async simulateWork(duration: number): Promise<void> {
    // Add some randomness to simulate real work
    const actualDuration = duration * (0.8 + Math.random() * 0.4);
    return new Promise(resolve => setTimeout(resolve, actualDuration));
  }

  private async completeJob(job: BackgroundJob, result: any): Promise<void> {
    job.status = 'completed';
    job.completedAt = new Date();
    job.result = result;

    const task = taskPlanner.getTask(job.planId, job.taskId);
    const agent = agentManager.getAgent(job.agentId);

    if (task && agent) {
      // Update task status
      taskPlanner.updateTaskStatus(job.planId, job.taskId, 'completed', result);

      // Update agent performance
      const duration = job.completedAt.getTime() - (job.startedAt?.getTime() || job.createdAt.getTime());
      agentManager.updateAgentPerformance(agent.id, true, Math.round(duration / 60000), 0.8);

      systemEventEmitter.emitTaskComplete(job.id, {
        agentId: agent.id,
        taskName: task.name,
        duration: Math.round(duration / 1000),
        result
      });
    }
  }

  private async failJob(job: BackgroundJob, error: string | Error): Promise<void> {
    job.error = error instanceof Error ? error.message : error;

    if (job.retryCount < job.maxRetries) {
      // Retry the job
      job.retryCount++;
      job.status = 'retrying';
      
      // Add back to queue with lower priority
      job.priority = Math.max(1, job.priority - 1);
      this.insertJobByPriority(job);
      
      systemEventEmitter.emitTaskError(job.id, `Retrying job (attempt ${job.retryCount}): ${job.error}`);
    } else {
      // Fail permanently
      job.status = 'failed';
      job.completedAt = new Date();

      const task = taskPlanner.getTask(job.planId, job.taskId);
      const agent = agentManager.getAgent(job.agentId);

      if (task && agent) {
        taskPlanner.updateTaskStatus(job.planId, job.taskId, 'failed', undefined, job.error);
        
        const duration = job.completedAt.getTime() - (job.startedAt?.getTime() || job.createdAt.getTime());
        agentManager.updateAgentPerformance(agent.id, false, Math.round(duration / 60000), 0.2);
      }

      systemEventEmitter.emitTaskError(job.id, `Job failed permanently: ${job.error}`);
    }
  }

  private async handleJobError(job: BackgroundJob, error: any): Promise<void> {
    await this.failJob(job, error);
  }

  private updateStats(): void {
    const allJobs = [
      ...Array.from(this.activeJobs.values()),
      ...Array.from(this.completedJobs.values()),
      ...this.jobQueue
    ];

    this.stats.totalJobs = allJobs.length;
    this.stats.activeJobs = this.activeJobs.size;
    this.stats.queuedJobs = this.jobQueue.length;
    
    const completed = Array.from(this.completedJobs.values()).filter(job => job.status === 'completed');
    const failed = Array.from(this.completedJobs.values()).filter(job => job.status === 'failed');
    
    this.stats.completedJobs = completed.length;
    this.stats.failedJobs = failed.length;
    this.stats.successRate = this.stats.totalJobs > 0 ? 
      (this.stats.completedJobs / (this.stats.completedJobs + this.stats.failedJobs)) : 0;

    // Calculate average execution time
    if (completed.length > 0) {
      const totalTime = completed.reduce((sum, job) => {
        const duration = (job.completedAt?.getTime() || 0) - (job.startedAt?.getTime() || job.createdAt.getTime());
        return sum + duration;
      }, 0);
      this.stats.averageExecutionTime = totalTime / completed.length / 1000; // seconds
    }
  }

  // Public API methods
  getJob(jobId: string): BackgroundJob | undefined {
    return this.activeJobs.get(jobId) || this.completedJobs.get(jobId) || 
           this.jobQueue.find(job => job.id === jobId);
  }

  cancelJob(jobId: string): boolean {
    // Remove from queue
    const queueIndex = this.jobQueue.findIndex(job => job.id === jobId);
    if (queueIndex !== -1) {
      const job = this.jobQueue.splice(queueIndex, 1)[0];
      job.status = 'cancelled';
      this.completedJobs.set(jobId, job);
      return true;
    }

    // Cancel active job (mark for cancellation)
    const activeJob = this.activeJobs.get(jobId);
    if (activeJob) {
      activeJob.status = 'cancelled';
      return true;
    }

    return false;
  }

  getStats(): ProcessorStats {
    return { ...this.stats };
  }

  getQueueStatus(): {
    queued: BackgroundJob[];
    active: BackgroundJob[];
    recentCompleted: BackgroundJob[];
  } {
    const recentCompleted = Array.from(this.completedJobs.values())
      .sort((a, b) => (b.completedAt?.getTime() || 0) - (a.completedAt?.getTime() || 0))
      .slice(0, 10);

    return {
      queued: [...this.jobQueue],
      active: Array.from(this.activeJobs.values()),
      recentCompleted
    };
  }

  pause(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = undefined;
    }
    this.isProcessing = false;
  }

  resume(): void {
    if (!this.isProcessing) {
      this.startProcessing();
    }
  }

  shutdown(): void {
    this.pause();
    
    // Cancel all queued jobs
    for (const job of this.jobQueue) {
      job.status = 'cancelled';
      this.completedJobs.set(job.id, job);
    }
    this.jobQueue = [];

    // Mark active jobs as cancelled
    for (const job of this.activeJobs.values()) {
      job.status = 'cancelled';
    }
  }
}

export const backgroundProcessor = new BackgroundProcessor();
