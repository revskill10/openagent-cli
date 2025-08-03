import React, { useState } from 'react';
import { Box, Text } from 'ink';

export const TaskPlanner = ({ 
  plan, 
  visible, 
  width = 80, 
  height = 20 
}) => {
  const [expandedSteps, setExpandedSteps] = useState(new Set());

  if (!visible || !plan) return null;

  const getStatusIcon = (status) => {
    switch (status) {
      case 'pending': return '⏳';
      case 'running': return '🔄';
      case 'completed': return '✅';
      case 'failed': return '❌';
      case 'skipped': return '⏭️';
      default: return '❓';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'gray';
      case 'running': return 'yellow';
      case 'completed': return 'green';
      case 'failed': return 'red';
      case 'skipped': return 'gray';
      default: return 'white';
    }
  };

  const formatDuration = (start, end) => {
    if (!start) return '';
    const endTime = end || new Date();
    const duration = (endTime.getTime() - start.getTime()) / 1000;
    return `${duration.toFixed(1)}s`;
  };

  const renderStep = (step, depth = 0) => {
    const indent = '  '.repeat(depth);
    const hasSubsteps = step.substeps && step.substeps.length > 0;

    return (
      <Box key={step.id} flexDirection="column">
        <Box>
          <Text color={getStatusColor(step.status)}>
            {indent}{getStatusIcon(step.status)} {step.title}
            {step.status === 'running' && ' ⠋'}
            {step.startTime && ` (${formatDuration(step.startTime, step.endTime)})`}
            {step.toolName && ` [${step.toolName}]`}
          </Text>
        </Box>
        
        {/* Description */}
        {step.description && (
          <Box marginLeft={depth * 2 + 2}>
            <Text color="gray" dimColor>
              {step.description}
            </Text>
          </Box>
        )}

        {/* Result or Error */}
        {step.result && step.status === 'completed' && (
          <Box marginLeft={depth * 2 + 2}>
            <Text color="green">
              ✓ {step.result.substring(0, 100)}{step.result.length > 100 ? '...' : ''}
            </Text>
          </Box>
        )}

        {step.error && step.status === 'failed' && (
          <Box marginLeft={depth * 2 + 2}>
            <Text color="red">
              ✗ {step.error.substring(0, 100)}{step.error.length > 100 ? '...' : ''}
            </Text>
          </Box>
        )}

        {/* Substeps */}
        {hasSubsteps && step.substeps.map(substep => 
          renderStep(substep, depth + 1)
        )}
      </Box>
    );
  };

  const completedSteps = plan.steps.filter(s => s.status === 'completed').length;
  const totalSteps = plan.steps.length;
  const progress = totalSteps > 0 ? (completedSteps / totalSteps * 100).toFixed(0) : '0';

  return (
    <Box flexDirection="column" width={width} height={height} borderStyle="single" borderColor="cyan">
      {/* Header */}
      <Box flexDirection="row" justifyContent="space-between" paddingX={1}>
        <Text color="cyan" bold>
          📋 Task Plan: {plan.title}
        </Text>
        <Text color="cyan">
          {progress}% ({completedSteps}/{totalSteps})
        </Text>
      </Box>

      {/* Plan Description */}
      <Box paddingX={1}>
        <Text color="gray" dimColor>
          {plan.description}
        </Text>
      </Box>

      {/* Progress Bar */}
      <Box paddingX={1} marginY={1}>
        <Text color="cyan">
          Progress: {'█'.repeat(Math.floor(parseInt(progress) / 10))}{'░'.repeat(10 - Math.floor(parseInt(progress) / 10))} {progress}%
        </Text>
      </Box>

      {/* Steps */}
      <Box flexDirection="column" paddingX={1} flexGrow={1}>
        {plan.steps.map(step => renderStep(step))}
      </Box>

      {/* Footer */}
      <Box paddingX={1} borderTop borderColor="gray">
        <Text color="gray" dimColor>
          Status: {plan.status} | Started: {plan.startTime.toLocaleTimeString()}
          {plan.endTime && ` | Completed: ${plan.endTime.toLocaleTimeString()}`}
        </Text>
      </Box>
    </Box>
  );
};

// Helper function to create a task plan from AI response
export const createTaskPlanFromAIResponse = (aiResponse) => {
  try {
    // Parse AI response to extract task plan
    const lines = aiResponse.split('\n');
    const steps = [];
    
    let currentStep = null;
    let stepCounter = 1;

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Look for numbered steps or bullet points
      if (trimmed.match(/^\d+\.\s/) || trimmed.match(/^[-*]\s/)) {
        // Save previous step
        if (currentStep && currentStep.title) {
          steps.push({
            id: `step-${stepCounter}`,
            title: currentStep.title,
            description: currentStep.description || '',
            status: 'pending',
            ...currentStep
          });
          stepCounter++;
        }
        
        // Start new step
        currentStep = {
          title: trimmed.replace(/^\d+\.\s/, '').replace(/^[-*]\s/, ''),
          description: ''
        };
      } else if (currentStep && trimmed) {
        // Add to description
        currentStep.description = (currentStep.description || '') + ' ' + trimmed;
      }
    }
    
    // Add final step
    if (currentStep && currentStep.title) {
      steps.push({
        id: `step-${stepCounter}`,
        title: currentStep.title,
        description: currentStep.description || '',
        status: 'pending',
        ...currentStep
      });
    }

    if (steps.length === 0) {
      return null;
    }

    return {
      id: `plan-${Date.now()}`,
      title: 'AI Task Execution Plan',
      description: 'Automatically generated from AI response',
      steps,
      status: 'planning',
      startTime: new Date()
    };
  } catch (error) {
    console.warn('Failed to parse task plan from AI response:', error);
    return null;
  }
};

// Helper function to update step status
export const updateStepStatus = (plan, stepId, status, result, error) => {
  return {
    ...plan,
    steps: plan.steps.map(step => {
      if (step.id === stepId) {
        const updatedStep = {
          ...step,
          status,
          result,
          error
        };
        
        if (status === 'running' && !step.startTime) {
          updatedStep.startTime = new Date();
        }
        
        if ((status === 'completed' || status === 'failed') && !step.endTime) {
          updatedStep.endTime = new Date();
        }
        
        return updatedStep;
      }
      return step;
    })
  };
};

export default TaskPlanner;
