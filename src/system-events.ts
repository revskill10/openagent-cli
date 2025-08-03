import { EventEmitter } from 'events';

export interface SystemEvent {
  id: string;
  timestamp: number;
  type: 'task_start' | 'task_complete' | 'task_error' | 'task_assigned' | 'agent_delegation' | 'agent_communication' | 'agent_spawned' | 'agent_removed' | 'tool_start' | 'tool_complete' | 'tool_error' | 'system_info';
  agentId?: string;
  taskId?: string;
  data: any;
}

export interface TaskStatus {
  id: string;
  agentId: string;
  description: string;
  status: 'running' | 'completed' | 'error';
  startTime: number;
  endTime?: number;
  parentTaskId?: string;
}

export interface AgentStatus {
  id: string;
  specialization?: string;
  isActive: boolean;
  currentTask?: string;
  taskQueue: number;
}

export interface ToolExecution {
  id: string;
  toolName: string;
  agentId: string;
  status: 'running' | 'completed' | 'error';
  startTime: number;
  endTime?: number;
  result?: any;
  error?: string;
}

export class SystemEventEmitter extends EventEmitter {
  private eventId = 1;
  private recentEvents: SystemEvent[] = [];
  private activeTasks: Map<string, TaskStatus> = new Map();
  private agentStatuses: Map<string, AgentStatus> = new Map();
  private toolExecutions: Map<string, ToolExecution> = new Map();

  emitTaskStart(taskId: string, agentId: string, description: string, parentTaskId?: string) {
    const event: SystemEvent = {
      id: `evt_${this.eventId++}`,
      timestamp: Date.now(),
      type: 'task_start',
      agentId,
      taskId,
      data: { description, parentTaskId }
    };

    const taskStatus: TaskStatus = {
      id: taskId,
      agentId,
      description,
      status: 'running',
      startTime: Date.now(),
      parentTaskId
    };

    this.activeTasks.set(taskId, taskStatus);
    this.updateAgentStatus(agentId, { isActive: true, currentTask: taskId });
    this.addEvent(event);
    this.emit('systemEvent', event);
  }

  emitTaskComplete(taskId: string, result?: any) {
    const task = this.activeTasks.get(taskId);
    if (task) {
      task.status = 'completed';
      task.endTime = Date.now();
      this.updateAgentStatus(task.agentId, { isActive: false, currentTask: undefined });
    }

    const event: SystemEvent = {
      id: `evt_${this.eventId++}`,
      timestamp: Date.now(),
      type: 'task_complete',
      agentId: task?.agentId,
      taskId,
      data: { result, executionTime: task ? Date.now() - task.startTime : 0 }
    };

    this.addEvent(event);
    this.emit('systemEvent', event);
  }

  emitTaskError(taskId: string, error: string) {
    const task = this.activeTasks.get(taskId);
    if (task) {
      task.status = 'error';
      task.endTime = Date.now();
      this.updateAgentStatus(task.agentId, { isActive: false, currentTask: undefined });
    }

    const event: SystemEvent = {
      id: `evt_${this.eventId++}`,
      timestamp: Date.now(),
      type: 'task_error',
      agentId: task?.agentId,
      taskId,
      data: { error }
    };

    this.addEvent(event);
    this.emit('systemEvent', event);
  }

  emitAgentDelegation(fromAgent: string, toAgent: string, task: string, taskId: string) {
    const event: SystemEvent = {
      id: `evt_${this.eventId++}`,
      timestamp: Date.now(),
      type: 'agent_delegation',
      agentId: fromAgent,
      taskId,
      data: { toAgent, task: task.substring(0, 50) + (task.length > 50 ? '...' : '') }
    };

    this.addEvent(event);
    this.emit('systemEvent', event);
  }

  emitAgentCommunication(fromAgent: string, toAgent: string, message: string) {
    const event: SystemEvent = {
      id: `evt_${this.eventId++}`,
      timestamp: Date.now(),
      type: 'agent_communication',
      agentId: fromAgent,
      data: { toAgent, message: message.substring(0, 50) + (message.length > 50 ? '...' : '') }
    };

    this.addEvent(event);
    this.emit('systemEvent', event);
  }

