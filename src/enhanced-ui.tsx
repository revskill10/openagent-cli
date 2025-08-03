// enhanced-ui.tsx - Multi-panel UI with intelligent file reading and advanced agents
import React, { useState, useEffect, useCallback } from 'react';
import { Text, Box } from 'ink';
import { LayoutManager, LayoutConfig, createDefaultLayout, PanelProps } from './ui/layout-manager.js';
import { MainChatPanel } from './ui/panels/main-chat-panel.js';
import { SystemLogsPanel } from './ui/panels/system-logs-panel.js';
import { AgentsPanel } from './ui/panels/agents-panel.js';
import { TaskManagementPanel } from './ui/panels/task-management-panel.js';
import { ReactUIInputHandler } from './interactive-ui-handler.js';
import { agentOrchestrator, OrchestrationRequest } from './advanced-agents/agent-orchestrator.js';
import { intelligentFileReader } from './intelligent-file-reader/intelligent-file-reader.js';
import { systemEventEmitter } from './system-events.js';
import { ErrorBoundary, withErrorBoundary } from './ui/error-boundary.js';
import { usePerformanceMonitor, PerformanceOverlay } from './ui/performance-monitor.js';
import { useKeyboardShortcuts, KeyboardShortcutsHelp, createDefaultShortcuts } from './ui/keyboard-shortcuts.js';

interface Log {
  agentId: string;
  text: string;
  type: "request" | "response" | "error";
  timestamp?: Date;
}

interface EnhancedUIProps {
  onExit?: () => void;
}

