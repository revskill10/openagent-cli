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
import { ReactUIInputHandler, InteractivePrompt } from "./interactive-ui-handler.js";
import { PromptDefinition } from "./simple-tools.js";
import { integratedStreamingPipeline } from "./integrated-streaming-pipeline.js";
import { unifiedToolRegistry } from "./tools/unified-tool-registry.js";
import { SystemPromptBuilder } from "./tools/system-prompt-builder.js";

// Check if raw mode is supported before rendering
const isRawModeSupported = process.stdin.isTTY && 
  process.stdin.setRawMode && 
  typeof process.stdin.setRawMode === 'function';

interface Log {
  agentId: string;
  text: string;
  type: "question" | "response";
}

const UI: React.FC = () => {
  const [logs, setLogs] = useState<Log[]>([]);
  const [question, setQuestion] = useState("");
  const [isWaiting, setIsWaiting] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [agentSystem, setAgentSystem] = useState<HierarchicalAgentSystem | null>(null);
  const [systemEvents, setSystemEvents] = useState<SystemEvent[]>([]);
  const [activeTasks, setActiveTasks] = useState<TaskStatus[]>([]);
  const [agentStatuses, setAgentStatuses] = useState<AgentStatus[]>([]);
  const [activeTools, setActiveTools] = useState<ToolExecution[]>([]);
  const [streamingContent, setStreamingContent] = useState<string>("");
  const [currentAgent, setCurrentAgent] = useState<string>("");
  const [currentPrompt, setCurrentPrompt] = useState<PromptDefinition | null>(null);
  const [uiInputHandler] = useState(() => new ReactUIInputHandler());

  useEffect(() => {
    // Initialize the system
    initializeSystem();
    
    // Set up system event listener
    const handleSystemEvent = (event: SystemEvent) => {
      setSystemEvents(prev => [event, ...prev.slice(0, 19)]); // Keep last 20 events
      
      // Update status displays
      setActiveTasks(systemEventEmitter.getActiveTasks());
      setAgentStatuses(systemEventEmitter.getAgentStatuses());
      setActiveTools(systemEventEmitter.getActiveToolExecutions());
    };
    
    systemEventEmitter.on('systemEvent', handleSystemEvent);
    
    return () => {
      systemEventEmitter.off('systemEvent', handleSystemEvent);
    };
  }, []);

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
    setLogs((prev) => [...prev, userLog]);
    
    try {
      setCurrentAgent("streaming-executor");
      setStreamingContent("");
      
      // Check if the input looks like a structured workflow (contains block syntax)
      const isStructuredWorkflow = /\[(SEQUENTIAL|PARALLEL|IF|WHILE|ASSIGN|PROMPT|TOOL_REQUEST)\]/.test(value);
      
      if (isStructuredWorkflow) {
        // Use durable block executor for structured workflows
        const executionId = `ui_exec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        
        for await (const result of durableBlockExecutor.executeDurable(value, {
          executionId,
          interactive: true,
          inputHandler: uiInputHandler,
          autoCleanup: true
        })) {
          if (result.promptNeeded) {
            setCurrentPrompt(result.promptNeeded);
            setStreamingContent("");
            
            // Wait for user response through the UI handler
            const userResponse = await uiInputHandler.handlePrompt(result.promptNeeded);
            setCurrentPrompt(null);
            
            const promptLog: Log = {
              agentId: "system",
              text: `📝 ${result.promptNeeded.message}: ${userResponse}`,
              type: "response",
            };
            setLogs((prev) => [...prev, promptLog]);
            
          } else if (result.validationError) {
            // Handle validation error with user correction prompt
            setCurrentPrompt(result.validationError.correctionPrompt);
            setStreamingContent("");
            
            const validationErrorLog: Log = {
              agentId: "system",
              text: `🚨 Tool validation error: ${result.validationError.error}`,
              type: "response",
            };
            setLogs((prev) => [...prev, validationErrorLog]);
            
            // Wait for user response through the UI handler
            const userResponse = await uiInputHandler.handlePrompt(result.validationError.correctionPrompt);
            setCurrentPrompt(null);
            
            const correctionLog: Log = {
              agentId: "user",
              text: `🔧 Corrected parameters: ${userResponse}`,
              type: "response",
            };
            setLogs((prev) => [...prev, correctionLog]);
            
          } else if (result.partial) {
            setStreamingContent(prev => prev + String(result.partial));
          } else if (result.result && result.done) {
            const resultLog: Log = {
              agentId: "durable-executor",
              text: String(result.result),
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
        
        try {
          for await (const result of integratedStreamingPipeline.processAIStreamWithConcurrentExecution(
            getAIStreamingResponse(),
            {
              enableRealTimeDisplay: true,
              inputHandler: uiInputHandler
            }
          )) {
            switch (result.type) {
              case 'ai_content':
                // AI content is already being streamed via streamingCallback
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
                
              case 'prompt_needed':
                setCurrentPrompt(result.promptDefinition!);
                setStreamingContent("");
                
                const userResponse = await uiInputHandler.handlePrompt(result.promptDefinition!);
                setCurrentPrompt(null);
                
                const promptLog: Log = {
                  agentId: "system",
                  text: `📝 ${result.promptDefinition!.message}: ${userResponse}`,
                  type: "response",
                };
                setLogs((prev) => [...prev, promptLog]);
                break;
                
              case 'tool_start':
                console.log(`🔧 Tool started: ${result.toolName}`);
                
                // Add UI feedback for tool start
                const toolStartLog: Log = {
                  agentId: "executor",
                  text: `🔧 Starting ${result.toolName}...`,
                  type: "response",
                };
                setLogs((prev) => [...prev, toolStartLog]);
                break;
                
              case 'tool_progress':
                console.log(`⚡ Tool progress: ${result.toolName}`, result.toolResult);
                
                // Add UI feedback for tool progress
                const toolProgressLog: Log = {
                  agentId: "executor", 
                  text: `⚡ ${result.toolName}: ${String(result.toolResult).substring(0, 100)}...`,
                  type: "response",
                };
                setLogs((prev) => [...prev, toolProgressLog]);
                break;
                
              case 'tool_complete':
                console.log(`✅ Tool completed: ${result.toolName}`, result.toolResult);
                
                if (result.toolResult) {
                  executionResults.push(`**${result.toolName}**: ${result.toolResult}`);
                  
                  // Add UI feedback for tool completion
                  const toolCompleteLog: Log = {
                    agentId: "executor",
                    text: `✅ ${result.toolName} completed: ${String(result.toolResult).substring(0, 200)}`,
                    type: "response",
                  };
                  setLogs((prev) => [...prev, toolCompleteLog]);
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
          
          // Add the final streamed AI response as a log before clearing
          if (streamingContent.trim()) {
            const aiResponseLog: Log = {
              agentId: "ai-model",
              text: `📝 Raw AI Response:\n${streamingContent}`,
              type: "response",
            };
            setLogs((prev) => [...prev, aiResponseLog]);
          }
          
          // Create final result log
          const finalResult = executionResults.length > 0 
            ? `Task completed successfully.\n\n${executionResults.join('\n\n')}`
            : "Task completed successfully.";
            
          const agentLog: Log = {
            agentId: "system",
            text: finalResult,
            type: "response",
          };
          setLogs((prev) => [...prev, agentLog]);
          
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
      
    } catch (error) {
      const errorLog: Log = {
        agentId: "system",
        text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        type: "response",
      };
      setLogs((prev) => [...prev, errorLog]);
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

  return (
    <Box flexDirection="column" height="100%">
      {/* Main conversation area */}
      <Box flexDirection="column" flexGrow={1}>
        <Static items={logs}>
          {(log, index) => (
            <Text key={`log-${index}-${log.agentId}-${Date.now()}`}>
              <Text color={log.agentId === "user" ? "green" : log.agentId === "system" ? "red" : "cyan"}>
                [{log.agentId}]
              </Text>{" "}
              {log.text}
              <Newline />
            </Text>
          )}
        </Static>
        
        {/* Streaming content */}
        {streamingContent && currentAgent && (
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
      </Box>

      {/* System Activity Panel */}
      {(activeTasks.length > 0 || activeTools.length > 0 || systemEvents.length > 0) && (
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

      {/* Input area - hide when prompt is active */}
      {!currentPrompt && (
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