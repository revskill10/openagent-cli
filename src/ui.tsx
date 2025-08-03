#!/usr/bin/env node
import React, { useEffect, useState } from "react";
import { render, Text, Box, Static, Newline } from "ink";
import Spinner from "ink-spinner";
import TextInput from "ink-text-input";
import { HierarchicalAgentSystem } from "./hierarchical-agent-system.js";
import { modelManager } from "./simple-models.js";
import { getConfig } from "./simple-config.js";
import { systemEventEmitter, SystemEvent, TaskStatus, AgentStatus, ToolExecution } from "./system-events.js";
import { streamingBlockExecutor } from "./streaming-block-executor.js";
import { durableBlockExecutor, createAIExecutionPrompt } from "./durable-block-executor.js";
import { ReactUIInputHandler, InteractivePrompt, ToolApproval } from "./interactive-ui-handler.js";
import { PromptDefinition } from "./simple-tools.js";
import { integratedStreamingPipeline } from "./integrated-streaming-pipeline.js";
import { unifiedToolRegistry } from "./tools/unified-tool-registry.js";
import { SystemPromptBuilder } from "./tools/system-prompt-builder.js";
import WorkflowManager, { ExecutionResult, ToolExecutionResult } from "./components/WorkflowManager.js";
import { conversationPersistence, ConversationLog } from "./conversation-persistence.js";
import SessionPanel from "./ui/panels/session-panel.js";
import { graphRAGBackgroundService } from "./graphrag-background-service.js";
// import TaskPlanner, { createTaskPlanFromAIResponse, updateStepStatus } from "./ui/components/task-planner.js";

// Task Plan types
interface TaskStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startTime?: Date;
  endTime?: Date;
  result?: string;
  error?: string;
  toolName?: string;
  substeps?: TaskStep[];
}

interface TaskPlan {
  id: string;
  title: string;
  description: string;
  steps: TaskStep[];
  status: 'planning' | 'executing' | 'completed' | 'failed';
  startTime: Date;
  endTime?: Date;
}

// Check if raw mode is supported before rendering
const isRawModeSupported = process.stdin.isTTY && 
  process.stdin.setRawMode && 
  typeof process.stdin.setRawMode === 'function';

interface Log {
  agentId: string;
  text: string;
  type: "question" | "response";
}

interface BackgroundJob {
  id: string;
  status: string;
  progress: number;
  taskName?: string;
  startTime?: number;
}

