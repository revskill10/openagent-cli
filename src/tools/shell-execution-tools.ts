// shell-execution-tools.ts - Shell execution tools for the unified tool system
import { ToolFunction } from './function-executor.js';
import { shellTools, ShellToolOptions, WorkflowDefinition } from '../shell-execution/shell-tools.js';

// Execute shell command with AI assistance
export const executeShellCommand: ToolFunction = async (args: any) => {
  const { command, options = {} } = args;
  
  if (!command || typeof command !== 'string') {
    return {
      success: false,
      error: 'Command parameter is required and must be a string',
      data: null
    };
  }

  const shellOptions: ShellToolOptions = {
    safetyLevel: options.safetyLevel || 'moderate',
    enableLearning: options.enableLearning !== false,
    enableTemplates: options.enableTemplates !== false,
    enableOptimization: options.enableOptimization !== false,
    confidenceThreshold: options.confidenceThreshold || 0.6,
    dryRun: options.dryRun || false,
    workingDirectory: options.workingDirectory,
    environment: options.environment
  };

  try {
    const result = await shellTools.executeShellCommand(command, shellOptions);
    
    return {
      success: result.success,
      data: {
        output: result.output,
        error: result.error,
        exitCode: result.exitCode,
        executionTime: result.executionTime,
        confidence: result.confidence,
        riskLevel: result.riskLevel,
        suggestions: result.suggestions,
        alternatives: result.alternatives,
        metadata: result.metadata
      },
      error: result.success ? undefined : result.error
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      data: null
    };
  }
};

// Generate shell command from natural language
export const generateShellCommand: ToolFunction = async (args: any) => {
  const { description, options = {} } = args;
  
  if (!description || typeof description !== 'string') {
    return {
      success: false,
      error: 'Description parameter is required and must be a string',
      data: null
    };
  }

  const shellOptions: ShellToolOptions = {
    safetyLevel: options.safetyLevel || 'moderate',
    workingDirectory: options.workingDirectory,
    environment: options.environment
  };

  try {
    const result = await shellTools.generateShellCommand(description, shellOptions);
    
    return {
      success: result.success,
      data: {
        commands: result.commands,
        message: result.message,
        suggestions: result.suggestions
      },
      error: result.success ? undefined : result.message
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      data: null
    };
  }
};

// Execute a workflow with multiple shell commands
export const executeWorkflow: ToolFunction = async (args: any) => {
  const { workflow, options = {} } = args;
  
  if (!workflow || typeof workflow !== 'object') {
    return {
      success: false,
      error: 'Workflow parameter is required and must be an object',
      data: null
    };
  }

  if (!workflow.name || !workflow.steps || !Array.isArray(workflow.steps)) {
    return {
      success: false,
      error: 'Workflow must have name and steps array',
      data: null
    };
  }

  const workflowDef: WorkflowDefinition = {
    name: workflow.name,
    description: workflow.description || '',
    steps: workflow.steps,
    variables: workflow.variables || {}
  };

  const shellOptions: ShellToolOptions = {
    safetyLevel: options.safetyLevel || 'moderate',
    workingDirectory: options.workingDirectory,
    environment: options.environment
  };

  try {
    const result = await shellTools.executeWorkflow(workflowDef, shellOptions);
    
    return {
      success: result.success,
      data: {
        status: result.status,
        workflowId: result.workflowId,
        results: result.results,
        summary: result.summary,
        message: result.message
      },
      error: result.success ? undefined : result.message
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      data: null
    };
  }
};

// Get shell command suggestions
export const getShellSuggestions: ToolFunction = async (args: any) => {
  const { context, options = {} } = args;
  
  if (!context || typeof context !== 'string') {
    return {
      success: false,
      error: 'Context parameter is required and must be a string',
      data: null
    };
  }

  const shellOptions: ShellToolOptions = {
    safetyLevel: options.safetyLevel || 'moderate',
    workingDirectory: options.workingDirectory,
    environment: options.environment
  };

  try {
    const result = await shellTools.getShellSuggestions(context, shellOptions);
    
    return {
      success: result.success,
      data: {
        suggestions: result.suggestions,
        context: result.context,
        message: result.message
      },
      error: result.success ? undefined : result.message
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      data: null
    };
  }
};

// Analyze shell command for safety and correctness
export const analyzeShellCommand: ToolFunction = async (args: any) => {
  const { command, options = {} } = args;
  
  if (!command || typeof command !== 'string') {
    return {
      success: false,
      error: 'Command parameter is required and must be a string',
      data: null
    };
  }

  const shellOptions: ShellToolOptions = {
    safetyLevel: options.safetyLevel || 'moderate',
    workingDirectory: options.workingDirectory,
    environment: options.environment
  };

  try {
    const result = await shellTools.analyzeShellCommand(command, shellOptions);
    
    return {
      success: result.success,
      data: {
        analysis: result.analysis,
        recommendations: result.recommendations,
        message: result.message
      },
      error: result.success ? undefined : result.message
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      data: null
    };
  }
};

// Get shell system statistics
export const getShellSystemStats: ToolFunction = async (args: any) => {
  try {
    const result = await shellTools.getShellSystemStats();
    
    return {
      success: result.success,
      data: {
        statistics: result.statistics,
        message: result.message
      },
      error: result.success ? undefined : result.message
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      data: null
    };
  }
};

