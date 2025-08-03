// ToolExecutionDisplay.tsx - Claude-like tool execution interface
import React, { useState } from 'react';
import { Box, Text, Newline } from 'ink';
import Spinner from 'ink-spinner';
import FileDiffDisplay from './FileDiffDisplay.js';
import TaskPlanningDisplay from './TaskPlanningDisplay.js';

// Re-export Task type from TaskPlanningDisplay
export interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  subtasks?: Task[];
  estimatedTime?: string;
  dependencies?: string[];
}

export interface ToolExecutionStep {
  id: string;
  stepNumber: number;
  title: string;
  description: string;
  toolName: string;
  parameters: Record<string, any>;
  status: 'pending' | 'waiting_approval' | 'executing' | 'completed' | 'failed' | 'cancelled';
  output?: string;
  error?: string;
  executionTime?: number;
  filesCreated?: string[];
  filesModified?: string[];
  fileDiffs?: Array<{
    path: string;
    operation: 'create' | 'modify' | 'delete';
    oldContent?: string;
    newContent: string;
  }>;
  startTime?: number;
  endTime?: number;
}

export interface ToolExecutionDisplayProps {
  steps: ToolExecutionStep[];
  currentStepId?: string;
  onApprove: (stepId: string) => void;
  onReject: (stepId: string) => void;
  onModify: (stepId: string, newParameters: Record<string, any>) => void;
  onCancel: (stepId: string) => void;
}

const StatusIcon: React.FC<{ status: ToolExecutionStep['status'] }> = ({ status }) => {
  switch (status) {
    case 'pending':
      return <Text color="gray">○</Text>;
    case 'waiting_approval':
      return <Text color="yellow">⚠</Text>;
    case 'executing':
      return <Spinner type="dots" />;
    case 'completed':
      return <Text color="green">●</Text>;
    case 'failed':
      return <Text color="red">●</Text>;
    case 'cancelled':
      return <Text color="gray">●</Text>;
    default:
      return <Text color="gray">○</Text>;
  }
};

const ParameterDisplay: React.FC<{ parameters: Record<string, any> }> = ({ parameters }) => (
  <Box flexDirection="column" marginLeft={2} paddingX={2} borderStyle="single" borderColor="gray">
    <Text color="cyan" bold>Parameters:</Text>
    {Object.entries(parameters).map(([key, value]) => (
      <Box key={key} flexDirection="row">
        <Text color="yellow">{key}:</Text>
        <Text color="white" wrap="wrap"> {JSON.stringify(value, null, 2)}</Text>
      </Box>
    ))}
  </Box>
);

const OutputDisplay: React.FC<{ output: string; error?: string; executionTime?: number }> = ({ 
  output, 
  error, 
  executionTime 
}) => (
  <Box flexDirection="column" marginLeft={2} marginTop={1}>
    {error ? (
      <Box flexDirection="column" paddingX={2} borderStyle="single" borderColor="red">
        <Text color="red" bold>Error:</Text>
        <Text color="red" wrap="wrap">{error}</Text>
      </Box>
    ) : (
      <Box flexDirection="column" paddingX={2} borderStyle="single" borderColor="green">
        <Box flexDirection="row">
          <Text color="green" bold>Output</Text>
          {executionTime && (
            <Text color="gray"> ({executionTime}ms)</Text>
          )}
          <Text color="green" bold>:</Text>
        </Box>
        <Text wrap="wrap">{output}</Text>
      </Box>
    )}
  </Box>
);

const ApprovalPrompt: React.FC<{ 
  step: ToolExecutionStep; 
  onApprove: () => void; 
  onReject: () => void; 
  onModify: () => void;
}> = ({ step, onApprove, onReject, onModify }) => (
  <Box flexDirection="column" marginLeft={2} marginTop={1}>
    <Box paddingX={2} borderStyle="double" borderColor="yellow">
      <Text color="yellow" bold>⚠️  Approval Required</Text>
    </Box>
    <Box flexDirection="column" marginTop={1} paddingX={2} borderStyle="single" borderColor="yellow">
      <Text color="white" bold>Do you want me to execute this tool?</Text>
      <Newline />
      <Text color="cyan" bold>Tool: </Text>
      <Text color="white">{step.toolName}</Text>
      <Newline />
      <ParameterDisplay parameters={step.parameters} />
      <Newline />
      <Box flexDirection="row" gap={2}>
        <Text color="green" bold>[A] Approve</Text>
        <Text color="red" bold>[R] Reject</Text>
        <Text color="blue" bold>[M] Modify</Text>
      </Box>
    </Box>
  </Box>
);

