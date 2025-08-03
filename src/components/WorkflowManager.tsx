// WorkflowManager.tsx - Manages the conversion from AI responses to execution workflows
import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { ExecutionWorkflow } from './ExecutionWorkflow.js';
import { ToolExecutionStep } from './ToolExecutionDisplay.js';

export interface WorkflowManagerProps {
  aiResponse: string;
  onExecutionComplete: (results: ExecutionResult[]) => void;
  onExecutionCancelled: () => void;
  onToolExecution: (toolName: string, parameters: Record<string, any>) => Promise<ToolExecutionResult>;
}

export interface ExecutionResult {
  stepId: string;
  toolName: string;
  parameters: Record<string, any>;
  output: string;
  success: boolean;
  error?: string;
  executionTime: number;
  filesCreated?: string[];
  filesModified?: string[];
}

export interface ToolExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  executionTime: number;
  filesCreated?: string[];
  filesModified?: string[];
}

export const WorkflowManager: React.FC<WorkflowManagerProps> = ({
  aiResponse,
  onExecutionComplete,
  onExecutionCancelled,
  onToolExecution
}) => {
  const [steps, setSteps] = useState<ToolExecutionStep[]>([]);
  const [taskDescription, setTaskDescription] = useState<string>('');
  const [currentExecutingStep, setCurrentExecutingStep] = useState<string | null>(null);
  const [executionResults, setExecutionResults] = useState<ExecutionResult[]>([]);

  // Parse AI response into execution steps
  useEffect(() => {
    const parsedSteps = parseAIResponseToSteps(aiResponse);
    setSteps(parsedSteps);
    setTaskDescription(extractTaskDescription(aiResponse));
  }, [aiResponse]);

  const parseAIResponseToSteps = (response: string): ToolExecutionStep[] => {
    const steps: ToolExecutionStep[] = [];
    let stepNumber = 1;

    // Extract tool requests from the AI response
    const toolRegex = /\[TOOL_REQUEST\]\s*(\{.*?\})\s*\[END_TOOL_REQUEST\]/gs;
    const matches = Array.from(response.matchAll(toolRegex));

    matches.forEach((match, index) => {
      try {
        const toolData = JSON.parse(match[1]);
        const step: ToolExecutionStep = {
          id: `step_${stepNumber}_${Date.now()}_${index}`,
          stepNumber: stepNumber++,
          title: generateStepTitle(toolData.tool, toolData.params),
          description: generateStepDescription(toolData.tool, toolData.params),
          toolName: toolData.tool,
          parameters: toolData.params || {},
          status: 'pending'
        };
        steps.push(step);
      } catch (error) {
        console.error('Failed to parse tool request:', error);
      }
    });

    // If no tool requests found, create a single step for the entire response
    if (steps.length === 0) {
      steps.push({
        id: `step_1_${Date.now()}`,
        stepNumber: 1,
        title: 'Process Request',
        description: 'Execute the requested task',
        toolName: 'text_response',
        parameters: { content: response },
        status: 'pending'
      });
    }

    // Set first step to waiting for approval
    if (steps.length > 0) {
      steps[0].status = 'waiting_approval';
    }

    return steps;
  };

  const extractTaskDescription = (response: string): string => {
    // Try to extract a meaningful task description from the AI response
    const lines = response.split('\n').filter(line => line.trim());
    const firstLine = lines[0]?.trim();
    
    if (firstLine && !firstLine.includes('[TOOL_REQUEST]')) {
      return firstLine.length > 100 ? firstLine.substring(0, 100) + '...' : firstLine;
    }
    
    return 'Execute AI-generated workflow';
  };

  const generateStepTitle = (toolName: string, params: Record<string, any>): string => {
    switch (toolName) {
      case 'write_file':
        return `Write file: ${params.path || 'unknown'}`;
      case 'read_file':
        return `Read file: ${params.path || 'unknown'}`;
      case 'execute_command':
      case 'shell_command':
        return `Execute: ${params.command || 'unknown command'}`;
      case 'search_web':
        return `Search web: ${params.query || 'unknown query'}`;
      case 'create_directory':
        return `Create directory: ${params.path || 'unknown'}`;
      default:
        return `Execute ${toolName}`;
    }
  };

  const generateStepDescription = (toolName: string, params: Record<string, any>): string => {
    switch (toolName) {
      case 'write_file':
        const contentPreview = params.content ? 
          (params.content.length > 50 ? params.content.substring(0, 50) + '...' : params.content) : 
          'No content';
        return `Create or overwrite file with content: ${contentPreview}`;
      case 'read_file':
        return `Read the contents of the specified file`;
      case 'execute_command':
      case 'shell_command':
        return `Run shell command in the system`;
      case 'search_web':
        return `Search the web for information`;
      case 'create_directory':
        return `Create a new directory at the specified path`;
      default:
        return `Execute the ${toolName} tool with provided parameters`;
    }
  };

  const handleStepApproved = async (stepId: string) => {
    const step = steps.find(s => s.id === stepId);
    if (!step) return;

    // Update step status to executing
    setSteps(prev => prev.map(s => 
      s.id === stepId 
        ? { ...s, status: 'executing', startTime: Date.now() }
        : s
    ));

    setCurrentExecutingStep(stepId);

    try {
      // Execute the tool
      const result = await onToolExecution(step.toolName, step.parameters);
      
      // Update step with results
      setSteps(prev => prev.map(s => 
        s.id === stepId 
          ? { 
              ...s, 
              status: result.success ? 'completed' : 'failed',
              output: result.output,
              error: result.error,
              executionTime: result.executionTime,
              filesCreated: result.filesCreated,
              filesModified: result.filesModified,
              endTime: Date.now()
            }
          : s
      ));

      // Add to execution results
      const executionResult: ExecutionResult = {
        stepId,
        toolName: step.toolName,
        parameters: step.parameters,
        output: result.output,
        success: result.success,
        error: result.error,
        executionTime: result.executionTime,
        filesCreated: result.filesCreated,
        filesModified: result.filesModified
      };
      
      setExecutionResults(prev => [...prev, executionResult]);

      // Move to next step if current step succeeded
      if (result.success) {
        const currentIndex = steps.findIndex(s => s.id === stepId);
        const nextStep = steps[currentIndex + 1];
        
        if (nextStep) {
          setSteps(prev => prev.map(s => 
            s.id === nextStep.id 
              ? { ...s, status: 'waiting_approval' }
              : s
          ));
        }
      }

    } catch (error) {
      // Handle execution error
      setSteps(prev => prev.map(s => 
        s.id === stepId 
          ? { 
              ...s, 
              status: 'failed',
              error: error instanceof Error ? error.message : String(error),
              endTime: Date.now()
            }
          : s
      ));
    } finally {
      setCurrentExecutingStep(null);
    }
  };

  const handleStepRejected = (stepId: string, reason?: string) => {
    setSteps(prev => prev.map(s => 
      s.id === stepId 
        ? { ...s, status: 'cancelled', error: reason || 'Rejected by user' }
        : s
    ));
  };

  const handleStepModified = (stepId: string, newParameters: Record<string, any>) => {
    setSteps(prev => prev.map(s => 
      s.id === stepId 
        ? { ...s, parameters: newParameters, status: 'waiting_approval' }
        : s
    ));
  };

  const handleStepCancelled = (stepId: string) => {
    setSteps(prev => prev.map(s => 
      s.id === stepId 
        ? { ...s, status: 'cancelled' }
        : s
    ));
    setCurrentExecutingStep(null);
  };

  const handleWorkflowCompleted = () => {
    onExecutionComplete(executionResults);
  };

  const handleWorkflowCancelled = () => {
    onExecutionCancelled();
  };

  if (steps.length === 0) {
    return (
      <Box flexDirection="column">
        <Text color="yellow">🔄 Parsing AI response...</Text>
      </Box>
    );
  }

  return (
    <ExecutionWorkflow
      taskDescription={taskDescription}
      steps={steps}
      onStepApproved={handleStepApproved}
      onStepRejected={handleStepRejected}
      onStepModified={handleStepModified}
      onStepCancelled={handleStepCancelled}
      onWorkflowCompleted={handleWorkflowCompleted}
      onWorkflowCancelled={handleWorkflowCancelled}
    />
  );
};

export default WorkflowManager;
