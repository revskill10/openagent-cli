// task-planner.ts - Hierarchical task breakdown and planning system
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';

export interface Task {
  id: string;
  name: string;
  description: string;
  type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  estimatedDuration: number; // minutes
  actualDuration?: number;
  dependencies: string[]; // Task IDs
  subtasks: string[]; // Task IDs
  parentTask?: string; // Task ID
  assignedAgent?: string; // Agent ID
  requiredSkills: string[];
  context: Record<string, any>;
  result?: any;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  deadline?: Date;
}

export type TaskType = 'analysis' | 'coding' | 'research' | 'file_operation' | 'communication' | 'planning' | 'testing' | 'deployment';
export type TaskStatus = 'pending' | 'ready' | 'in_progress' | 'blocked' | 'completed' | 'failed' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export interface TaskPlan {
  id: string;
  name: string;
  description: string;
  rootTasks: string[];
  allTasks: Map<string, Task>;
  estimatedTotalDuration: number;
  createdAt: Date;
  status: 'planning' | 'ready' | 'executing' | 'completed' | 'failed';
}

export interface PlanningContext {
  userQuery: string;
  availableAgents: string[];
  availableTools: string[];
  constraints: {
    maxDuration?: number;
    maxConcurrency?: number;
    requiredSkills?: string[];
  };
  preferences: {
    prioritizeSpeed?: boolean;
    prioritizeQuality?: boolean;
    allowParallelExecution?: boolean;
  };
}

export class TaskPlanner {
  private plans = new Map<string, TaskPlan>();
  private taskTemplates = new Map<string, Partial<Task>>();

  constructor() {
    this.initializeTaskTemplates();
  }

  async createPlan(context: PlanningContext): Promise<TaskPlan> {
    const planId = uuidv4();
    const plan: TaskPlan = {
      id: planId,
      name: `Plan for: ${context.userQuery.substring(0, 50)}...`,
      description: context.userQuery,
      rootTasks: [],
      allTasks: new Map(),
      estimatedTotalDuration: 0,
      createdAt: new Date(),
      status: 'planning'
    };

    // Analyze the query and break it down into tasks
    const rootTasks = await this.analyzeAndBreakdown(context);
    
    // Create task hierarchy
    for (const taskDef of rootTasks) {
      const task = await this.createTask(taskDef, context);
      plan.allTasks.set(task.id, task);
      plan.rootTasks.push(task.id);
      
      // Create subtasks if needed
      await this.createSubtasks(task, plan, context);
    }

    // Optimize task order and dependencies
    await this.optimizePlan(plan, context);
    
    // Calculate total estimated duration
    plan.estimatedTotalDuration = this.calculateTotalDuration(plan);
    plan.status = 'ready';

    this.plans.set(planId, plan);
    return plan;
  }

  private async analyzeAndBreakdown(context: PlanningContext): Promise<Partial<Task>[]> {
    const query = context.userQuery.toLowerCase();
    const tasks: Partial<Task>[] = [];

    // Simple keyword-based task identification (in production, use LLM)
    if (query.includes('read') || query.includes('analyze') || query.includes('file')) {
      tasks.push({
        name: 'File Analysis',
        description: 'Read and analyze the specified files',
        type: 'analysis',
        priority: 'high',
        estimatedDuration: 5,
        requiredSkills: ['file_reading', 'analysis']
      });
    }

    if (query.includes('code') || query.includes('implement') || query.includes('create')) {
      tasks.push({
        name: 'Code Implementation',
        description: 'Implement the requested functionality',
        type: 'coding',
        priority: 'high',
        estimatedDuration: 30,
        requiredSkills: ['coding', 'programming']
      });
    }

    if (query.includes('test') || query.includes('verify')) {
      tasks.push({
        name: 'Testing',
        description: 'Test the implemented functionality',
        type: 'testing',
        priority: 'medium',
        estimatedDuration: 15,
        requiredSkills: ['testing', 'quality_assurance']
      });
    }

    if (query.includes('research') || query.includes('find') || query.includes('search')) {
      tasks.push({
        name: 'Research',
        description: 'Research the requested information',
        type: 'research',
        priority: 'medium',
        estimatedDuration: 20,
        requiredSkills: ['research', 'information_gathering']
      });
    }

    // If no specific tasks identified, create a general analysis task
    if (tasks.length === 0) {
      tasks.push({
        name: 'General Analysis',
        description: 'Analyze the request and determine appropriate actions',
        type: 'analysis',
        priority: 'high',
        estimatedDuration: 10,
        requiredSkills: ['analysis', 'planning']
      });
    }

    return tasks;
  }