const ProgressIndicator: React.FC<{ 
  step: ToolExecutionStep; 
  onCancel: () => void;
}> = ({ step, onCancel }) => {
  const [dots, setDots] = useState('');
  
  React.useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.');
    }, 500);
    
    return () => clearInterval(interval);
  }, []);

  const elapsed = step.startTime ? Date.now() - step.startTime : 0;
  const elapsedSeconds = Math.floor(elapsed / 1000);

  return (
    <Box flexDirection="column" marginLeft={2} marginTop={1}>
      <Box flexDirection="row" paddingX={2} borderStyle="single" borderColor="blue">
        <Text color="blue" bold>🔄 Executing{dots}</Text>
        <Text color="gray"> ({elapsedSeconds}s)</Text>
      </Box>
      <Box flexDirection="row" marginTop={1}>
        <Text color="gray">[C] Cancel execution</Text>
      </Box>
    </Box>
  );
};

const FileChangesDisplay: React.FC<{
  filesCreated?: string[];
  filesModified?: string[];
  fileDiffs?: Array<{
    path: string;
    operation: 'create' | 'modify' | 'delete';
    oldContent?: string;
    newContent: string;
  }>;
}> = ({ filesCreated, filesModified, fileDiffs }) => {
  if (!filesCreated?.length && !filesModified?.length && !fileDiffs?.length) return null;

  return (
    <Box flexDirection="column" marginLeft={2} marginTop={1}>
      {/* Show file diffs if available */}
      {fileDiffs?.map((diff, index) => (
        <Box key={index} marginTop={1}>
          <FileDiffDisplay
            filePath={diff.path}
            oldContent={diff.oldContent}
            newContent={diff.newContent}
            operation={diff.operation}
          />
        </Box>
      ))}

      {/* Fallback to simple file list if no diffs */}
      {!fileDiffs?.length && (
        <>
          {filesCreated?.length && (
            <Box flexDirection="column">
              <Text color="green" bold>📁 Files Created:</Text>
              {filesCreated.map(file => (
                <Text key={file} color="green">  • {file}</Text>
              ))}
            </Box>
          )}
          {filesModified?.length && (
            <Box flexDirection="column" marginTop={filesCreated?.length ? 1 : 0}>
              <Text color="blue" bold>📝 Files Modified:</Text>
              {filesModified.map(file => (
                <Text key={file} color="blue">  • {file}</Text>
              ))}
            </Box>
          )}
        </>
      )}
    </Box>
  );
};

export const ToolExecutionDisplay: React.FC<ToolExecutionDisplayProps> = ({
  steps,
  currentStepId,
  onApprove,
  onReject,
  onModify,
  onCancel
}) => {
  return (
    <Box flexDirection="column">
      <Text color="cyan" bold>🔧 Tool Execution Plan</Text>
      <Newline />
      
      {steps.map((step) => (
        <Box key={step.id} flexDirection="column" marginBottom={1}>
          {/* Step Header - Claude-like format */}
          <Box flexDirection="row">
            <Text color="white" bold>● Step {step.stepNumber}: </Text>
            <Text color="cyan">{step.title}</Text>
            <Text color="gray"> </Text>
            <StatusIcon status={step.status} />
          </Box>

          {/* Tool Information - More prominent like Claude */}
          <Box flexDirection="column" marginLeft={2} marginTop={1}>
            <Box flexDirection="row">
              <Text color="cyan" bold>  ⎿ {step.toolName}(</Text>
              <Text color="gray">{Object.keys(step.parameters).join(', ')}</Text>
              <Text color="cyan" bold>)</Text>
            </Box>

            {/* Show key parameters inline for common tools */}
            {step.toolName === 'str-replace-editor' && step.parameters.path && (
              <Box marginLeft={4}>
                <Text color="gray">Editing: </Text>
                <Text color="white">{step.parameters.path}</Text>
              </Box>
            )}

            {step.toolName === 'save-file' && step.parameters.path && (
              <Box marginLeft={4}>
                <Text color="gray">Creating: </Text>
                <Text color="white">{step.parameters.path}</Text>
              </Box>
            )}

            {step.toolName === 'launch-process' && step.parameters.command && (
              <Box marginLeft={4}>
                <Text color="gray">Command: </Text>
                <Text color="white">{step.parameters.command}</Text>
              </Box>
            )}
          </Box>
          
          {/* Status-specific displays */}
          {step.status === 'waiting_approval' && (
            <ApprovalPrompt
              step={step}
              onApprove={() => onApprove(step.id)}
              onReject={() => onReject(step.id)}
              onModify={() => onModify(step.id, step.parameters)}
            />
          )}
          
          {step.status === 'executing' && (
            <ProgressIndicator
              step={step}
              onCancel={() => onCancel(step.id)}
            />
          )}
          
          {(step.status === 'completed' || step.status === 'failed') && step.output && (
            <OutputDisplay
              output={step.output}
              error={step.error}
              executionTime={step.executionTime}
            />
          )}
          
          {step.status === 'completed' && (
            <FileChangesDisplay
              filesCreated={step.filesCreated}
              filesModified={step.filesModified}
              fileDiffs={step.fileDiffs}
            />
          )}
          
          {step.id !== steps[steps.length - 1].id && (
            <Box marginTop={1}>
              <Text color="gray">{'─'.repeat(60)}</Text>
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
};

export default ToolExecutionDisplay;