const UI: React.FC = () => {
  const [logs, setLogs] = useState<Log[]>([]);
  const [question, setQuestion] = useState("");
  const [isWaiting, setIsWaiting] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [agentSystem, setAgentSystem] = useState<HierarchicalAgentSystem | null>(null);
  const [systemEvents, setSystemEvents] = useState<SystemEvent[]>([]);
  const [activeTasks, setActiveTasks] = useState<TaskStatus[]>([]);
  const [activeTools, setActiveTools] = useState<ToolExecution[]>([]);
  const [streamingContent, setStreamingContent] = useState<string>("");
  const [currentAgent, setCurrentAgent] = useState<string>("");
  const [currentPrompt, setCurrentPrompt] = useState<PromptDefinition | null>(null);
  const [currentApproval, setCurrentApproval] = useState<any>(null);
  const [uiInputHandler] = useState(() => new ReactUIInputHandler());
  const [preservedAIResponse, setPreservedAIResponse] = useState<string>("");
  const [backgroundJobs, setBackgroundJobs] = useState<BackgroundJob[]>([]);
  const [showWorkflow, setShowWorkflow] = useState<boolean>(false);
  const [currentAIResponse, setCurrentAIResponse] = useState<string>("");
  const [workflowMode, setWorkflowMode] = useState<'traditional' | 'claude_like'>('claude_like');
  const [showSessionPanel, setShowSessionPanel] = useState<boolean>(false);
  const [toolStartTimes, setToolStartTimes] = useState<Map<string, number>>(new Map());
  // const [currentTaskPlan, setCurrentTaskPlan] = useState<TaskPlan | null>(null);
  // const [showTaskPlanner, setShowTaskPlanner] = useState<boolean>(false);

  useEffect(() => {
    // Initialize the system
    initializeSystem();

    // Initialize conversation persistence and try to load last session
    const initializePersistence = async () => {
      try {
        const lastSession = conversationPersistence.getLastSession();
        if (lastSession && lastSession.logs.length > 0) {
          // Convert persisted logs to UI log format
          const uiLogs = lastSession.logs.map(log => ({
            agentId: log.agentId,
            text: log.text,
            type: log.type
          }));
          setLogs(uiLogs);

          // Resume the session
          conversationPersistence.resumeSession(lastSession.id);
          console.log(`📂 Restored ${lastSession.logs.length} messages from previous session`);
        } else {
          // Start a new session
          conversationPersistence.startNewSession();
        }

        // Clean up old sessions (keep last 30 days)
        conversationPersistence.cleanupOldSessions(30);

        // Start GraphRAG background service
        graphRAGBackgroundService.start();
        console.log('🔄 GraphRAG background service started for conversation indexing');

      } catch (error) {
        console.warn('Failed to initialize conversation persistence:', error);
        conversationPersistence.startNewSession();
      }
    };

    initializePersistence();

    // Set up background job monitoring (reduced frequency to prevent lag)
    const jobMonitorInterval = setInterval(() => {
      const jobStatus = durableBlockExecutor.getBackgroundJobsStatus();
      setBackgroundJobs(jobStatus.map(job => ({
        id: job.id,
        status: job.status,
        progress: job.progress,
        taskName: job.id.replace(/^exec_\d+_/, ''),
        startTime: Date.now() - 1000 // Approximate - will be updated by tool events
      })));
    }, 3000); // Reduced from 1000ms to 3000ms to prevent lag

    // Set up periodic cleanup for stuck tools/tasks
    const cleanupInterval = setInterval(() => {
      cleanupStuckTools();
    }, 10000); // Clean up every 10 seconds

    // Set up system event listener
    const handleSystemEvent = (event: SystemEvent) => {
      setSystemEvents(prev => [event, ...prev.slice(0, 19)]); // Keep last 20 events

      // Update status displays
      setActiveTasks(systemEventEmitter.getActiveTasks());
      setActiveTools(systemEventEmitter.getActiveToolExecutions());
    };

    systemEventEmitter.on('systemEvent', handleSystemEvent);

    return () => {
      systemEventEmitter.off('systemEvent', handleSystemEvent);
      clearInterval(jobMonitorInterval);
      clearInterval(cleanupInterval);
      // Save session on cleanup
      conversationPersistence.saveCurrentSession();
      // Stop GraphRAG background service
      graphRAGBackgroundService.stop();
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (str: string, key: any) => {
      if (key.ctrl && key.name === 's') {
        // Ctrl+S to toggle session panel
        setShowSessionPanel(prev => !prev);
      }
      // else if (key.ctrl && key.name === 't') {
      //   // Ctrl+T to toggle task planner
      //   setShowTaskPlanner(prev => !prev);
      // }
    };

    if (isRawModeSupported) {
      process.stdin.on('keypress', handleKeyPress);
      return () => {
        process.stdin.off('keypress', handleKeyPress);
      };
    }
  }, []);

  // Helper function to add logs and persist them
  const addLog = (log: Log) => {
    setLogs((prev) => [...prev, log]);

    // Persist to conversation system
    conversationPersistence.addLog({
      agentId: log.agentId,
      text: log.text,
      type: log.type,
      metadata: {
        // Add any additional metadata if available
      }
    });
  };

  // Helper function to clean up stuck tools
  const cleanupStuckTools = () => {
    const currentTime = Date.now();
    const stuckThreshold = 60000; // 60 seconds

    setActiveTools(prev => prev.filter(tool => {
      const isStuck = (currentTime - tool.startTime) > stuckThreshold;
      if (isStuck) {
        console.log(`🧹 Cleaning up stuck tool: ${tool.toolName} (${((currentTime - tool.startTime) / 1000).toFixed(1)}s)`);
      }
      return !isStuck;
    }));

    setActiveTasks(prev => prev.filter(task => {
      const isStuck = (currentTime - task.startTime) > stuckThreshold;
      if (isStuck) {
        console.log(`🧹 Cleaning up stuck task: ${task.description.substring(0, 50)}...`);
      }
      return !isStuck;
    }));
  };

  // Tool execution handler for the workflow
  const handleToolExecution = async (toolName: string, parameters: Record<string, any>): Promise<ToolExecutionResult> => {
    const startTime = Date.now();

    try {
      const result = await unifiedToolRegistry.executeTool({
        name: toolName,
        arguments: parameters
      });

      const executionTime = Date.now() - startTime;

      return {
        success: result.success,
        output: result.success ? JSON.stringify(result.result, null, 2) : 'Tool execution failed',
        error: result.success ? undefined : result.error,
        executionTime,
        filesCreated: extractFilesCreated(result.result),
        filesModified: extractFilesModified(result.result)
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - startTime
      };
    }
  };

  // Helper functions to extract file information from tool results
  const extractFilesCreated = (result: any): string[] => {
    if (typeof result === 'object' && result?.filesCreated) {
      return Array.isArray(result.filesCreated) ? result.filesCreated : [result.filesCreated];
    }
    return [];
  };

  const extractFilesModified = (result: any): string[] => {
    if (typeof result === 'object' && result?.filesModified) {
      return Array.isArray(result.filesModified) ? result.filesModified : [result.filesModified];
    }
    return [];
  };

  // Workflow completion handlers
  const handleWorkflowComplete = (results: ExecutionResult[]) => {
    setShowWorkflow(false);
    setIsWaiting(false);

    // Add results to logs
    const summaryLog: Log = {
      agentId: "workflow",
      text: `✅ Workflow completed successfully. Executed ${results.length} steps.`,
      type: "response",
    };
    setLogs((prev) => [...prev, summaryLog]);

    // Add individual step results
    results.forEach((result, index) => {
      const stepLog: Log = {
        agentId: "workflow",
        text: `Step ${index + 1}: ${result.toolName} - ${result.success ? '✅ Success' : '❌ Failed'}${result.output ? `\n${result.output}` : ''}`,
        type: "response",
      };
      setLogs((prev) => [...prev, stepLog]);
    });
  };

  const handleWorkflowCancelled = () => {
    setShowWorkflow(false);
    setIsWaiting(false);

    const cancelLog: Log = {
      agentId: "workflow",
      text: "🚫 Workflow cancelled by user",
      type: "response",
    };
    setLogs((prev) => [...prev, cancelLog]);
  };

  const initializeSystem = async () => {
    try {
      const config = getConfig();
      
      // Initialize model manager
      await modelManager.initialize(config);
      
      // Create hierarchical agent system with config values (no hardcoding)
      const system = new HierarchicalAgentSystem(config.concurrency);
      await system.initialize(config);
      
      setAgentSystem(system);
      setInitialized(true);
      console.log("🚀 Hierarchical agent system initialized successfully");
    } catch (error) {
      console.error("❌ System initialization failed:", error);
      process.exit(1);
    }
  };

  const handleSubmit = async (value: string) => {
    if (!value.trim() || !initialized || isWaiting) return;
    
    setIsWaiting(true);
    setQuestion("");
    
    // Add user question to logs
    const userLog: Log = {
      agentId: "user",
      text: value,
      type: "question",
    };
    addLog(userLog);
    
    try {
      setCurrentAgent("streaming-executor");
      setStreamingContent("");
      setPreservedAIResponse("");
      
      // Check if the input looks like a structured workflow (contains block syntax)
      const isStructuredWorkflow = /\[(SEQUENTIAL|PARALLEL|IF|WHILE|ASSIGN|PROMPT|TOOL_REQUEST)\]/.test(value);
      const hasToolRequests = value.includes('[TOOL_REQUEST]');

      if (hasToolRequests && workflowMode === 'claude_like') {
        // Use the new Claude-like workflow interface
        setCurrentAIResponse(value);
        setShowWorkflow(true);
        setIsWaiting(false);
        return;
      }

      if (isStructuredWorkflow) {
        // Use durable block executor for structured workflows
        const executionId = `ui_exec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        
        for await (const result of durableBlockExecutor.executeDurable(value, {
          executionId,
          interactive: false,  // Disable interactive mode to test basic execution
          inputHandler: undefined,  // Disable input handler to avoid approval prompts
          autoCleanup: true
        })) {
          if (result.promptNeeded) {
            setCurrentPrompt(result.promptNeeded);
            setStreamingContent("");

            const promptLog: Log = {
              agentId: "system",
              text: `📝 Prompt: ${result.promptNeeded.message}`,
              type: "response",
            };
            setLogs((prev) => [...prev, promptLog]);

          } else if (result.validationError) {
            // Handle validation error with user correction prompt
            const correctionPrompt: PromptDefinition = {
              id: 'correction_prompt',
              type: 'text',
              message: result.validationError.correctionPrompt,
              variable: 'correction'
            };
            setCurrentPrompt(correctionPrompt);
            setStreamingContent("");

            const validationErrorLog: Log = {
              agentId: "system",
              text: `🚨 Tool validation error: ${result.validationError.error}`,
              type: "response",
            };
            setLogs((prev) => [...prev, validationErrorLog]);

          } else if (result.userResponse) {
            // User provided a response to a prompt
            setCurrentPrompt(null);

            const responseLog: Log = {
              agentId: "user",
              text: `📝 Response: ${result.userResponse}`,
              type: "response",
            };
            setLogs((prev) => [...prev, responseLog]);
            
          } else if (result.partial) {
            setStreamingContent(prev => prev + String(result.partial));
          } else if (result.result && result.done) {
            // Format tool result for better display
            const resultText = typeof result.result === 'object'
              ? JSON.stringify(result.result, null, 2)
              : String(result.result);

            const resultLog: Log = {
              agentId: "durable-executor",
              text: `🔧 Tool Result:\n${resultText}`,
              type: "response",
            };
            setLogs((prev) => [...prev, resultLog]);
            
            // Add execution progress info
            if (result.executionState) {
              const progressLog: Log = {
                agentId: "system",
                text: `📊 Progress: ${result.executionState.completedSteps.length} steps completed (${result.executionState.status})`,
                type: "response",
              };
              setLogs((prev) => [...prev, progressLog]);
            }
          } else if (result.error) {
            const errorLog: Log = {
              agentId: "system",
              text: `❌ ${result.error}`,
              type: "response",
            };
            setLogs((prev) => [...prev, errorLog]);
          }
        }
      } else if (agentSystem) {
        // Use AI model to generate block syntax, then stream parse and execute
        const config = getConfig();
        setCurrentAgent(config.agentHierarchy.root.id);
        
        // Get agent and tools for building system prompt
        const agent = agentSystem.getAgent(config.agentHierarchy.root.id);
        if (!agent) {
          throw new Error(`Agent ${config.agentHierarchy.root.id} not found`);
        }
        
        const provider = config.providers.find(p => p.name === agent.provider);
        if (!provider) {
          throw new Error(`Provider ${agent.provider} not found`);
        }
        
        // Get all available tools
        const tools = [
          ...unifiedToolRegistry.getToolsByType('local-mcp'),
          ...unifiedToolRegistry.getToolsByType('remote-mcp'),
          ...unifiedToolRegistry.getToolsByType('function'),
        ];
        
        // Build system prompt with detailed block instructions
        const toolDescriptions = SystemPromptBuilder.extractToolDescriptions(tools);
        const baseSystemPrompt = SystemPromptBuilder.buildSystemPrompt(agent.system, toolDescriptions);
        
        // Create enhanced prompt with block syntax instructions
        const systemPrompt = createAIExecutionPrompt(baseSystemPrompt, value);
        
        // Create real streaming AI response generator
        async function* getAIStreamingResponse(): AsyncGenerator<string, void, unknown> {
          let accumulatedContent = '';
          
          // Call model with enhanced prompt that includes block instructions
          if (!provider || !agent) {
            throw new Error('Provider or agent not found');
          }
          
          const modelResponse = await modelManager.callModel(
            provider.name,
            provider.type,
            agent.model || provider.defaultModel,
            systemPrompt,
            "" // Empty user message since we've embedded it in system prompt
          );
          
          const fullResponse = modelResponse.content.trim();
          
          // Simulate streaming by yielding incremental chunks of the response
          const chunkSize = 50; // Characters per chunk
          for (let i = 0; i < fullResponse.length; i += chunkSize) {
            const chunk = fullResponse.slice(i, i + chunkSize); // Incremental chunk
            accumulatedContent += chunk;
            
            // Update UI with accumulated content
            setStreamingContent(accumulatedContent);
            
            yield chunk; // Yield only the new chunk
            
            // Small delay to simulate realistic streaming
            await new Promise(resolve => setTimeout(resolve, 20));
          }
        }
        
        // Use integrated streaming pipeline for concurrent parsing and execution
        const startTime = Date.now();
        let executionResults: string[] = [];

        // Add initial AI response log
        const aiStartLog: Log = {
          agentId: "ai-model",
          text: "🤖 AI is generating response...",
          type: "response",
        };
        addLog(aiStartLog);

        // Create initial task plan
        // const initialPlan: TaskPlan = {
        //   id: `plan-${Date.now()}`,
        //   title: 'AI Task Execution',
        //   description: `Processing request: ${value.substring(0, 100)}${value.length > 100 ? '...' : ''}`,
        //   steps: [
        //     {
        //       id: 'step-1',
        //       title: 'Analyzing request',
        //       description: 'AI is analyzing the user request and planning the response',
        //       status: 'running',
        //       startTime: new Date()
        //     }
        //   ],
        //   status: 'executing',
        //   startTime: new Date()
        // };
        // setCurrentTaskPlan(initialPlan);
        // setShowTaskPlanner(true);

        try {
          for await (const result of integratedStreamingPipeline.processAIStreamWithConcurrentExecution(
            getAIStreamingResponse(),
            {
              enableRealTimeDisplay: true,
              inputHandler: undefined,  // Disable input handler
              requireToolApproval: true // Enable tool approval prompts like Claude
            }
          )) {
            switch (result.type) {
              case 'ai_content':
                // Preserve AI content as it streams in
                if (result.aiContent) {
                  setPreservedAIResponse(prev => prev + result.aiContent);
                  // Also update streaming content for real-time display
                  setStreamingContent(prev => prev + result.aiContent);
                }
                break;

              case 'block_parsed':
                console.log(`📦 Block parsed: ${result.block?.type}`, result.block);

                // Add UI feedback for block parsing
                const blockLog: Log = {
                  agentId: "parser",
                  text: `📦 Parsed ${result.block?.type} block`,
                  type: "response",
                };
                setLogs((prev) => [...prev, blockLog]);
                break;

              case 'execution_queued':
                // Background execution started
                const queuedLog: Log = {
                  agentId: "background",
                  text: `🔄 Execution queued for background processing`,
                  type: "response",
                };
                setLogs((prev) => [...prev, queuedLog]);

                // Add to background jobs list
                if (result.executionState?.id) {
                  setBackgroundJobs(prev => [...prev, {
                    id: result.executionState!.id,
                    status: 'queued',
                    progress: 0,
                    taskName: result.executionState!.script.substring(0, 30) + '...',
                    startTime: Date.now()
                  }]);
                }
                break;

              case 'tool_approval_needed':
                // Tool needs user approval before execution
                setCurrentApproval({
                  toolName: result.toolName,
                  toolCall: result.toolResult,
                  message: `Do you want to execute ${result.toolName}?`
                });

                const approvalLog: Log = {
                  agentId: "system",
                  text: `⚠️ Tool approval needed: ${result.toolName}`,
                  type: "response",
                };
                addLog(approvalLog);
                break;

              case 'prompt_needed':
                setCurrentPrompt(result.promptDefinition!);
                setStreamingContent("");

                const promptLog: Log = {
                  agentId: "system",
                  text: `📝 Prompt: ${result.promptDefinition!.message}`,
                  type: "response",
                };
                setLogs((prev) => [...prev, promptLog]);
                break;
                
              case 'tool_start':
                console.log(`🔧 Tool started: ${result.toolName}`);

                // Add UI feedback for tool start
                const executorToolStartLog: Log = {
                  agentId: "executor",
                  text: `🔧 Starting ${result.toolName}...`,
                  type: "response",
                };
                setLogs((prev) => [...prev, executorToolStartLog]);
                break;
                
              case 'tool_progress':
                console.log(`⚡ Tool progress: ${result.toolName}`, result.toolResult);

                // Add UI feedback for tool progress with better formatting
                const progressText = String(result.toolResult);
                const toolProgressLog: Log = {
                  agentId: "executor",
                  text: `⚡ ${result.toolName} (progress): ${progressText.length > 300 ? progressText.substring(0, 300) + '...' : progressText}`,
                  type: "response",
                };
                setLogs((prev) => [...prev, toolProgressLog]);
                break;
                
              case 'tool_complete':
                console.log(`✅ Tool completed: ${result.toolName}`, result.toolResult);

                if (result.toolResult) {
                  // Format result for summary
                  const formattedResult = typeof result.toolResult === 'object'
                    ? JSON.stringify(result.toolResult, null, 2)
                    : String(result.toolResult);

                  executionResults.push(`**${result.toolName}**:\n${formattedResult}`);

                  // Add UI feedback for tool completion with full output
                  const toolCompleteLog: Log = {
                    agentId: "executor",
                    text: `✅ ${result.toolName} completed:\n${formattedResult.substring(0, 500)}${formattedResult.length > 500 ? '...' : ''}`,
                    type: "response",
                  };
                  addLog(toolCompleteLog);
                }
                break;
                
              case 'error':
                const errorLog: Log = {
                  agentId: "system",
                  text: `❌ ${result.error}`,
                  type: "response",
                };
                setLogs((prev) => [...prev, errorLog]);
                break;
            }
          }
          
          // Add the preserved AI response as a log (always show the complete AI response)
          if (preservedAIResponse.trim()) {
            const aiResponseLog: Log = {
              agentId: "ai-model",
              text: `📝 Complete AI Response:\n${preservedAIResponse}`,
              type: "response",
            };
            addLog(aiResponseLog);
          }

          // Complete the task plan
          // setCurrentTaskPlan(prev => {
          //   if (!prev) return prev;
          //
          //   return {
          //     ...prev,
          //     status: 'completed',
          //     endTime: new Date(),
          //     steps: prev.steps.map(step => {
          //       if (step.status === 'running') {
          //         return {
          //           ...step,
          //           status: 'completed' as const,
          //           endTime: new Date(),
          //           result: step.title === 'Analyzing request' ? 'Analysis complete' : 'Step completed'
          //         };
          //       }
          //       return step;
          //     })
          //   };
          // });
          
          // Create final result log with comprehensive summary
          const finalResult = executionResults.length > 0
            ? `🎉 Task completed successfully!\n\n📋 Tool Execution Summary:\n${executionResults.join('\n\n')}`
            : "🎉 Task completed successfully!";

          const agentLog: Log = {
            agentId: "system",
            text: finalResult,
            type: "response",
          };
          addLog(agentLog);
          
          // Log execution time
          const executionTime = Date.now() - startTime;
          if (executionTime > 1000) {
            const perfLog: Log = {
              agentId: "system",
              text: `⚡ Task completed in ${executionTime}ms`,
              type: "response",
            };
            setLogs((prev) => [...prev, perfLog]);
          }
          
        } catch (error) {
          throw error; // Re-throw to be handled by outer catch block
        }
      }
      
      // Clear streaming content and current agent after preserving the content
      setStreamingContent("");
      setCurrentAgent("");
      setPreservedAIResponse("");
      
    } catch (error) {
      const errorLog: Log = {
        agentId: "system",
        text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        type: "response",
      };
      addLog(errorLog);
    } finally {
      setIsWaiting(false);
    }
  };

  // Cleanup on exit
  useEffect(() => {
    const cleanup = () => {
      if (agentSystem) {
        agentSystem.cleanup();
      }
    };
    
    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
    
    return () => {
      process.off("SIGINT", cleanup);
      process.off("SIGTERM", cleanup);
    };
  }, [agentSystem]);

  if (!initialized) {
    return (
      <Box>
        <Text>
          <Spinner type="dots" /> Initializing system...
        </Text>
      </Box>
    );
  }

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { hour12: false, timeStyle: 'medium' });
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'task_start': return '🚀';
      case 'task_complete': return '✅';
      case 'task_error': return '❌';
      case 'agent_delegation': return '👥';
      case 'agent_communication': return '💬';
      case 'tool_start': return '🔧';
      case 'tool_complete': return '✅';
      case 'tool_error': return '⚠️';
      default: return 'ℹ️';
    }
  };

  // Simplified UI - removed complex panels to prevent lag

  return (
    <Box flexDirection="column" height="100%">
      {/* Simple header */}
      <Box flexDirection="row" marginBottom={1}>
        <Text color="cyan" bold>💬 OpenAgent</Text>
        {(isWaiting || backgroundJobs.length > 0) && (
          <Box marginLeft={2}>
            <Text>
              <Spinner type="dots" />
              {backgroundJobs.length > 0
                ? `${backgroundJobs.length} background job${backgroundJobs.length > 1 ? 's' : ''} running...`
                : 'Processing...'
              }
            </Text>
          </Box>
        )}
        <Box marginLeft={2}>
          <Text color="gray" dimColor>
            Ctrl+S: Sessions | Ctrl+T: Tasks
          </Text>
        </Box>
      </Box>

      {/* Main content area with optional session panel */}
      <Box flexDirection="row" flexGrow={1}>
        {/* Session panel (left side) */}
        {showSessionPanel && (
          <Box width={40} marginRight={1}>
            <SessionPanel
              width={38}
              height={process.stdout.rows ? process.stdout.rows - 4 : 20}
              visible={showSessionPanel}
            />
          </Box>
        )}

        {/* Task planner (right side) */}
        {/* {showTaskPlanner && (
          <Box width={60} marginLeft={1}>
            <TaskPlanner
              plan={currentTaskPlan}
              width={58}
              height={process.stdout.rows ? process.stdout.rows - 4 : 20}
              visible={showTaskPlanner}
            />
          </Box>
        )} */}

      {/* Main conversation area */}
      <Box flexDirection="column" flexGrow={1}>
        {/* Show workflow interface if active */}
        {showWorkflow && currentAIResponse && (
          <WorkflowManager
            aiResponse={currentAIResponse}
            onExecutionComplete={handleWorkflowComplete}
            onExecutionCancelled={handleWorkflowCancelled}
            onToolExecution={handleToolExecution}
          />
        )}

        {/* Show traditional conversation if not in workflow mode */}
        {!showWorkflow && (
          <Box flexDirection="column" flexGrow={1}>
            {/* Debug info */}
            <Text color="gray" dimColor>
              💬 Conversation ({logs.length} messages) | Workflow: {showWorkflow ? 'ON' : 'OFF'}
            </Text>

            {logs.length === 0 ? (
              <Text color="gray" dimColor>
                No conversation history yet. Start by asking a question below.
              </Text>
            ) : (
              <Static items={logs}>
                {(log, index) => {
                  const getAgentColor = (agentId: string) => {
                    switch (agentId) {
                      case "user": return "green";
                      case "system": return "red";
                      case "ai-model": return "blue";
                      case "tool-executor": return "magenta";
                      case "executor": return "yellow";
                      default: return "cyan";
                    }
                  };

                  const getAgentIcon = (agentId: string) => {
                    switch (agentId) {
                      case "user": return "👤";
                      case "system": return "⚙️";
                      case "ai-model": return "🤖";
                      case "tool-executor": return "🔧";
                      case "executor": return "⚡";
                      default: return "💬";
                    }
                  };

                  return (
                    <Text key={`log-${index}-${log.agentId}-${Date.now()}`}>
                      <Text color={getAgentColor(log.agentId)}>
                        {getAgentIcon(log.agentId)} [{log.agentId}]
                      </Text>{" "}
                      {log.text}
                      <Newline />
                    </Text>
                  );
                }}
              </Static>
            )}
          </Box>
        )}

        {/* Streaming content - only show when not in workflow mode */}
        {!showWorkflow && streamingContent && currentAgent && (
          <Box marginTop={1}>
            <Text color="cyan" dimColor>
              [{currentAgent}] {streamingContent}
              <Text color="yellow">▋</Text>
            </Text>
          </Box>
        )}

        {/* Interactive prompt */}
        {currentPrompt && (
          <InteractivePrompt
            prompt={currentPrompt}
            onResponse={(response) => {
              uiInputHandler.handleResponse(response);
            }}
          />
        )}

        {/* Tool approval prompt */}
        {currentApproval && (
          <ToolApproval
            approval={currentApproval}
            onResponse={(response) => {
              uiInputHandler.handleApprovalResponse(response);
            }}
          />
        )}
      </Box>
      </Box>

      {/* Input area - hide when prompt or approval is active */}
      {!currentPrompt && !currentApproval && (
        <Box borderStyle="single" borderColor="gray" marginTop={1} paddingX={1}>
          <Box flexDirection="column" width="100%">
            <Text color="yellow" bold>🔍 System Activity</Text>
            
            {/* Active Tasks */}
            {activeTasks.length > 0 && (
              <Box flexDirection="column" marginTop={1}>
                <Text color="cyan" bold>📋 Active Tasks ({activeTasks.length}):</Text>
                {activeTasks.slice(0, 3).map(task => (
                  <Text key={task.id} color="cyan">
                    • {task.agentId}: {task.description.substring(0, 60)}...
                  </Text>
                ))}
              </Box>
            )}

            {/* Active Tools */}
            {activeTools.length > 0 && (
              <Box flexDirection="column" marginTop={1}>
                <Text color="magenta" bold>🔧 Running Tools ({activeTools.length}):</Text>
                {activeTools.slice(0, 3).map(tool => (
                  <Text key={tool.id} color="magenta">
                    • {tool.agentId} → {tool.toolName} ({((Date.now() - tool.startTime) / 1000).toFixed(1)}s)
                  </Text>
                ))}
              </Box>
            )}

            {/* Recent Events */}
            {systemEvents.length > 0 && (
              <Box flexDirection="column" marginTop={1}>
                <Text color="gray" bold>📡 Recent Events:</Text>
                {systemEvents.slice(0, 5).map(event => (
                  <Text key={event.id} color="gray">
                    {getEventIcon(event.type)} {formatTime(event.timestamp)} {event.agentId || 'system'}: {
                      event.type === 'agent_delegation' ? `→ ${event.data.toAgent}` :
                      event.type === 'tool_start' ? `${event.data.toolName}` :
                      event.type === 'tool_complete' ? `${event.data.toolName} ✓` :
                      event.type === 'task_start' ? 'started task' :
                      event.type === 'task_complete' ? 'completed task' :
                      event.type
                    }
                  </Text>
                ))}
              </Box>
            )}
          </Box>
        </Box>
      )}

      {/* Input area - hide when prompt or approval is active */}
      {!currentPrompt && !currentApproval && (
        <Box marginTop={1}>
          {isWaiting ? (
            <Text>
              <Spinner type="dots" /> 
              {activeTasks.length > 0 
                ? `${activeTasks.length} agent${activeTasks.length > 1 ? 's' : ''} working...`
                : 'AI is thinking...'
              }
            </Text>
          ) : (
            <Box>
              <Text>Ask a question: </Text>
              <TextInput
                value={question}
                onChange={setQuestion}
                onSubmit={handleSubmit}
                placeholder="Type your question and press Enter..."
                focus={true}
              />
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
};

// Fallback for non-TTY environments
if (!isRawModeSupported) {
  (async () => {
    console.log("⚠️  Raw mode not supported. Running in fallback CLI mode...");
    console.log("🚀 Initializing system...");
    
    try {
      const config = getConfig();
      await modelManager.initialize(config);
      const system = new HierarchicalAgentSystem(config.concurrency);
      await system.initialize(config);
      
      console.log("✅ System initialized successfully!");
      console.log("💡 Example usage: Ask to create a file or read a directory");
      console.log("💡 Type 'exit' to quit");
      
      // Simple CLI interaction
      const { createRequire } = await import('module');
      const require = createRequire(import.meta.url);
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      const askQuestion = () => {
        rl.question('\n💬 Ask a question: ', async (input: string) => {
          if (input.toLowerCase().trim() === 'exit') {
            console.log("👋 Goodbye!");
            await system.cleanup();
            rl.close();
            process.exit(0);
          }
          
          console.log("🤔 Processing...");
          try {
            const result = await system.processMessage(
              config.agentHierarchy.root.id, 
              input,
              undefined,
              (chunk) => process.stdout.write(chunk)
            );
            
            console.log(`\n✅ [${result.agentId}]: ${result.success ? result.result : `Error: ${result.error}`}`);
            if (result.executionTime > 1000) {
              console.log(`⚡ Completed in ${result.executionTime}ms`);
            }
          } catch (error) {
            console.log(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
          }
          askQuestion();
        });
      };
      
      askQuestion();
    } catch (error) {
      console.error("❌ Initialization failed:", error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  })();
} else {
  render(<UI />);
}