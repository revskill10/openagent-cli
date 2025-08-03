// agent-manager.ts - Dynamic subagent system with specialization and collaboration
import { v4 as uuidv4 } from 'uuid';
import { Task, TaskType, TaskStatus } from './task-planner.js';
import { systemEventEmitter } from '../system-events.js';

export interface Agent {
  id: string;
  name: string;
  type: AgentType;
  specialization: string[];
  skills: string[];
  status: AgentStatus;
  currentTask?: string;
  taskHistory: string[];
  performance: AgentPerformance;
  capabilities: AgentCapabilities;
  createdAt: Date;
  lastActive: Date;
}

export interface AgentCapabilities {
  maxConcurrentTasks: number;
  preferredTaskTypes: TaskType[];
  toolAccess: string[];
  memorySize: number;
  processingPower: number; // 1-10 scale
}

export interface AgentPerformance {
  tasksCompleted: number;
  tasksSuccessful: number;
  averageTaskDuration: number;
  qualityScore: number; // 0-1 scale
  reliabilityScore: number; // 0-1 scale
  lastUpdated: Date;
}

export type AgentType = 'specialist' | 'generalist' | 'coordinator' | 'background' | 'temporary';
export type AgentStatus = 'idle' | 'busy' | 'overloaded' | 'error' | 'offline' | 'spawning';

export interface AgentCommunication {
  id: string;
  fromAgent: string;
  toAgent: string;
  type: CommunicationType;
  content: any;
  timestamp: Date;
  acknowledged: boolean;
}

export type CommunicationType = 'task_request' | 'task_result' | 'collaboration' | 'status_update' | 'resource_request';

export interface AgentSpawnRequest {
  specialization: string[];
  requiredSkills: string[];
  taskType: TaskType;
  priority: number;
  estimatedLifetime: number; // minutes
  resourceRequirements: {
    memory: number;
    processing: number;
    toolAccess: string[];
  };
}

export class AgentManager {
  private agents = new Map<string, Agent>();
  private communications = new Map<string, AgentCommunication>();
  private agentTemplates = new Map<string, Partial<Agent>>();
  private maxAgents: number;
  private resourcePool: {
    totalMemory: number;
    usedMemory: number;
    totalProcessing: number;
    usedProcessing: number;
  };

  constructor(maxAgents = 20) {
    this.maxAgents = maxAgents;
    this.resourcePool = {
      totalMemory: 1000,
      usedMemory: 0,
      totalProcessing: 100,
      usedProcessing: 0
    };
    this.initializeAgentTemplates();
    this.createCoreAgents();
  }

  async spawnAgent(request: AgentSpawnRequest): Promise<Agent | null> {
    if (this.agents.size >= this.maxAgents) {
      await this.cleanupIdleAgents();
      if (this.agents.size >= this.maxAgents) {
        return null; // Resource limit reached
      }
    }

    // Check resource availability
    if (!this.hasAvailableResources(request.resourceRequirements)) {
      return null;
    }

    const agent = this.createSpecializedAgent(request);
    this.agents.set(agent.id, agent);
    
    // Allocate resources
    this.resourcePool.usedMemory += request.resourceRequirements.memory;
    this.resourcePool.usedProcessing += request.resourceRequirements.processing;

    systemEventEmitter.emitAgentSpawned(agent.id, agent.name, agent.specialization);
    
    return agent;
  }

  private createSpecializedAgent(request: AgentSpawnRequest): Agent {
    const agentId = uuidv4();
    const specializationName = request.specialization.join('_');
    
    const agent: Agent = {
      id: agentId,
      name: `${specializationName}_agent_${agentId.slice(0, 8)}`,
      type: request.estimatedLifetime < 60 ? 'temporary' : 'specialist',
      specialization: request.specialization,
      skills: request.requiredSkills,
      status: 'spawning',
      taskHistory: [],
      performance: {
        tasksCompleted: 0,
        tasksSuccessful: 0,
        averageTaskDuration: 0,
        qualityScore: 0.5,
        reliabilityScore: 0.5,
        lastUpdated: new Date()
      },
      capabilities: {
        maxConcurrentTasks: this.calculateMaxConcurrentTasks(request),
        preferredTaskTypes: [request.taskType],
        toolAccess: request.resourceRequirements.toolAccess,
        memorySize: request.resourceRequirements.memory,
        processingPower: request.resourceRequirements.processing
      },
      createdAt: new Date(),
      lastActive: new Date()
    };

    // Set agent to idle after spawning
    setTimeout(() => {
      agent.status = 'idle';
    }, 1000);

    return agent;
  }

