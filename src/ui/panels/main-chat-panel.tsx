// main-chat-panel.tsx - Primary conversation interface with AI responses
import React, { useState, useEffect, useRef } from 'react';
import { Text, Box, Static, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { Log } from '../../ui.js';
import { InteractivePrompt, ToolApproval } from '../../interactive-ui-handler.js';

interface MainChatPanelProps {
  height: number;
  width: number;
  isMinimized: boolean;
  logs: Log[];
  streamingContent: string;
  currentAgent: string;
  currentPrompt: any;
  currentApproval: any;
  input: string;
  onInputChange: (value: string) => void;
  onInputSubmit: (value: string) => void;
  onPromptResponse?: (response: any) => void;
  onApprovalResponse?: (response: 'approve' | 'reject' | 'modify') => void;
}

export const MainChatPanel: React.FC<MainChatPanelProps> = ({
  height,
  width,
  isMinimized,
  logs,
  streamingContent,
  currentAgent,
  currentPrompt,
  currentApproval,
  input,
  onInputChange,
  onInputSubmit,
  onPromptResponse,
  onApprovalResponse
}) => {
  const [scrollOffset, setScrollOffset] = useState(0);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showTimestamps, setShowTimestamps] = useState(false);
  const maxDisplayLogs = Math.max(height - 8, 5); // Reserve space for input and controls

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll) {
      setScrollOffset(0);
    }
  }, [logs.length, autoScroll]);

  // Keyboard shortcuts
  useInput((input, key) => {
    if (currentPrompt || currentApproval) return; // Don't handle shortcuts during prompts

    if (key.upArrow) {
      setScrollOffset(prev => Math.min(prev + 1, Math.max(0, logs.length - maxDisplayLogs)));
      setAutoScroll(false);
    } else if (key.downArrow) {
      setScrollOffset(prev => {
        const newOffset = Math.max(prev - 1, 0);
        if (newOffset === 0) setAutoScroll(true);
        return newOffset;
      });
    } else if (key.pageUp) {
      setScrollOffset(prev => Math.min(prev + maxDisplayLogs, Math.max(0, logs.length - maxDisplayLogs)));
      setAutoScroll(false);
    } else if (key.pageDown) {
      setScrollOffset(prev => {
        const newOffset = Math.max(prev - maxDisplayLogs, 0);
        if (newOffset === 0) setAutoScroll(true);
        return newOffset;
      });
    } else if (key.ctrl && input === 't') {
      setShowTimestamps(!showTimestamps);
    } else if (key.ctrl && input === 'b') {
      setScrollOffset(0);
      setAutoScroll(true);
    }
  });

  const getAgentColor = (agentId: string) => {
    const colors = ['cyan', 'green', 'yellow', 'magenta', 'blue'];
    const hash = agentId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  const getAgentIcon = (agentId: string) => {
    if (agentId === 'user') return '👤';
    if (agentId === 'ai-model') return '🤖';
    if (agentId === 'system') return '⚙️';
    if (agentId === 'executor') return '⚡';
    if (agentId === 'durable-executor') return '🔧';
    if (agentId === 'streaming-executor') return '📡';
    if (agentId.includes('agent')) return '🎯';
    return '🔹';
  };

  const formatTimestamp = (timestamp?: Date) => {
    if (!timestamp) return '';
    return timestamp.toLocaleTimeString([], { 
      hour12: false, 
      timeStyle: 'medium' 
    });
  };

  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  };

  if (isMinimized) {
    return (
      <Box borderStyle="single" borderColor="white" width={width} height={3}>
        <Box flexDirection="column" width="100%">
          <Text color="white" bold>💬 Chat (Minimized)</Text>
          <Text color="gray">
            {logs.length} messages | Agent: {currentAgent || 'None'}
          </Text>
        </Box>
      </Box>
    );
  }

  const displayLogs = logs.slice(
    Math.max(0, logs.length - maxDisplayLogs - scrollOffset),
    logs.length - scrollOffset
  );

  return (
    <Box borderStyle="single" borderColor="white" width={width} height={height}>
      <Box flexDirection="column" width="100%">
        {/* Header */}
        <Box justifyContent="space-between" marginBottom={1}>
          <Text color="white" bold>💬 AI Chat</Text>
          <Box>
            <Text color="gray">
              {logs.length} msgs | {autoScroll ? '🔄' : '⏸️'}
            </Text>
            {currentAgent && (
              <>
                <Text color="gray"> | </Text>
                <Text color={getAgentColor(currentAgent)}>
                  {getAgentIcon(currentAgent)} {currentAgent}
                </Text>
              </>
            )}
          </Box>
        </Box>

        {/* Controls */}
        <Box marginBottom={1}>
          <Text color="gray">
            ↑↓ Scroll | PgUp/PgDn Jump | Ctrl+T Timestamps | Ctrl+B Bottom
          </Text>
        </Box>

        {/* Chat Messages */}
        <Box flexDirection="column" height={maxDisplayLogs}>
          {displayLogs.length === 0 ? (
            <Text color="gray">No messages yet. Start a conversation!</Text>
          ) : (
            <Static items={displayLogs}>
              {(log, index) => (
                <Box key={`log-${index}-${log.timestamp?.getTime()}`} flexDirection="column">
                  <Box>
                    {showTimestamps && log.timestamp && (
                      <>
                        <Text color="gray">[{formatTimestamp(log.timestamp)}] </Text>
                      </>
                    )}
                    <Text color={getAgentColor(log.agentId)}>
                      {getAgentIcon(log.agentId)}
                    </Text>
                    <Text color={getAgentColor(log.agentId)} bold>
                      {log.agentId}
                    </Text>
                    <Text color="gray">: </Text>
                  </Box>
                  
                  <Box flexDirection="column" marginLeft={showTimestamps ? 12 : 4}>
                    {log.text.split('\n').map((line, lineIndex) => (
                      <Text key={lineIndex} wrap="wrap">
                        {truncateText(line, width - (showTimestamps ? 16 : 8))}
                      </Text>
                    ))}
                  </Box>
                </Box>
              )}
            </Static>
          )}
        </Box>

        {/* Streaming Content */}
        {streamingContent && (
          <Box borderStyle="single" borderColor="yellow" marginY={1} padding={1}>
            <Box flexDirection="column">
              <Text color="yellow" bold>🔄 Streaming...</Text>
              <Text wrap="wrap">
                {truncateText(streamingContent, width - 4)}
              </Text>
            </Box>
          </Box>
        )}

        {/* Interactive Prompt */}
        {currentPrompt && onPromptResponse && (
          <Box marginY={1}>
            <InteractivePrompt 
              prompt={currentPrompt} 
              onResponse={onPromptResponse}
            />
          </Box>
        )}

        {/* Tool Approval */}
        {currentApproval && onApprovalResponse && (
          <Box marginY={1}>
            <ToolApproval 
              approval={currentApproval} 
              onResponse={onApprovalResponse}
            />
          </Box>
        )}

        {/* Input Area */}
        {!currentPrompt && !currentApproval && (
          <Box borderStyle="single" borderColor="cyan" marginTop={1}>
            <Box flexDirection="column" width="100%">
              <Text color="cyan">💭 Your message:</Text>
              <Box marginTop={1}>
                <Text color="gray">{'> '}</Text>
                <TextInput
                  value={input}
                  onChange={onInputChange}
                  onSubmit={onInputSubmit}
                  placeholder="Type your message and press Enter..."
                />
              </Box>
            </Box>
          </Box>
        )}

        {/* Status Bar */}
        <Box justifyContent="space-between" marginTop={1}>
          <Text color="gray">
            {scrollOffset > 0 && `↑ ${scrollOffset} messages above`}
          </Text>
          <Text color="gray">
            {logs.length > maxDisplayLogs && 
              `${displayLogs.length}/${logs.length} shown`
            }
          </Text>
        </Box>
      </Box>
    </Box>
  );
};
