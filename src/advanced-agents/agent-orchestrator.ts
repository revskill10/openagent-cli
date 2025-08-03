// agent-orchestrator.ts - Main orchestrator for advanced agent system
import { taskPlanner, TaskPlan, PlanningContext } from './task-planner.js';
import { agentManager, Agent } from './agent-manager.js';
import { backgroundProcessor } from './background-processor.js';
import { systemEventEmitter } from '../system-events.js';

export interface OrchestrationRequest {
  userQuery: string;
  context?: Record<string, any>;
  preferences?: {
    prioritizeSpeed?: boolean;
    prioritizeQuality?: boolean;
    allowParallelExecution?: boolean;
    maxDuration?: number;
    maxConcurrency?: number;
  };
  constraints?: {
    requiredSkills?: string[];
    excludedAgents?: string[];
    deadline?: Date;
  };
}

export interface OrchestrationResult {
  planId: string;
  plan: TaskPlan;
  assignedAgents: Agent[];
  estimatedCompletion: Date;
  jobIds: string[];
  status: 'planning' | 'executing' | 'completed' | 'failed';
}

export interface OrchestrationStatus {
  planId: string;
  progress: {
    completed: number;
    total: number;
    percentage: number;
  };
  activeAgents: Agent[];
  completedTasks: any[];
  failedTasks: any[];
  estimatedTimeRemaining: number;
  currentPhase: string;
}

export class AgentOrchestrator {
  private activeOrchestrations = new Map<string, OrchestrationResult>();
  private orchestrationHistory = new Map<string, OrchestrationResult>();