// Export shell execution tools for the unified tool system
export const shellExecutionTools = [
  {
    name: 'execute_shell_command',
    description: 'Execute a shell command with AI assistance, safety checks, and cross-platform compatibility. Includes command translation, verification, and learning capabilities.',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute'
        },
        options: {
          type: 'object',
          properties: {
            safetyLevel: {
              type: 'string',
              enum: ['strict', 'moderate', 'permissive'],
              description: 'Safety level for command execution',
              default: 'moderate'
            },
            enableLearning: {
              type: 'boolean',
              description: 'Enable learning from command execution',
              default: true
            },
            enableTemplates: {
              type: 'boolean',
              description: 'Enable template-based command generation',
              default: true
            },
            enableOptimization: {
              type: 'boolean',
              description: 'Enable bytecode optimization',
              default: true
            },
            confidenceThreshold: {
              type: 'number',
              description: 'Minimum confidence threshold for execution',
              default: 0.6,
              minimum: 0,
              maximum: 1
            },
            dryRun: {
              type: 'boolean',
              description: 'Perform dry run without actual execution',
              default: false
            },
            workingDirectory: {
              type: 'string',
              description: 'Working directory for command execution'
            },
            environment: {
              type: 'object',
              description: 'Environment variables for command execution'
            }
          }
        }
      },
      required: ['command']
    },
    fn: executeShellCommand
  },
  {
    name: 'generate_shell_command',
    description: 'Generate shell commands from natural language descriptions using AI templates and patterns.',
    inputSchema: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'Natural language description of what you want to accomplish'
        },
        options: {
          type: 'object',
          properties: {
            safetyLevel: {
              type: 'string',
              enum: ['strict', 'moderate', 'permissive'],
              description: 'Safety level for generated commands',
              default: 'moderate'
            },
            workingDirectory: {
              type: 'string',
              description: 'Working directory context'
            },
            environment: {
              type: 'object',
              description: 'Environment variables context'
            }
          }
        }
      },
      required: ['description']
    },
    fn: generateShellCommand
  },
  {
    name: 'execute_workflow',
    description: 'Execute a complex workflow with multiple shell commands, dependencies, and conditional logic.',
    inputSchema: {
      type: 'object',
      properties: {
        workflow: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name of the workflow'
            },
            description: {
              type: 'string',
              description: 'Description of the workflow'
            },
            steps: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: {
                    type: 'string',
                    description: 'Unique step identifier'
                  },
                  name: {
                    type: 'string',
                    description: 'Step name'
                  },
                  command: {
                    type: 'string',
                    description: 'Shell command to execute'
                  },
                  dependencies: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Step IDs this step depends on'
                  },
                  variables: {
                    type: 'object',
                    description: 'Variables for this step'
                  },
                  condition: {
                    type: 'string',
                    description: 'Condition for step execution'
                  },
                  onSuccess: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Actions to take on success'
                  },
                  onFailure: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Actions to take on failure'
                  }
                },
                required: ['id', 'name', 'command']
              },
              description: 'Workflow steps'
            },
            variables: {
              type: 'object',
              description: 'Global workflow variables'
            }
          },
          required: ['name', 'steps']
        },
        options: {
          type: 'object',
          properties: {
            safetyLevel: {
              type: 'string',
              enum: ['strict', 'moderate', 'permissive'],
              description: 'Safety level for workflow execution',
              default: 'moderate'
            },
            workingDirectory: {
              type: 'string',
              description: 'Working directory for workflow execution'
            },
            environment: {
              type: 'object',
              description: 'Environment variables for workflow execution'
            }
          }
        }
      },
      required: ['workflow']
    },
    fn: executeWorkflow
  },
  {
    name: 'get_shell_suggestions',
    description: 'Get shell command suggestions based on context, previous executions, and learned patterns.',
    inputSchema: {
      type: 'object',
      properties: {
        context: {
          type: 'string',
          description: 'Context or description of what you want to accomplish'
        },
        options: {
          type: 'object',
          properties: {
            safetyLevel: {
              type: 'string',
              enum: ['strict', 'moderate', 'permissive'],
              description: 'Safety level for suggestions',
              default: 'moderate'
            },
            workingDirectory: {
              type: 'string',
              description: 'Working directory context'
            },
            environment: {
              type: 'object',
              description: 'Environment variables context'
            }
          }
        }
      },
      required: ['context']
    },
    fn: getShellSuggestions
  },
  {
    name: 'analyze_shell_command',
    description: 'Analyze a shell command for safety, correctness, and potential issues before execution.',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to analyze'
        },
        options: {
          type: 'object',
          properties: {
            safetyLevel: {
              type: 'string',
              enum: ['strict', 'moderate', 'permissive'],
              description: 'Safety level for analysis',
              default: 'moderate'
            },
            workingDirectory: {
              type: 'string',
              description: 'Working directory context'
            },
            environment: {
              type: 'object',
              description: 'Environment variables context'
            }
          }
        }
      },
      required: ['command']
    },
    fn: analyzeShellCommand
  },
  {
    name: 'get_shell_system_stats',
    description: 'Get comprehensive statistics about the shell execution system including performance metrics, learning data, and memory usage.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    },
    fn: getShellSystemStats
  }
];