export const EnhancedUI: React.FC<EnhancedUIProps> = ({ onExit }) => {
  // Core state
  const [logs, setLogs] = useState<Log[]>([]);
  const [input, setInput] = useState("");
  const [streamingContent, setStreamingContent] = useState("");
  const [currentAgent, setCurrentAgent] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // UI state
  const [layoutConfig, setLayoutConfig] = useState<LayoutConfig>(createDefaultLayout());
  const [uiInputHandler] = useState(() => new ReactUIInputHandler());
  const [currentPrompt, setCurrentPrompt] = useState<any>(null);
  const [currentApproval, setCurrentApproval] = useState<any>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showPerformanceOverlay, setShowPerformanceOverlay] = useState(false);

  // Advanced features state
  const [activeOrchestration, setActiveOrchestration] = useState<string | null>(null);
  const [fileCache, setFileCache] = useState<any>(null);

  // Performance monitoring
  const performanceMonitor = usePerformanceMonitor({
    enabled: showPerformanceOverlay,
    sampleInterval: 1000,
    onMetricsUpdate: (metrics) => {
      if (metrics.renderTime > 50) {
        console.warn('Slow render detected:', metrics.renderTime + 'ms');
      }
    }
  });

  // Initialize enhanced features
  useEffect(() => {
    const initializeEnhancedFeatures = async () => {
      try {
        // Initialize file cache
        const cacheStats = await intelligentFileReader.getCacheStats();
        setFileCache(cacheStats);

        // Set up system event listeners
        const handleSystemEvent = (event: any) => {
          const logEntry: Log = {
            agentId: event.agentId || 'system',
            text: formatSystemEvent(event),
            type: event.type.includes('error') ? 'error' : 'response',
            timestamp: new Date(event.timestamp)
          };
          setLogs(prev => [...prev, logEntry]);
        };

        systemEventEmitter.on('systemEvent', handleSystemEvent);

        return () => {
          systemEventEmitter.off('systemEvent', handleSystemEvent);
        };
      } catch (error) {
        console.error('Failed to initialize enhanced features:', error);
      }
    };

    initializeEnhancedFeatures();
  }, []);

  // Monitor UI input handler for prompts and approvals
  useEffect(() => {
    const checkForPrompts = () => {
      const prompt = uiInputHandler.getCurrentPrompt();
      const approval = uiInputHandler.getCurrentApproval();

      setCurrentPrompt(prompt);
      setCurrentApproval(approval);
    };

    const interval = setInterval(checkForPrompts, 100);
    return () => clearInterval(interval);
  }, [uiInputHandler]);

  // Keyboard shortcuts
  const shortcuts = createDefaultShortcuts({
    showHelp: () => setShowHelp(!showHelp),
    toggleResize: () => {
      // This will be handled by the layout manager
    },
    cycleLayout: () => {
      // This will be handled by the layout manager
    },
    resetLayout: () => {
      setLayoutConfig(createDefaultLayout());
    },
    switchPanel: (direction) => {
      // This will be handled by the layout manager
    },
    minimizePanel: () => {
      // This will be handled by the layout manager
    },
    scrollUp: () => {
      // Context-dependent scrolling
    },
    scrollDown: () => {
      // Context-dependent scrolling
    },
    jumpToTop: () => {
      // Context-dependent jumping
    },
    jumpToBottom: () => {
      // Context-dependent jumping
    }
  });

  // Add performance toggle shortcut
  shortcuts.push({
    id: 'toggle-performance',
    key: 'p',
    ctrl: true,
    description: 'Toggle performance overlay',
    category: 'Debug',
    action: () => setShowPerformanceOverlay(!showPerformanceOverlay)
  });

  useKeyboardShortcuts(shortcuts, {
    enabled: !currentPrompt && !currentApproval, // Disable during prompts
    onShortcutExecuted: (shortcut) => {
      console.log(`Executed shortcut: ${shortcut.description}`);
    }
  });

  const formatSystemEvent = (event: any): string => {
    switch (event.type) {
      case 'task_start':
        return `🚀 Started: ${event.data?.description || 'Unknown task'}`;
      case 'task_complete':
        return `✅ Completed: ${event.data?.description || 'Unknown task'}`;
      case 'task_error':
        return `❌ Error: ${event.data?.error || 'Unknown error'}`;
      case 'agent_spawned':
        return `🌱 Agent spawned: ${event.data?.name} (${event.data?.specialization?.join(', ')})`;
      case 'agent_removed':
        return `🗑️ Agent removed: ${event.data?.name}`;
      case 'tool_start':
        return `🔧 Tool started: ${event.data?.toolName}`;
      case 'tool_complete':
        return `✅ Tool completed: ${event.data?.toolName}`;
      default:
        return `ℹ️ ${event.type}: ${JSON.stringify(event.data)}`;
    }
  };

  const handleInputSubmit = useCallback(async (value: string) => {
    if (!value.trim() || isProcessing) return;

    setInput("");
    setIsProcessing(true);
    setCurrentAgent("orchestrator");

    // Add user message to logs
    const userLog: Log = {
      agentId: "user",
      text: value,
      type: "request",
      timestamp: new Date()
    };
    setLogs(prev => [...prev, userLog]);

    try {
      // Check if this is a file-related query
      if (value.toLowerCase().includes('read') || value.toLowerCase().includes('file') || value.toLowerCase().includes('analyze')) {
        await handleFileQuery(value);
      } else {
        // Use advanced agent orchestration for complex queries
        await handleAdvancedQuery(value);
      }
    } catch (error) {
      const errorLog: Log = {
        agentId: "system",
        text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        type: "error",
        timestamp: new Date()
      };
      setLogs(prev => [...prev, errorLog]);
    } finally {
      setIsProcessing(false);
      setCurrentAgent("");
      setStreamingContent("");
    }
  }, [isProcessing]);

  const handleFileQuery = async (query: string) => {
    setCurrentAgent("file-reader");
    setStreamingContent("🔍 Analyzing file query...");

    // Extract file path from query (simple pattern matching)
    const filePathMatch = query.match(/(?:read|analyze|file)\s+["']?([^\s"']+)["']?/i);
    const filePath = filePathMatch ? filePathMatch[1] : null;

    if (filePath) {
      setStreamingContent(`📖 Reading file: ${filePath}`);
      
      try {
        const result = await intelligentFileReader.readFile(filePath, {
          maxTokens: 4000,
          context: query,
          includeOutline: true,
          includeSummary: true
        });

        const responseLog: Log = {
          agentId: "file-reader",
          text: `📁 File Analysis: ${result.metadata.name}\n\n` +
                `📊 Strategy: ${result.strategy}\n` +
                `📏 Size: ${result.metadata.lineCount} lines\n` +
                `🎯 Tokens: ${result.tokenCount}\n\n` +
                `${result.summary ? `📝 Summary:\n${result.summary}\n\n` : ''}` +
                `📋 Content:\n${result.content.substring(0, 1000)}${result.content.length > 1000 ? '...' : ''}`,
          type: "response",
          timestamp: new Date()
        };
        setLogs(prev => [...prev, responseLog]);

        // Update file cache stats
        const cacheStats = await intelligentFileReader.getCacheStats();
        setFileCache(cacheStats);

      } catch (error) {
        throw new Error(`Failed to read file: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      throw new Error("No file path found in query. Please specify a file to read.");
    }
  };

  const handleAdvancedQuery = async (query: string) => {
    setCurrentAgent("orchestrator");
    setStreamingContent("🧠 Creating execution plan...");

    const orchestrationRequest: OrchestrationRequest = {
      userQuery: query,
      preferences: {
        prioritizeQuality: true,
        allowParallelExecution: true,
        maxDuration: 60 // minutes
      }
    };

    try {
      const orchestration = await agentOrchestrator.orchestrate(orchestrationRequest);
      setActiveOrchestration(orchestration.planId);

      const responseLog: Log = {
        agentId: "orchestrator",
        text: `🎯 Orchestration Plan Created\n\n` +
              `📋 Plan ID: ${orchestration.planId}\n` +
              `🤖 Agents Assigned: ${orchestration.assignedAgents.length}\n` +
              `📝 Tasks Created: ${orchestration.plan.allTasks.size}\n` +
              `⏱️ Estimated Completion: ${orchestration.estimatedCompletion.toLocaleTimeString()}\n` +
              `🚀 Background Jobs: ${orchestration.jobIds.length}\n\n` +
              `The plan is now executing in the background. Monitor progress in the Agents and Tasks panels.`,
        type: "response",
        timestamp: new Date()
      };
      setLogs(prev => [...prev, responseLog]);

    } catch (error) {
      throw new Error(`Orchestration failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handlePromptResponse = useCallback((response: any) => {
    uiInputHandler.handleResponse(response);
  }, [uiInputHandler]);

  const handleApprovalResponse = useCallback((response: 'approve' | 'reject' | 'modify') => {
    uiInputHandler.handleApprovalResponse(response);
  }, [uiInputHandler]);

  const handleLayoutChange = useCallback((newConfig: LayoutConfig) => {
    setLayoutConfig(newConfig);
  }, []);

  // Create panel components with proper props
  const createPanelComponents = () => {
    const updatedConfig = {
      ...layoutConfig,
      panels: layoutConfig.panels.map(panel => ({
        ...panel,
        component: (props: PanelProps) => {
          switch (panel.id) {
            case 'main-chat':
              return (
                <MainChatPanel
                  {...props}
                  logs={logs}
                  streamingContent={streamingContent}
                  currentAgent={currentAgent}
                  currentPrompt={currentPrompt}
                  currentApproval={currentApproval}
                  input={input}
                  onInputChange={setInput}
                  onInputSubmit={handleInputSubmit}
                  onPromptResponse={handlePromptResponse}
                  onApprovalResponse={handleApprovalResponse}
                />
              );
            case 'system-logs':
              return <SystemLogsPanel {...props} />;
            case 'agents':
              return <AgentsPanel {...props} />;
            case 'tasks':
              return <TaskManagementPanel {...props} />;
            default:
              return (
                <Box borderStyle="single" width={props.width} height={props.height}>
                  <Text>Unknown panel: {panel.id}</Text>
                </Box>
              );
          }
        }
      }))
    };

    return updatedConfig;
  };

  // Start performance monitoring
  useEffect(() => {
    performanceMonitor.startRender();
    return () => {
      performanceMonitor.endRender();
    };
  });

  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        console.error('Enhanced UI Error:', error);
        systemEventEmitter.emitSystemInfo('UI Error occurred', {
          error: error.message,
          componentStack: errorInfo.componentStack
        });
      }}
    >
      <Box flexDirection="column" position="relative">
        <LayoutManager
          config={createPanelComponents()}
          onLayoutChange={handleLayoutChange}
        />

        {/* Performance Overlay */}
        {showPerformanceOverlay && (
          <PerformanceOverlay
            metrics={performanceMonitor.metrics}
            position="top-right"
            visible={true}
          />
        )}

        {/* Keyboard Shortcuts Help */}
        <KeyboardShortcutsHelp
          shortcuts={shortcuts}
          visible={showHelp}
          onClose={() => setShowHelp(false)}
        />

        {/* Status Bar */}
        <Box
          position="absolute"
          bottom={0}
          left={0}
          right={0}
          borderStyle="single"
          borderColor="gray"
          paddingX={1}
        >
          <Box justifyContent="space-between">
            <Text color="gray">
              Enhanced OpenAgent |
              {isProcessing ? ' 🔄 Processing...' : ' ✅ Ready'} |
              Agent: {currentAgent || 'None'}
            </Text>
            <Text color="gray">
              Ctrl+H: Help | Ctrl+P: Performance |
              {activeOrchestration ? ` Plan: ${activeOrchestration.slice(0, 8)}` : ''}
            </Text>
          </Box>
        </Box>
      </Box>
    </ErrorBoundary>
  );
};