  async orchestrate(request: OrchestrationRequest): Promise<OrchestrationResult> {
    try {
      systemEventEmitter.emitTaskStart('orchestrator', 'orchestrator', `Starting orchestration: ${request.userQuery}`);

      // Create planning context
      const planningContext: PlanningContext = {
        userQuery: request.userQuery,
        availableAgents: agentManager.getAllAgents().map(a => a.id),
        availableTools: this.getAvailableTools(),
        constraints: {
          maxDuration: request.preferences?.maxDuration,
          maxConcurrency: request.preferences?.maxConcurrency,
          requiredSkills: request.constraints?.requiredSkills
        },
        preferences: {
          prioritizeSpeed: request.preferences?.prioritizeSpeed || false,
          prioritizeQuality: request.preferences?.prioritizeQuality || true,
          allowParallelExecution: request.preferences?.allowParallelExecution || true
        }
      };

      // Create execution plan
      const plan = await taskPlanner.createPlan(planningContext);
      
      // Assign agents to tasks
      const assignedAgents = await this.assignAgentsToTasks(plan);
      
      // Calculate estimated completion
      const estimatedCompletion = this.calculateEstimatedCompletion(plan);
      
      // Submit tasks to background processor
      const jobIds = await this.submitTasksForExecution(plan);

      const result: OrchestrationResult = {
        planId: plan.id,
        plan,
        assignedAgents,
        estimatedCompletion,
        jobIds,
        status: 'executing'
      };

      this.activeOrchestrations.set(plan.id, result);
      
      systemEventEmitter.emitTaskComplete('orchestrator', {
        planId: plan.id,
        tasksCreated: plan.allTasks.size,
        agentsAssigned: assignedAgents.length
      });

      return result;

    } catch (error) {
      systemEventEmitter.emitTaskError('orchestrator', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  private async assignAgentsToTasks(plan: TaskPlan): Promise<Agent[]> {
    const assignedAgents: Agent[] = [];
    const readyTasks = taskPlanner.getReadyTasks(plan.id);

    for (const task of readyTasks) {
      try {
        const agent = await agentManager.assignTask(task.id, task);
        if (agent) {
          assignedAgents.push(agent);
          taskPlanner.assignTaskToAgent(plan.id, task.id, agent.id);
        }
      } catch (error) {
        console.warn(`Failed to assign agent to task ${task.id}:`, error);
      }
    }

    return assignedAgents;
  }

  private calculateEstimatedCompletion(plan: TaskPlan): Date {
    const now = new Date();
    const estimatedMinutes = plan.estimatedTotalDuration;
    return new Date(now.getTime() + estimatedMinutes * 60 * 1000);
  }

  private async submitTasksForExecution(plan: TaskPlan): Promise<string[]> {
    const jobIds: string[] = [];
    const readyTasks = taskPlanner.getReadyTasks(plan.id);

    for (const task of readyTasks) {
      try {
        const priority = this.calculateTaskPriority(task);
        const jobId = await backgroundProcessor.submitJob(plan.id, task.id, priority);
        jobIds.push(jobId);
      } catch (error) {
        console.warn(`Failed to submit task ${task.id} for execution:`, error);
      }
    }

    return jobIds;
  }

  private calculateTaskPriority(task: any): number {
    const priorityMap = { 'critical': 10, 'high': 7, 'medium': 5, 'low': 2 };
    return priorityMap[task.priority as keyof typeof priorityMap] || 5;
  }

  private getAvailableTools(): string[] {
    // This would typically query the tool registry
    return [
      'intelligent_read_file',
      'get_file_outline',
      'str-replace-editor',
      'save-file',
      'view',
      'web-search',
      'web-fetch',
      'launch-process',
      'github-api'
    ];
  }

  async getOrchestrationStatus(planId: string): Promise<OrchestrationStatus | null> {
    const orchestration = this.activeOrchestrations.get(planId);
    if (!orchestration) {
      return null;
    }

    const progress = taskPlanner.getPlanProgress(planId);
    const activeAgents = agentManager.getAllAgents().filter(agent => 
      agent.status === 'busy' && 
      orchestration.assignedAgents.some(a => a.id === agent.id)
    );

    const allTasks = Array.from(orchestration.plan.allTasks.values());
    const completedTasks = allTasks.filter(task => task.status === 'completed');
    const failedTasks = allTasks.filter(task => task.status === 'failed');

    const estimatedTimeRemaining = this.calculateRemainingTime(orchestration.plan);
    const currentPhase = this.determineCurrentPhase(orchestration.plan);

    return {
      planId,
      progress,
      activeAgents,
      completedTasks: completedTasks.map(task => ({
        id: task.id,
        name: task.name,
        result: task.result,
        duration: task.actualDuration
      })),
      failedTasks: failedTasks.map(task => ({
        id: task.id,
        name: task.name,
        error: task.error
      })),
      estimatedTimeRemaining,
      currentPhase
    };
  }

  private calculateRemainingTime(plan: TaskPlan): number {
    const allTasks = Array.from(plan.allTasks.values());
    const remainingTasks = allTasks.filter(task => 
      task.status !== 'completed' && task.status !== 'failed'
    );

    return remainingTasks.reduce((total, task) => total + task.estimatedDuration, 0);
  }

  private determineCurrentPhase(plan: TaskPlan): string {
    const allTasks = Array.from(plan.allTasks.values());
    const tasksByType = allTasks.reduce((acc, task) => {
      acc[task.type] = (acc[task.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const activeTasks = allTasks.filter(task => task.status === 'in_progress');
    if (activeTasks.length === 0) {
      return 'Planning';
    }

    const activeTypes = activeTasks.map(task => task.type);
    const dominantType = activeTypes.reduce((a, b) => 
      activeTypes.filter(v => v === a).length >= activeTypes.filter(v => v === b).length ? a : b
    );

    const phaseMap: Record<string, string> = {
      'analysis': 'Analysis Phase',
      'research': 'Research Phase',
      'coding': 'Implementation Phase',
      'testing': 'Testing Phase',
      'deployment': 'Deployment Phase',
      'file_operation': 'File Processing Phase'
    };

    return phaseMap[dominantType] || 'Execution Phase';
  }

  async pauseOrchestration(planId: string): Promise<boolean> {
    const orchestration = this.activeOrchestrations.get(planId);
    if (!orchestration) return false;

    // Pause background processing for this plan's jobs
    for (const jobId of orchestration.jobIds) {
      backgroundProcessor.cancelJob(jobId);
    }

    orchestration.status = 'planning'; // Temporarily set to planning
    return true;
  }

  async resumeOrchestration(planId: string): Promise<boolean> {
    const orchestration = this.activeOrchestrations.get(planId);
    if (!orchestration) return false;

    // Resubmit ready tasks
    const readyTasks = taskPlanner.getReadyTasks(planId);
    const newJobIds: string[] = [];

    for (const task of readyTasks) {
      try {
        const priority = this.calculateTaskPriority(task);
        const jobId = await backgroundProcessor.submitJob(planId, task.id, priority);
        newJobIds.push(jobId);
      } catch (error) {
        console.warn(`Failed to resubmit task ${task.id}:`, error);
      }
    }

    orchestration.jobIds.push(...newJobIds);
    orchestration.status = 'executing';
    return true;
  }

  async cancelOrchestration(planId: string): Promise<boolean> {
    const orchestration = this.activeOrchestrations.get(planId);
    if (!orchestration) return false;

    // Cancel all jobs
    for (const jobId of orchestration.jobIds) {
      backgroundProcessor.cancelJob(jobId);
    }

    // Update all tasks to cancelled
    for (const task of orchestration.plan.allTasks.values()) {
      if (task.status !== 'completed' && task.status !== 'failed') {
        taskPlanner.updateTaskStatus(planId, task.id, 'cancelled');
      }
    }

    orchestration.status = 'failed';
    this.activeOrchestrations.delete(planId);
    this.orchestrationHistory.set(planId, orchestration);

    return true;
  }

  getActiveOrchestrations(): OrchestrationResult[] {
    return Array.from(this.activeOrchestrations.values());
  }

  getOrchestrationHistory(): OrchestrationResult[] {
    return Array.from(this.orchestrationHistory.values());
  }

  async getSystemStatus() {
    const agentStats = agentManager.getResourceUsage();
    const processorStats = backgroundProcessor.getStats();
    const queueStatus = backgroundProcessor.getQueueStatus();

    return {
      agents: agentStats,
      processor: processorStats,
      queue: {
        queued: queueStatus.queued.length,
        active: queueStatus.active.length,
        recentCompleted: queueStatus.recentCompleted.length
      },
      orchestrations: {
        active: this.activeOrchestrations.size,
        total: this.activeOrchestrations.size + this.orchestrationHistory.size
      }
    };
  }

  // Cleanup completed orchestrations
  async cleanup(): Promise<void> {
    const now = new Date();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const [planId, orchestration] of this.activeOrchestrations.entries()) {
      const progress = taskPlanner.getPlanProgress(planId);
      
      // Move completed orchestrations to history
      if (progress.percentage === 100) {
        orchestration.status = 'completed';
        this.activeOrchestrations.delete(planId);
        this.orchestrationHistory.set(planId, orchestration);
      }
    }

    // Clean old history entries
    for (const [planId, orchestration] of this.orchestrationHistory.entries()) {
      const age = now.getTime() - orchestration.plan.createdAt.getTime();
      if (age > maxAge) {
        this.orchestrationHistory.delete(planId);
      }
    }
  }
}

export const agentOrchestrator = new AgentOrchestrator();