  emitToolStart(toolId: string, toolName: string, agentId: string, args: any) {
    const toolExecution: ToolExecution = {
      id: toolId,
      toolName,
      agentId,
      status: 'running',
      startTime: Date.now()
    };

    this.toolExecutions.set(toolId, toolExecution);

    const event: SystemEvent = {
      id: `evt_${this.eventId++}`,
      timestamp: Date.now(),
      type: 'tool_start',
      agentId,
      data: { toolId, toolName, args: Object.keys(args).length }
    };

    this.addEvent(event);
    this.emit('systemEvent', event);
  }

  emitToolComplete(toolId: string, result: any) {
    const tool = this.toolExecutions.get(toolId);
    if (tool) {
      tool.status = 'completed';
      tool.endTime = Date.now();
      tool.result = result;
    }

    const event: SystemEvent = {
      id: `evt_${this.eventId++}`,
      timestamp: Date.now(),
      type: 'tool_complete',
      agentId: tool?.agentId,
      data: { 
        toolId, 
        toolName: tool?.toolName,
        executionTime: tool ? Date.now() - tool.startTime : 0,
        success: true
      }
    };

    this.addEvent(event);
    this.emit('systemEvent', event);
  }

  emitToolError(toolId: string, error: string) {
    const tool = this.toolExecutions.get(toolId);
    if (tool) {
      tool.status = 'error';
      tool.endTime = Date.now();
      tool.error = error;
    }

    const event: SystemEvent = {
      id: `evt_${this.eventId++}`,
      timestamp: Date.now(),
      type: 'tool_error',
      agentId: tool?.agentId,
      data: { 
        toolId, 
        toolName: tool?.toolName,
        error: error.substring(0, 100) + (error.length > 100 ? '...' : '')
      }
    };

    this.addEvent(event);
    this.emit('systemEvent', event);
  }

  emitSystemInfo(message: string, data?: any) {
    const event: SystemEvent = {
      id: `evt_${this.eventId++}`,
      timestamp: Date.now(),
      type: 'system_info',
      data: { message, ...data }
    };

    this.addEvent(event);
    this.emit('systemEvent', event);
  }

  emitTaskAssigned(taskId: string, agentId: string, taskName: string) {
    const event: SystemEvent = {
      id: `evt_${this.eventId++}`,
      timestamp: Date.now(),
      type: 'task_assigned',
      agentId,
      taskId,
      data: { taskName }
    };

    this.addEvent(event);
    this.emit('systemEvent', event);
  }

  emitAgentSpawned(agentId: string, agentName: string, specialization: string[]) {
    const event: SystemEvent = {
      id: `evt_${this.eventId++}`,
      timestamp: Date.now(),
      type: 'agent_spawned',
      agentId,
      data: { name: agentName, specialization }
    };

    this.addEvent(event);
    this.emit('systemEvent', event);
  }

  emitAgentRemoved(agentId: string, agentName: string) {
    const event: SystemEvent = {
      id: `evt_${this.eventId++}`,
      timestamp: Date.now(),
      type: 'agent_removed',
      agentId,
      data: { name: agentName }
    };

    this.addEvent(event);
    this.emit('systemEvent', event);
  }

  private updateAgentStatus(agentId: string, updates: Partial<AgentStatus>) {
    const current = this.agentStatuses.get(agentId) || {
      id: agentId,
      isActive: false,
      taskQueue: 0
    };

    this.agentStatuses.set(agentId, { ...current, ...updates });
  }

  private addEvent(event: SystemEvent) {
    this.recentEvents.push(event);
    // Keep only last 100 events
    if (this.recentEvents.length > 100) {
      this.recentEvents = this.recentEvents.slice(-100);
    }
  }

  getRecentEvents(limit = 20): SystemEvent[] {
    return this.recentEvents.slice(-limit).reverse();
  }

  getActiveTasks(): TaskStatus[] {
    return Array.from(this.activeTasks.values()).filter(task => task.status === 'running');
  }

  getAgentStatuses(): AgentStatus[] {
    return Array.from(this.agentStatuses.values());
  }

  getActiveToolExecutions(): ToolExecution[] {
    return Array.from(this.toolExecutions.values()).filter(tool => tool.status === 'running');
  }

  clearHistory() {
    this.recentEvents = [];
    this.activeTasks.clear();
    this.toolExecutions.clear();
  }
}

export const systemEventEmitter = new SystemEventEmitter();