  private calculateMaxConcurrentTasks(request: AgentSpawnRequest): number {
    const baseCapacity = Math.floor(request.resourceRequirements.processing / 10);
    return Math.max(1, Math.min(baseCapacity, 5));
  }

  async assignTask(taskId: string, task: Task): Promise<Agent | null> {
    const suitableAgents = this.findSuitableAgents(task);
    
    if (suitableAgents.length === 0) {
      // Try to spawn a specialized agent
      const spawnRequest: AgentSpawnRequest = {
        specialization: [task.type],
        requiredSkills: task.requiredSkills,
        taskType: task.type,
        priority: this.getPriorityScore(task.priority),
        estimatedLifetime: task.estimatedDuration + 30,
        resourceRequirements: {
          memory: this.estimateMemoryRequirement(task),
          processing: this.estimateProcessingRequirement(task),
          toolAccess: this.getRequiredTools(task)
        }
      };

      const newAgent = await this.spawnAgent(spawnRequest);
      if (newAgent) {
        return this.assignTaskToAgent(newAgent, taskId, task);
      }
      return null;
    }

    // Select best agent based on performance and availability
    const bestAgent = this.selectBestAgent(suitableAgents, task);
    return this.assignTaskToAgent(bestAgent, taskId, task);
  }

  private findSuitableAgents(task: Task): Agent[] {
    return Array.from(this.agents.values()).filter(agent => {
      // Check if agent is available
      if (agent.status !== 'idle' && agent.status !== 'busy') return false;
      
      // Check if agent has capacity
      const currentTasks = this.getAgentCurrentTasks(agent.id).length;
      if (currentTasks >= agent.capabilities.maxConcurrentTasks) return false;
      
      // Check skill match
      const hasRequiredSkills = task.requiredSkills.every(skill => 
        agent.skills.includes(skill) || agent.specialization.includes(skill)
      );
      
      // Check task type preference
      const prefersTaskType = agent.capabilities.preferredTaskTypes.includes(task.type);
      
      return hasRequiredSkills || prefersTaskType;
    });
  }

  private selectBestAgent(agents: Agent[], task: Task): Agent {
    return agents.reduce((best, current) => {
      const bestScore = this.calculateAgentScore(best, task);
      const currentScore = this.calculateAgentScore(current, task);
      return currentScore > bestScore ? current : best;
    });
  }

  private calculateAgentScore(agent: Agent, task: Task): number {
    let score = 0;
    
    // Performance score (40%)
    score += agent.performance.qualityScore * 0.4;
    
    // Skill match score (30%)
    const skillMatch = task.requiredSkills.filter(skill => 
      agent.skills.includes(skill) || agent.specialization.includes(skill)
    ).length / Math.max(task.requiredSkills.length, 1);
    score += skillMatch * 0.3;
    
    // Availability score (20%)
    const currentTasks = this.getAgentCurrentTasks(agent.id).length;
    const availabilityScore = 1 - (currentTasks / agent.capabilities.maxConcurrentTasks);
    score += availabilityScore * 0.2;
    
    // Specialization match score (10%)
    const specializationMatch = agent.specialization.includes(task.type) ? 1 : 0;
    score += specializationMatch * 0.1;
    
    return score;
  }

  private assignTaskToAgent(agent: Agent, taskId: string, task: Task): Agent {
    agent.currentTask = taskId;
    agent.taskHistory.push(taskId);
    agent.status = 'busy';
    agent.lastActive = new Date();
    
    systemEventEmitter.emitTaskAssigned(taskId, agent.id, task.name);
    
    return agent;
  }

