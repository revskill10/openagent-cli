// ExecutionWorkflow.tsx - Manages the step-by-step execution workflow
import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { ToolExecutionDisplay, ToolExecutionStep } from './ToolExecutionDisplay.js';

export interface ExecutionWorkflowProps {
  taskDescription: string;
  steps: ToolExecutionStep[];
  onStepApproved: (stepId: string) => void;
  onStepRejected: (stepId: string, reason?: string) => void;
  onStepModified: (stepId: string, newParameters: Record<string, any>) => void;
  onStepCancelled: (stepId: string) => void;
  onWorkflowCompleted: () => void;
  onWorkflowCancelled: () => void;
}

export const ExecutionWorkflow: React.FC<ExecutionWorkflowProps> = ({
  taskDescription,
  steps,
  onStepApproved,
  onStepRejected,
  onStepModified,
  onStepCancelled,
  onWorkflowCompleted,
  onWorkflowCancelled
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [workflowStatus, setWorkflowStatus] = useState<'planning' | 'executing' | 'completed' | 'cancelled' | 'failed'>('planning');
  const [selectedAction, setSelectedAction] = useState<'approve' | 'reject' | 'modify' | 'cancel' | null>(null);

  const currentStep = steps[currentStepIndex];
  const completedSteps = steps.filter(step => step.status === 'completed').length;
  const totalSteps = steps.length;
  const progressPercentage = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  // Handle keyboard input for approval workflow
  useInput((input, key) => {
    if (!currentStep || currentStep.status !== 'waiting_approval') return;

    switch (input.toLowerCase()) {
      case 'a':
        setSelectedAction('approve');
        onStepApproved(currentStep.id);
        break;
      case 'r':
        setSelectedAction('reject');
        onStepRejected(currentStep.id, 'Rejected by user');
        break;
      case 'm':
        setSelectedAction('modify');
        // For now, just approve - modification UI would need additional implementation
        onStepApproved(currentStep.id);
        break;
      case 'c':
        if (currentStep.status === 'executing') {
          setSelectedAction('cancel');
          onStepCancelled(currentStep.id);
        }
        break;
      case 'q':
        // Quit/cancel entire workflow
        setWorkflowStatus('cancelled');
        onWorkflowCancelled();
        break;
    }
  });

  // Update workflow status based on step statuses
  useEffect(() => {
    const allCompleted = steps.every(step => step.status === 'completed');
    const anyFailed = steps.some(step => step.status === 'failed');
    const anyCancelled = steps.some(step => step.status === 'cancelled');

    if (allCompleted && workflowStatus === 'executing') {
      setWorkflowStatus('completed');
      onWorkflowCompleted();
    } else if (anyFailed || anyCancelled) {
      setWorkflowStatus('failed');
    } else if (steps.some(step => step.status === 'executing' || step.status === 'waiting_approval')) {
      setWorkflowStatus('executing');
    }
  }, [steps, workflowStatus, onWorkflowCompleted]);

  // Move to next step when current step is completed
  useEffect(() => {
    if (currentStep?.status === 'completed' && currentStepIndex < steps.length - 1) {
      setCurrentStepIndex(prev => prev + 1);
    }
  }, [currentStep?.status, currentStepIndex, steps.length]);

  const getWorkflowStatusIcon = () => {
    switch (workflowStatus) {
      case 'planning':
        return '📋';
      case 'executing':
        return '🔄';
      case 'completed':
        return '✅';
      case 'cancelled':
        return '🚫';
      case 'failed':
        return '❌';
      default:
        return '📋';
    }
  };

  const getWorkflowStatusColor = () => {
    switch (workflowStatus) {
      case 'planning':
        return 'blue';
      case 'executing':
        return 'yellow';
      case 'completed':
        return 'green';
      case 'cancelled':
        return 'gray';
      case 'failed':
        return 'red';
      default:
        return 'blue';
    }
  };

  return (
    <Box flexDirection="column">
      {/* Workflow Header */}
      <Box flexDirection="column" marginBottom={2}>
        <Box flexDirection="row">
          <Text color={getWorkflowStatusColor()} bold>
            {getWorkflowStatusIcon()} Task: 
          </Text>
          <Text color="white"> {taskDescription}</Text>
        </Box>
        
        <Box flexDirection="row" marginTop={1}>
          <Text color="cyan" bold>Progress: </Text>
          <Text color="white">{completedSteps}/{totalSteps} steps completed ({progressPercentage}%)</Text>
        </Box>
        
        <Box marginTop={1}>
          <Text color="gray">
            {'█'.repeat(Math.floor(progressPercentage / 5))}
            {'░'.repeat(20 - Math.floor(progressPercentage / 5))}
          </Text>
          <Text color="gray"> {progressPercentage}%</Text>
        </Box>
      </Box>

      {/* Workflow Status Messages */}
      {workflowStatus === 'planning' && (
        <Box flexDirection="column" marginBottom={2} paddingX={2} borderStyle="single" borderColor="blue">
          <Text color="blue" bold>📋 Planning Execution</Text>
          <Text color="gray">Review the execution plan below. Each step will require your approval before execution.</Text>
        </Box>
      )}

      {workflowStatus === 'executing' && currentStep && (
        <Box flexDirection="column" marginBottom={2} paddingX={2} borderStyle="single" borderColor="yellow">
          <Text color="yellow" bold>🔄 Executing Step {currentStepIndex + 1}</Text>
          <Text color="gray">Currently executing: {currentStep.title}</Text>
          {currentStep.status === 'waiting_approval' && (
            <Text color="yellow">Waiting for your approval to proceed...</Text>
          )}
        </Box>
      )}

      {workflowStatus === 'completed' && (
        <Box flexDirection="column" marginBottom={2} paddingX={2} borderStyle="single" borderColor="green">
          <Text color="green" bold>✅ Workflow Completed Successfully</Text>
          <Text color="gray">All {totalSteps} steps have been executed successfully.</Text>
        </Box>
      )}

      {workflowStatus === 'failed' && (
        <Box flexDirection="column" marginBottom={2} paddingX={2} borderStyle="single" borderColor="red">
          <Text color="red" bold>❌ Workflow Failed</Text>
          <Text color="gray">One or more steps failed to execute. Check the details below.</Text>
        </Box>
      )}

      {workflowStatus === 'cancelled' && (
        <Box flexDirection="column" marginBottom={2} paddingX={2} borderStyle="single" borderColor="gray">
          <Text color="gray" bold>🚫 Workflow Cancelled</Text>
          <Text color="gray">The workflow was cancelled by user request.</Text>
        </Box>
      )}

      {/* Tool Execution Display */}
      <ToolExecutionDisplay
        steps={steps}
        currentStepId={currentStep?.id}
        onApprove={onStepApproved}
        onReject={onStepRejected}
        onModify={onStepModified}
        onCancel={onStepCancelled}
      />

      {/* Control Instructions */}
      {workflowStatus === 'executing' && currentStep?.status === 'waiting_approval' && (
        <Box flexDirection="column" marginTop={2} paddingX={2} borderStyle="single" borderColor="cyan">
          <Text color="cyan" bold>⌨️  Controls</Text>
          <Text color="gray">[A] Approve  [R] Reject  [M] Modify  [Q] Quit workflow</Text>
        </Box>
      )}

      {workflowStatus === 'executing' && currentStep?.status === 'executing' && (
        <Box flexDirection="column" marginTop={2} paddingX={2} borderStyle="single" borderColor="cyan">
          <Text color="cyan" bold>⌨️  Controls</Text>
          <Text color="gray">[C] Cancel current step  [Q] Quit workflow</Text>
        </Box>
      )}

      {/* Summary for completed workflow */}
      {workflowStatus === 'completed' && (
        <Box flexDirection="column" marginTop={2}>
          <Text color="green" bold>📊 Execution Summary</Text>
          <Box flexDirection="column" marginLeft={2}>
            <Text color="gray">Total steps: {totalSteps}</Text>
            <Text color="green">Completed: {steps.filter(s => s.status === 'completed').length}</Text>
            <Text color="red">Failed: {steps.filter(s => s.status === 'failed').length}</Text>
            <Text color="gray">Cancelled: {steps.filter(s => s.status === 'cancelled').length}</Text>
            
            {/* Show files created/modified */}
            {steps.some(s => s.filesCreated?.length || s.filesModified?.length) && (
              <Box flexDirection="column" marginTop={1}>
                <Text color="cyan" bold>📁 File Changes:</Text>
                {steps.flatMap(s => s.filesCreated || []).map(file => (
                  <Text key={file} color="green">  + {file}</Text>
                ))}
                {steps.flatMap(s => s.filesModified || []).map(file => (
                  <Text key={file} color="blue">  ~ {file}</Text>
                ))}
              </Box>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default ExecutionWorkflow;
