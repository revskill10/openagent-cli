import { EventEmitter } from 'events';
export class SystemEventEmitter extends EventEmitter {
    eventId = 1;
    recentEvents = [];
    activeTasks = new Map();
    agentStatuses = new Map();
    toolExecutions = new Map();
    emitTaskStart(taskId, agentId, description, parentTaskId) {
        const event = {
            id: `evt_${this.eventId++}`,
            timestamp: Date.now(),
            type: 'task_start',
            agentId,
            taskId,
            data: { description, parentTaskId }
        };
        const taskStatus = {
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
    emitTaskComplete(taskId, result) {
        const task = this.activeTasks.get(taskId);
        if (task) {
            task.status = 'completed';
            task.endTime = Date.now();
            this.updateAgentStatus(task.agentId, { isActive: false, currentTask: undefined });
        }
        const event = {
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
    emitTaskError(taskId, error) {
        const task = this.activeTasks.get(taskId);
        if (task) {
            task.status = 'error';
            task.endTime = Date.now();
            this.updateAgentStatus(task.agentId, { isActive: false, currentTask: undefined });
        }
        const event = {
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
    emitAgentDelegation(fromAgent, toAgent, task, taskId) {
        const event = {
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
    emitAgentCommunication(fromAgent, toAgent, message) {
        const event = {
            id: `evt_${this.eventId++}`,
            timestamp: Date.now(),
            type: 'agent_communication',
            agentId: fromAgent,
            data: { toAgent, message: message.substring(0, 50) + (message.length > 50 ? '...' : '') }
        };
        this.addEvent(event);
        this.emit('systemEvent', event);
    }
    emitToolStart(toolId, toolName, agentId, args) {
        const toolExecution = {
            id: toolId,
            toolName,
            agentId,
            status: 'running',
            startTime: Date.now()
        };
        this.toolExecutions.set(toolId, toolExecution);
        const event = {
            id: `evt_${this.eventId++}`,
            timestamp: Date.now(),
            type: 'tool_start',
            agentId,
            data: { toolId, toolName, args: Object.keys(args).length }
        };
        this.addEvent(event);
        this.emit('systemEvent', event);
    }
    emitToolComplete(toolId, result) {
        const tool = this.toolExecutions.get(toolId);
        if (tool) {
            tool.status = 'completed';
            tool.endTime = Date.now();
            tool.result = result;
        }
        const event = {
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
    emitToolError(toolId, error) {
        const tool = this.toolExecutions.get(toolId);
        if (tool) {
            tool.status = 'error';
            tool.endTime = Date.now();
            tool.error = error;
        }
        const event = {
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
    emitSystemInfo(message, data) {
        const event = {
            id: `evt_${this.eventId++}`,
            timestamp: Date.now(),
            type: 'system_info',
            data: { message, ...data }
        };
        this.addEvent(event);
        this.emit('systemEvent', event);
    }
    emitTaskAssigned(taskId, agentId, taskName) {
        const event = {
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
    emitAgentSpawned(agentId, agentName, specialization) {
        const event = {
            id: `evt_${this.eventId++}`,
            timestamp: Date.now(),
            type: 'agent_spawned',
            agentId,
            data: { name: agentName, specialization }
        };
        this.addEvent(event);
        this.emit('systemEvent', event);
    }
    emitAgentRemoved(agentId, agentName) {
        const event = {
            id: `evt_${this.eventId++}`,
            timestamp: Date.now(),
            type: 'agent_removed',
            agentId,
            data: { name: agentName }
        };
        this.addEvent(event);
        this.emit('systemEvent', event);
    }
    updateAgentStatus(agentId, updates) {
        const current = this.agentStatuses.get(agentId) || {
            id: agentId,
            isActive: false,
            taskQueue: 0
        };
        this.agentStatuses.set(agentId, { ...current, ...updates });
    }
    addEvent(event) {
        this.recentEvents.push(event);
        // Keep only last 100 events
        if (this.recentEvents.length > 100) {
            this.recentEvents = this.recentEvents.slice(-100);
        }
    }
    getRecentEvents(limit = 20) {
        return this.recentEvents.slice(-limit).reverse();
    }
    getActiveTasks() {
        return Array.from(this.activeTasks.values()).filter(task => task.status === 'running');
    }
    getAgentStatuses() {
        return Array.from(this.agentStatuses.values());
    }
    getActiveToolExecutions() {
        return Array.from(this.toolExecutions.values()).filter(tool => tool.status === 'running');
    }
    clearHistory() {
        this.recentEvents = [];
        this.activeTasks.clear();
        this.toolExecutions.clear();
    }
}
export const systemEventEmitter = new SystemEventEmitter();