  async sendMessage(fromAgentId: string, toAgentId: string, type: CommunicationType, content: any): Promise<string> {
    const messageId = uuidv4();
    const communication: AgentCommunication = {
      id: messageId,
      fromAgent: fromAgentId,
      toAgent: toAgentId,
      type,
      content,
      timestamp: new Date(),
      acknowledged: false
    };

    this.communications.set(messageId, communication);
    
    // Notify receiving agent
    const toAgent = this.agents.get(toAgentId);
    if (toAgent) {
      toAgent.lastActive = new Date();
      systemEventEmitter.emitAgentCommunication(fromAgentId, toAgentId, type);
    }

    return messageId;
  }

  getAgentMessages(agentId: string, unacknowledgedOnly = false): AgentCommunication[] {
    return Array.from(this.communications.values()).filter(comm => 
      comm.toAgent === agentId && (!unacknowledgedOnly || !comm.acknowledged)
    );
  }

  acknowledgeMessage(messageId: string): boolean {
    const message = this.communications.get(messageId);
    if (message) {
      message.acknowledged = true;
      return true;
    }
    return false;
  }

  updateAgentPerformance(agentId: string, taskCompleted: boolean, duration: number, qualityScore?: number): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    agent.performance.tasksCompleted++;
    if (taskCompleted) {
      agent.performance.tasksSuccessful++;
    }

    // Update average duration
    const totalDuration = agent.performance.averageTaskDuration * (agent.performance.tasksCompleted - 1) + duration;
    agent.performance.averageTaskDuration = totalDuration / agent.performance.tasksCompleted;

    // Update quality score if provided
    if (qualityScore !== undefined) {
      agent.performance.qualityScore = (agent.performance.qualityScore + qualityScore) / 2;
    }

    // Update reliability score
    agent.performance.reliabilityScore = agent.performance.tasksSuccessful / agent.performance.tasksCompleted;
    agent.performance.lastUpdated = new Date();