  private async createTask(taskDef: Partial<Task>, context: PlanningContext): Promise<Task> {
    const task: Task = {
      id: uuidv4(),
      name: taskDef.name || 'Unnamed Task',
      description: taskDef.description || '',
      type: taskDef.type || 'analysis',
      status: 'pending',
      priority: taskDef.priority || 'medium',
      estimatedDuration: taskDef.estimatedDuration || 10,
      dependencies: taskDef.dependencies || [],
      subtasks: [],
      requiredSkills: taskDef.requiredSkills || [],
      context: { userQuery: context.userQuery },
      createdAt: new Date()
    };

    return task;
  }

  private async createSubtasks(parentTask: Task, plan: TaskPlan, context: PlanningContext): Promise<void> {
    const subtaskDefs = this.getSubtaskTemplates(parentTask.type);
    
    for (const subtaskDef of subtaskDefs) {
      const subtask = await this.createTask(subtaskDef, context);
      subtask.parentTask = parentTask.id;
      
      plan.allTasks.set(subtask.id, subtask);
      parentTask.subtasks.push(subtask.id);
    }
  }

  private getSubtaskTemplates(taskType: TaskType): Partial<Task>[] {
    const templates: Record<TaskType, Partial<Task>[]> = {
      analysis: [
        {
          name: 'Data Collection',
          description: 'Gather relevant data and information',
          type: 'research',
          estimatedDuration: 5,
          requiredSkills: ['data_collection']
        },
        {
          name: 'Data Processing',
          description: 'Process and structure the collected data',
          type: 'analysis',
          estimatedDuration: 10,
          requiredSkills: ['data_processing']
        }
      ],
      coding: [
        {
          name: 'Design Planning',
          description: 'Plan the code structure and architecture',
          type: 'planning',
          estimatedDuration: 10,
          requiredSkills: ['architecture', 'design']
        },
        {
          name: 'Implementation',
          description: 'Write the actual code',
          type: 'coding',
          estimatedDuration: 20,
          requiredSkills: ['programming']
        },
        {
          name: 'Code Review',
          description: 'Review and refactor the code',
          type: 'analysis',
          estimatedDuration: 5,
          requiredSkills: ['code_review']
        }
      ],
      research: [
        {
          name: 'Information Gathering',
          description: 'Collect relevant information from various sources',
          type: 'research',
          estimatedDuration: 15,
          requiredSkills: ['information_gathering']
        },
        {
          name: 'Information Analysis',
          description: 'Analyze and synthesize the gathered information',
          type: 'analysis',
          estimatedDuration: 10,
          requiredSkills: ['analysis']
        }
      ],
      file_operation: [
        {
          name: 'File Reading',
          description: 'Read and parse the target files',
          type: 'file_operation',
          estimatedDuration: 3,
          requiredSkills: ['file_reading']
        },
        {
          name: 'Content Analysis',
          description: 'Analyze the file contents',
          type: 'analysis',
          estimatedDuration: 7,
          requiredSkills: ['content_analysis']
        }
      ],
      testing: [
        {
          name: 'Test Planning',
          description: 'Plan the testing strategy',
          type: 'planning',
          estimatedDuration: 5,
          requiredSkills: ['test_planning']
        },
        {
          name: 'Test Execution',
          description: 'Execute the planned tests',
          type: 'testing',
          estimatedDuration: 10,
          requiredSkills: ['test_execution']
        }
      ],
      communication: [],
      planning: [],
      deployment: []
    };

    return templates[taskType] || [];
  }

  private async optimizePlan(plan: TaskPlan, context: PlanningContext): Promise<void> {
    // Set up dependencies based on task types and logic
    const tasks = Array.from(plan.allTasks.values());
    
    for (const task of tasks) {
      // Analysis tasks should come before coding tasks
      if (task.type === 'coding') {
        const analysisTasks = tasks.filter(t => t.type === 'analysis' && t.id !== task.id);
        task.dependencies.push(...analysisTasks.map(t => t.id));
      }
      
      // Testing tasks should come after coding tasks
      if (task.type === 'testing') {
        const codingTasks = tasks.filter(t => t.type === 'coding');
        task.dependencies.push(...codingTasks.map(t => t.id));
      }
      
      // Subtasks should depend on their parent being started
      if (task.parentTask) {
        const parent = plan.allTasks.get(task.parentTask);
        if (parent && parent.subtasks.length > 1) {
          // Create sequential dependencies between subtasks
          const siblingIndex = parent.subtasks.indexOf(task.id);
          if (siblingIndex > 0) {
            task.dependencies.push(parent.subtasks[siblingIndex - 1]);
          }
        }
      }
    }

    // Update task statuses based on dependencies
    this.updateTaskStatuses(plan);
  }

