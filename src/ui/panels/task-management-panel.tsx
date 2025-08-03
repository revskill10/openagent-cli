// task-management-panel.tsx - Task hierarchy, progress, and dependency visualization
import React, { useState, useEffect } from 'react';
import { Text, Box, Static } from 'ink';
import { taskPlanner, Task, TaskPlan } from '../../advanced-agents/task-planner.js';
import { agentOrchestrator } from '../../advanced-agents/agent-orchestrator.js';

interface TaskManagementPanelProps {
  height: number;
  width: number;
  isMinimized: boolean;
}

interface TaskDisplayInfo extends Task {
  depth: number;
  hasChildren: boolean;
  isLast: boolean;
  progress: number;
}

export const TaskManagementPanel: React.FC<TaskManagementPanelProps> = ({ 
  height, 
  width, 
  isMinimized 
}) => {
  const [activePlans, setActivePlans] = useState<any[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'hierarchy' | 'timeline' | 'dependencies'>('hierarchy');
  const [tasks, setTasks] = useState<TaskDisplayInfo[]>([]);

  useEffect(() => {
    const updatePlans = async () => {
      const orchestrations = agentOrchestrator.getActiveOrchestrations();
      setActivePlans(orchestrations);

      if (orchestrations.length > 0 && !selectedPlan) {
        setSelectedPlan(orchestrations[0].planId);
      }

      if (selectedPlan) {
        const orchestration = orchestrations.find(o => o.planId === selectedPlan);
        if (orchestration) {
          const taskHierarchy = buildTaskHierarchy(orchestration.plan);
          setTasks(taskHierarchy);
        }
      }
    };

    updatePlans();
    const interval = setInterval(updatePlans, 3000);

    return () => clearInterval(interval);
  }, [selectedPlan]);

  const buildTaskHierarchy = (plan: TaskPlan): TaskDisplayInfo[] => {
    const hierarchy: TaskDisplayInfo[] = [];
    const visited = new Set<string>();

    const addTaskToHierarchy = (taskId: string, depth: number = 0, isLast: boolean = false) => {
      if (visited.has(taskId)) return;
      visited.add(taskId);

      const task = plan.allTasks.get(taskId);
      if (!task) return;

      const progress = calculateTaskProgress(task);
      const hasChildren = task.subtasks.length > 0;

      hierarchy.push({
        ...task,
        depth,
        hasChildren,
        isLast,
        progress
      });

      // Add subtasks
      task.subtasks.forEach((subtaskId, index) => {
        const isLastSubtask = index === task.subtasks.length - 1;
        addTaskToHierarchy(subtaskId, depth + 1, isLastSubtask);
      });
    };

    // Start with root tasks
    plan.rootTasks.forEach((rootTaskId, index) => {
      const isLastRoot = index === plan.rootTasks.length - 1;
      addTaskToHierarchy(rootTaskId, 0, isLastRoot);
    });

    return hierarchy;
  };

  const calculateTaskProgress = (task: Task): number => {
    switch (task.status) {
      case 'completed': return 100;
      case 'in_progress': return 50;
      case 'failed': return 0;
      case 'cancelled': return 0;
      default: return 0;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'green';
      case 'in_progress': return 'yellow';
      case 'ready': return 'cyan';
      case 'blocked': return 'red';
      case 'failed': return 'red';
      case 'cancelled': return 'gray';
      default: return 'white';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return '✅';
      case 'in_progress': return '⚡';
      case 'ready': return '🟡';
      case 'blocked': return '🔴';
      case 'failed': return '❌';
      case 'cancelled': return '⚫';
      case 'pending': return '⏳';
      default: return '❓';
    }
  };

  const getTaskTypeIcon = (type: string) => {
    switch (type) {
      case 'analysis': return '🔍';
      case 'coding': return '💻';
      case 'research': return '📚';
      case 'file_operation': return '📁';
      case 'communication': return '💬';
      case 'planning': return '📋';
      case 'testing': return '🧪';
      case 'deployment': return '🚀';
      default: return '📄';
    }
  };

  const getTreePrefix = (depth: number, isLast: boolean, hasChildren: boolean) => {
    let prefix = '';
    
    // Add indentation
    for (let i = 0; i < depth; i++) {
      prefix += '  ';
    }
    
    // Add tree structure
    if (depth > 0) {
      prefix += isLast ? '└─ ' : '├─ ';
    }
    
    return prefix;
  };

  const getProgressBar = (progress: number, width: number = 8) => {
    const filled = Math.round((progress / 100) * width);
    const empty = width - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  };

  if (isMinimized) {
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === 'completed').length;
    const activeTasks = tasks.filter(t => t.status === 'in_progress').length;

    return (
      <Box borderStyle="single" borderColor="magenta" width={width} height={3}>
        <Box flexDirection="column" width="100%">
          <Text color="magenta" bold>📋 Tasks (Minimized)</Text>
          <Text color="gray">
            {completedTasks}/{totalTasks} done | {activeTasks} active
          </Text>
        </Box>
      </Box>
    );
  }

  const displayHeight = Math.max(height - 6, 5);

  return (
    <Box borderStyle="single" borderColor="magenta" width={width} height={height}>
      <Box flexDirection="column" width="100%">
        {/* Header */}
        <Box justifyContent="space-between" marginBottom={1}>
          <Text color="magenta" bold>📋 Task Management</Text>
          <Text color="gray">
            {activePlans.length} plan{activePlans.length !== 1 ? 's' : ''}
          </Text>
        </Box>

        {/* Plan Selector */}
        {activePlans.length > 0 && (
          <Box marginBottom={1}>
            <Text color="gray">Plan: </Text>
            <Text color="cyan">
              {activePlans.find(p => p.planId === selectedPlan)?.plan.name.substring(0, 30) || 'None'}
            </Text>
          </Box>
        )}

        {/* View Mode Controls */}
        <Box marginBottom={1}>
          <Text color="gray">View: </Text>
          <Text color={viewMode === 'hierarchy' ? 'cyan' : 'gray'}>Hierarchy</Text>
          <Text color="gray"> | </Text>
          <Text color={viewMode === 'timeline' ? 'cyan' : 'gray'}>Timeline</Text>
          <Text color="gray"> | </Text>
          <Text color={viewMode === 'dependencies' ? 'cyan' : 'gray'}>Dependencies</Text>
        </Box>

        {/* Task Display */}
        <Box flexDirection="column" height={displayHeight}>
          {tasks.length === 0 ? (
            <Text color="gray">No tasks available</Text>
          ) : viewMode === 'hierarchy' ? (
            <Static items={tasks.slice(0, displayHeight)}>
              {(task, index) => (
                <Box key={`task-${task.id}-${index}`} flexDirection="column">
                  <Box>
                    <Text color="gray">
                      {getTreePrefix(task.depth, task.isLast, task.hasChildren)}
                    </Text>
                    <Text color={getStatusColor(task.status)}>
                      {getStatusIcon(task.status)}
                    </Text>
                    <Text color="cyan"> {getTaskTypeIcon(task.type)} </Text>
                    <Text bold>
                      {task.name.substring(0, Math.max(20, width - 30))}
                    </Text>
                  </Box>
                  
                  <Box marginLeft={task.depth * 2 + 4}>
                    <Text color="gray">Progress: </Text>
                    <Text color={task.progress === 100 ? 'green' : 'yellow'}>
                      {getProgressBar(task.progress, 6)}
                    </Text>
                    <Text color="gray"> {task.progress}%</Text>
                  </Box>

                  {task.assignedAgent && (
                    <Box marginLeft={task.depth * 2 + 4}>
                      <Text color="gray">Agent: </Text>
                      <Text color="blue">{task.assignedAgent.substring(0, 12)}</Text>
                    </Box>
                  )}

                  {task.dependencies.length > 0 && (
                    <Box marginLeft={task.depth * 2 + 4}>
                      <Text color="gray">Deps: </Text>
                      <Text color="red">{task.dependencies.length}</Text>
                    </Box>
                  )}

                  {task.estimatedDuration && (
                    <Box marginLeft={task.depth * 2 + 4}>
                      <Text color="gray">Est: </Text>
                      <Text color="yellow">{task.estimatedDuration}m</Text>
                      {task.actualDuration && (
                        <>
                          <Text color="gray"> | Actual: </Text>
                          <Text color="green">{task.actualDuration}m</Text>
                        </>
                      )}
                    </Box>
                  )}
                </Box>
              )}
            </Static>
          ) : viewMode === 'timeline' ? (
            <Box flexDirection="column">
              <Text color="cyan" bold>📅 Task Timeline</Text>
              {tasks.filter(t => t.startedAt || t.completedAt).length === 0 ? (
                <Text color="gray">No timeline data available</Text>
              ) : (
                <Static items={tasks.filter(t => t.startedAt || t.completedAt).slice(0, displayHeight - 1)}>
                  {(task, index) => (
                    <Box key={`timeline-${task.id}-${index}`} flexDirection="column">
                      <Box>
                        <Text color={getStatusColor(task.status)}>
                          {getStatusIcon(task.status)}
                        </Text>
                        <Text color="cyan"> {task.name.substring(0, 25)}</Text>
                      </Box>
                      <Box marginLeft={2}>
                        {task.startedAt && (
                          <>
                            <Text color="gray">Started: </Text>
                            <Text color="yellow">
                              {task.startedAt.toLocaleTimeString([], { timeStyle: 'short' })}
                            </Text>
                          </>
                        )}
                        {task.completedAt && (
                          <>
                            <Text color="gray"> | Completed: </Text>
                            <Text color="green">
                              {task.completedAt.toLocaleTimeString([], { timeStyle: 'short' })}
                            </Text>
                          </>
                        )}
                      </Box>
                    </Box>
                  )}
                </Static>
              )}
            </Box>
          ) : (
            // Dependencies View
            <Box flexDirection="column">
              <Text color="cyan" bold>🔗 Task Dependencies</Text>
              {tasks.filter(t => t.dependencies.length > 0).length === 0 ? (
                <Text color="gray">No dependencies found</Text>
              ) : (
                <Static items={tasks.filter(t => t.dependencies.length > 0).slice(0, displayHeight - 1)}>
                  {(task, index) => (
                    <Box key={`deps-${task.id}-${index}`} flexDirection="column">
                      <Box>
                        <Text color={getStatusColor(task.status)}>
                          {getStatusIcon(task.status)}
                        </Text>
                        <Text color="cyan"> {task.name.substring(0, 20)}</Text>
                      </Box>
                      <Box marginLeft={2}>
                        <Text color="gray">Depends on: </Text>
                        <Text color="red">{task.dependencies.length} task{task.dependencies.length > 1 ? 's' : ''}</Text>
                      </Box>
                    </Box>
                  )}
                </Static>
              )}
            </Box>
          )}
        </Box>

        {/* Summary */}
        {selectedPlan && (
          <Box justifyContent="space-between" marginTop={1}>
            <Text color="gray">
              Total: {tasks.length} | 
              Done: {tasks.filter(t => t.status === 'completed').length} | 
              Active: {tasks.filter(t => t.status === 'in_progress').length}
            </Text>
            <Text color="gray">
              Progress: {tasks.length > 0 ? Math.round(
                tasks.filter(t => t.status === 'completed').length / tasks.length * 100
              ) : 0}%
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
};