    // Update agent status
    agent.status = 'idle';
    agent.currentTask = undefined;
    agent.lastActive = new Date();
  }

  private async cleanupIdleAgents(): Promise<void> {
    const now = new Date();
    const idleThreshold = 30 * 60 * 1000; // 30 minutes
    
    for (const [agentId, agent] of this.agents.entries()) {
      if (agent.type === 'temporary' && 
          agent.status === 'idle' && 
          now.getTime() - agent.lastActive.getTime() > idleThreshold) {
        
        await this.removeAgent(agentId);
      }
    }
  }

  private async removeAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    // Free up resources
    this.resourcePool.usedMemory -= agent.capabilities.memorySize;
    this.resourcePool.usedProcessing -= agent.capabilities.processingPower;

    this.agents.delete(agentId);
    systemEventEmitter.emitAgentRemoved(agentId, agent.name);
  }

  private hasAvailableResources(requirements: { memory: number; processing: number }): boolean {
    return (this.resourcePool.usedMemory + requirements.memory <= this.resourcePool.totalMemory) &&
           (this.resourcePool.usedProcessing + requirements.processing <= this.resourcePool.totalProcessing);
  }

  private getAgentCurrentTasks(agentId: string): string[] {
    const agent = this.agents.get(agentId);
    return agent?.currentTask ? [agent.currentTask] : [];
  }

  private estimateMemoryRequirement(task: Task): number {
    const baseMemory = 10;
    const typeMultiplier = {
      'analysis': 1.5,
      'coding': 2.0,
      'research': 1.2,
      'file_operation': 1.0,
      'communication': 0.5,
      'planning': 1.3,
      'testing': 1.1,
      'deployment': 1.8
    };
    
    return Math.ceil(baseMemory * (typeMultiplier[task.type] || 1.0));
  }

  private estimateProcessingRequirement(task: Task): number {
    const basePower = 5;
    const durationMultiplier = Math.min(task.estimatedDuration / 10, 3);
    return Math.ceil(basePower * durationMultiplier);
  }

  private getRequiredTools(task: Task): string[] {
    const toolMap: Record<TaskType, string[]> = {
      'analysis': ['intelligent_read_file', 'get_file_outline'],
      'coding': ['str-replace-editor', 'save-file', 'view'],
      'research': ['web-search', 'web-fetch'],
      'file_operation': ['intelligent_read_file', 'view', 'save-file'],
      'communication': [],
      'planning': [],
      'testing': ['launch-process', 'read-process'],
      'deployment': ['launch-process', 'github-api']
    };
    
    return toolMap[task.type] || [];
  }

  private getPriorityScore(priority: string): number {
    const scores = { 'low': 1, 'medium': 2, 'high': 3, 'critical': 4 };
    return scores[priority as keyof typeof scores] || 2;
  }

  private initializeAgentTemplates(): void {
    // Core agent templates
    this.agentTemplates.set('analyst', {
      specialization: ['analysis', 'research'],
      skills: ['data_analysis', 'file_reading', 'information_processing'],
      capabilities: {
        maxConcurrentTasks: 3,
        preferredTaskTypes: ['analysis', 'research'],
        toolAccess: ['intelligent_read_file', 'get_file_outline', 'web-search'],
        memorySize: 50,
        processingPower: 7
      }
    });

    this.agentTemplates.set('coder', {
      specialization: ['coding', 'implementation'],
      skills: ['programming', 'software_development', 'code_review'],
      capabilities: {
        maxConcurrentTasks: 2,
        preferredTaskTypes: ['coding'],
        toolAccess: ['str-replace-editor', 'save-file', 'view', 'launch-process'],
        memorySize: 80,
        processingPower: 9
      }
    });

    this.agentTemplates.set('researcher', {
      specialization: ['research', 'information_gathering'],
      skills: ['web_research', 'data_collection', 'information_synthesis'],
      capabilities: {
        maxConcurrentTasks: 4,
        preferredTaskTypes: ['research'],
        toolAccess: ['web-search', 'web-fetch', 'intelligent_read_file'],
        memorySize: 30,
        processingPower: 5
      }
    });
  }

  private createCoreAgents(): void {
    // Create core agents that are always available
    const coreAgents = ['analyst', 'coder', 'researcher'];
    
    for (const templateName of coreAgents) {
      const template = this.agentTemplates.get(templateName);
      if (template) {
        const agent: Agent = {
          id: uuidv4(),
          name: `core_${templateName}`,
          type: 'generalist',
          specialization: template.specialization || [],
          skills: template.skills || [],
          status: 'idle',
          taskHistory: [],
          performance: {
            tasksCompleted: 0,
            tasksSuccessful: 0,
            averageTaskDuration: 0,
            qualityScore: 0.7,
            reliabilityScore: 0.8,
            lastUpdated: new Date()
          },
          capabilities: template.capabilities || {
            maxConcurrentTasks: 2,
            preferredTaskTypes: ['analysis'],
            toolAccess: [],
            memorySize: 20,
            processingPower: 5
          },
          createdAt: new Date(),
          lastActive: new Date()
        };

        this.agents.set(agent.id, agent);
        this.resourcePool.usedMemory += agent.capabilities.memorySize;
        this.resourcePool.usedProcessing += agent.capabilities.processingPower;
      }
    }
  }

  // Public API methods
  getAgent(agentId: string): Agent | undefined {
    return this.agents.get(agentId);
  }

  getAllAgents(): Agent[] {
    return Array.from(this.agents.values());
  }

  getActiveAgents(): Agent[] {
    return Array.from(this.agents.values()).filter(agent => 
      agent.status === 'busy' || agent.status === 'idle'
    );
  }

  getAgentsByType(type: AgentType): Agent[] {
    return Array.from(this.agents.values()).filter(agent => agent.type === type);
  }

  getResourceUsage() {
    return {
      memory: {
        used: this.resourcePool.usedMemory,
        total: this.resourcePool.totalMemory,
        percentage: (this.resourcePool.usedMemory / this.resourcePool.totalMemory) * 100
      },
      processing: {
        used: this.resourcePool.usedProcessing,
        total: this.resourcePool.totalProcessing,
        percentage: (this.resourcePool.usedProcessing / this.resourcePool.totalProcessing) * 100
      },
      agents: {
        total: this.agents.size,
        active: this.getActiveAgents().length,
        idle: Array.from(this.agents.values()).filter(a => a.status === 'idle').length
      }
    };
  }
}

export const agentManager = new AgentManager();