  private updateTaskStatuses(plan: TaskPlan): void {
    for (const task of plan.allTasks.values()) {
      if (task.status === 'pending') {
        const dependenciesMet = task.dependencies.every(depId => {
          const depTask = plan.allTasks.get(depId);
          return depTask?.status === 'completed';
        });
        
        if (dependenciesMet) {
          task.status = 'ready';
        }
      }
    }
  }

  private calculateTotalDuration(plan: TaskPlan): number {
    // Calculate critical path duration
    const tasks = Array.from(plan.allTasks.values());
    const visited = new Set<string>();
    let maxDuration = 0;

    for (const rootTaskId of plan.rootTasks) {
      const duration = this.calculateTaskPathDuration(rootTaskId, plan, visited);
      maxDuration = Math.max(maxDuration, duration);
    }

    return maxDuration;
  }

  private calculateTaskPathDuration(taskId: string, plan: TaskPlan, visited: Set<string>): number {
    if (visited.has(taskId)) return 0;
    visited.add(taskId);

    const task = plan.allTasks.get(taskId);
    if (!task) return 0;

    let maxSubtaskDuration = 0;
    for (const subtaskId of task.subtasks) {
      const subtaskDuration = this.calculateTaskPathDuration(subtaskId, plan, visited);
      maxSubtaskDuration = Math.max(maxSubtaskDuration, subtaskDuration);
    }

    return task.estimatedDuration + maxSubtaskDuration;
  }

  private initializeTaskTemplates(): void {
    // Initialize common task templates for reuse
    this.taskTemplates.set('file_analysis', {
      name: 'File Analysis',
      type: 'analysis',
      estimatedDuration: 5,
      requiredSkills: ['file_reading', 'analysis']
    });

    this.taskTemplates.set('code_implementation', {
      name: 'Code Implementation',
      type: 'coding',
      estimatedDuration: 30,
      requiredSkills: ['programming', 'coding']
    });

    this.taskTemplates.set('research_task', {
      name: 'Research Task',
      type: 'research',
      estimatedDuration: 20,
      requiredSkills: ['research', 'information_gathering']
    });
  }

  // Public methods for plan management
  getPlan(planId: string): TaskPlan | undefined {
    return this.plans.get(planId);
  }

  getTask(planId: string, taskId: string): Task | undefined {
    const plan = this.plans.get(planId);
    return plan?.allTasks.get(taskId);
  }

  updateTaskStatus(planId: string, taskId: string, status: TaskStatus, result?: any, error?: string): boolean {
    const plan = this.plans.get(planId);
    const task = plan?.allTasks.get(taskId);
    
    if (!task) return false;

    task.status = status;
    if (result !== undefined) task.result = result;
    if (error) task.error = error;

    if (status === 'in_progress' && !task.startedAt) {
      task.startedAt = new Date();
    }

    if (status === 'completed' || status === 'failed') {
      task.completedAt = new Date();
      if (task.startedAt) {
        task.actualDuration = Math.round((task.completedAt.getTime() - task.startedAt.getTime()) / 60000);
      }
    }

    // Update dependent tasks
    if (plan) {
      this.updateTaskStatuses(plan);
    }

    return true;
  }

  getReadyTasks(planId: string): Task[] {
    const plan = this.plans.get(planId);
    if (!plan) return [];

    return Array.from(plan.allTasks.values()).filter(task => task.status === 'ready');
  }

  getTasksByAgent(planId: string, agentId: string): Task[] {
    const plan = this.plans.get(planId);
    if (!plan) return [];

    return Array.from(plan.allTasks.values()).filter(task => task.assignedAgent === agentId);
  }

  assignTaskToAgent(planId: string, taskId: string, agentId: string): boolean {
    const task = this.getTask(planId, taskId);
    if (!task || task.status !== 'ready') return false;

    task.assignedAgent = agentId;
    return true;
  }

  getPlanProgress(planId: string): { completed: number; total: number; percentage: number } {
    const plan = this.plans.get(planId);
    if (!plan) return { completed: 0, total: 0, percentage: 0 };

    const tasks = Array.from(plan.allTasks.values());
    const completed = tasks.filter(task => task.status === 'completed').length;
    const total = tasks.length;
    const percentage = total > 0 ? (completed / total) * 100 : 0;

    return { completed, total, percentage };
  }
}

export const taskPlanner = new TaskPlanner();
