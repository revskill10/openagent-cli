// TaskPlanningDisplay.tsx - Component for displaying task planning like Claude Code
import React from 'react';
import { Text, Box, Newline } from 'ink';

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  subtasks?: Task[];
  estimatedTime?: string;
  dependencies?: string[];
}

interface TaskPlanningDisplayProps {
  title: string;
  tasks: Task[];
  showProgress?: boolean;
}

const TaskItem: React.FC<{ 
  task: Task; 
  level?: number; 
  showProgress?: boolean;
}> = ({ task, level = 0, showProgress = false }) => {
  const getStatusIcon = (status: Task['status']) => {
    switch (status) {
      case 'pending':
        return '☐';
      case 'in_progress':
        return '⧗';
      case 'completed':
        return '☑';
      case 'failed':
        return '☒';
      default:
        return '☐';
    }
  };

  const getStatusColor = (status: Task['status']) => {
    switch (status) {
      case 'pending':
        return 'gray';
      case 'in_progress':
        return 'yellow';
      case 'completed':
        return 'green';
      case 'failed':
        return 'red';
      default:
        return 'gray';
    }
  };

  const indent = '  '.repeat(level);

  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <Text color="gray">{indent}</Text>
        <Text color={getStatusColor(task.status)}>
          {getStatusIcon(task.status)} 
        </Text>
        <Text color="white"> {task.title}</Text>
        {task.estimatedTime && showProgress && (
          <Text color="gray"> ({task.estimatedTime})</Text>
        )}
      </Box>
      
      {task.description && (
        <Box marginLeft={level * 2 + 2}>
          <Text color="gray" dimColor>{task.description}</Text>
        </Box>
      )}
      
      {task.subtasks && task.subtasks.map(subtask => (
        <TaskItem 
          key={subtask.id} 
          task={subtask} 
          level={level + 1} 
          showProgress={showProgress}
        />
      ))}
    </Box>
  );
};

const TaskPlanningDisplay: React.FC<TaskPlanningDisplayProps> = ({ 
  title, 
  tasks, 
  showProgress = false 
}) => {
  const getOverallProgress = () => {
    const flatTasks = tasks.flatMap(task => [
      task,
      ...(task.subtasks || [])
    ]);
    
    const completed = flatTasks.filter(t => t.status === 'completed').length;
    const total = flatTasks.length;
    
    return { completed, total, percentage: total > 0 ? Math.round((completed / total) * 100) : 0 };
  };

  const progress = getOverallProgress();

  return (
    <Box flexDirection="column">
      <Box borderStyle="single" borderColor="cyan" paddingX={1}>
        <Text color="cyan" bold>📋 {title}</Text>
        {showProgress && (
          <Text color="gray"> ({progress.completed}/{progress.total} - {progress.percentage}%)</Text>
        )}
      </Box>
      
      <Box flexDirection="column" marginTop={1} paddingX={1}>
        {tasks.map(task => (
          <TaskItem 
            key={task.id} 
            task={task} 
            showProgress={showProgress}
          />
        ))}
      </Box>
      
      {showProgress && (
        <Box marginTop={1} paddingX={1}>
          <Text color="gray">
            Progress: {'█'.repeat(Math.floor(progress.percentage / 5))}
            {'░'.repeat(20 - Math.floor(progress.percentage / 5))} {progress.percentage}%
          </Text>
        </Box>
      )}
    </Box>
  );
};

export default TaskPlanningDisplay;
