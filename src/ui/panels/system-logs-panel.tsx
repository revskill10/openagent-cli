// system-logs-panel.tsx - Real-time system logs and events display
import React, { useState, useEffect, useRef } from 'react';
import { Text, Box, Static } from 'ink';
import { SystemEvent, systemEventEmitter } from '../../system-events.js';

interface SystemLogsPanelProps {
  height: number;
  width: number;
  isMinimized: boolean;
}

interface LogEntry {
  id: string;
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  source: string;
  message: string;
  data?: any;
}

export const SystemLogsPanel: React.FC<SystemLogsPanelProps> = ({ height, width, isMinimized }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<'all' | 'info' | 'warn' | 'error'>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const maxLogs = 1000;

  useEffect(() => {
    const handleSystemEvent = (event: SystemEvent) => {
      const logEntry: LogEntry = {
        id: event.id,
        timestamp: new Date(event.timestamp),
        level: event.type.includes('error') ? 'error' : 
               event.type.includes('warn') ? 'warn' : 'info',
        source: event.agentId || 'system',
        message: formatEventMessage(event),
        data: event.data
      };

      setLogs(prev => {
        const newLogs = [logEntry, ...prev];
        return newLogs.slice(0, maxLogs);
      });
    };

    systemEventEmitter.on('systemEvent', handleSystemEvent);

    return () => {
      systemEventEmitter.off('systemEvent', handleSystemEvent);
    };
  }, []);

  const formatEventMessage = (event: SystemEvent): string => {
    switch (event.type) {
      case 'task_start':
        return `🚀 Task started: ${event.data?.description || 'Unknown task'}`;
      case 'task_complete':
        return `✅ Task completed: ${event.data?.description || 'Unknown task'}`;
      case 'task_error':
        return `❌ Task error: ${event.data?.error || 'Unknown error'}`;
      case 'agent_delegation':
        return `👥 Task delegated to ${event.data?.toAgent}`;
      case 'agent_communication':
        return `💬 Agent communication: ${event.data?.type}`;
      case 'tool_start':
        return `🔧 Tool started: ${event.data?.toolName}`;
      case 'tool_complete':
        return `✅ Tool completed: ${event.data?.toolName}`;
      case 'tool_error':
        return `⚠️ Tool error: ${event.data?.toolName} - ${event.data?.error}`;
      default:
        return `ℹ️ ${event.type}: ${JSON.stringify(event.data)}`;
    }
  };

  const filteredLogs = logs.filter(log => filter === 'all' || log.level === filter);

  const formatTime = (timestamp: Date) => {
    return timestamp.toLocaleTimeString([], { 
      hour12: false, 
      timeStyle: 'medium' 
    });
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error': return 'red';
      case 'warn': return 'yellow';
      case 'debug': return 'gray';
      default: return 'white';
    }
  };

  const getLevelIcon = (level: string) => {
    switch (level) {
      case 'error': return '❌';
      case 'warn': return '⚠️';
      case 'debug': return '🔍';
      default: return 'ℹ️';
    }
  };

  if (isMinimized) {
    return (
      <Box borderStyle="single" borderColor="blue" width={width} height={3}>
        <Box flexDirection="column" width="100%">
          <Text color="blue" bold>📋 System Logs (Minimized)</Text>
          <Text color="gray">
            {logs.length} entries | Latest: {logs[0] ? formatTime(logs[0].timestamp) : 'None'}
          </Text>
        </Box>
      </Box>
    );
  }

  const displayHeight = Math.max(height - 4, 5); // Reserve space for header and controls

  return (
    <Box borderStyle="single" borderColor="blue" width={width} height={height}>
      <Box flexDirection="column" width="100%">
        {/* Header */}
        <Box justifyContent="space-between" marginBottom={1}>
          <Text color="blue" bold>📋 System Logs</Text>
          <Text color="gray">
            {filteredLogs.length}/{logs.length} entries
          </Text>
        </Box>

        {/* Filter Controls */}
        <Box marginBottom={1}>
          <Text color="gray">Filter: </Text>
          <Text color={filter === 'all' ? 'cyan' : 'gray'}>All</Text>
          <Text color="gray"> | </Text>
          <Text color={filter === 'info' ? 'cyan' : 'gray'}>Info</Text>
          <Text color="gray"> | </Text>
          <Text color={filter === 'warn' ? 'cyan' : 'gray'}>Warn</Text>
          <Text color="gray"> | </Text>
          <Text color={filter === 'error' ? 'cyan' : 'gray'}>Error</Text>
        </Box>

        {/* Log Entries */}
        <Box flexDirection="column" height={displayHeight}>
          {filteredLogs.length === 0 ? (
            <Text color="gray">No log entries</Text>
          ) : (
            <Static items={filteredLogs.slice(0, displayHeight)}>
              {(log, index) => (
                <Box key={`log-${log.id}-${index}`} flexDirection="column">
                  <Box>
                    <Text color="gray">[{formatTime(log.timestamp)}]</Text>
                    <Text color={getLevelColor(log.level)}> {getLevelIcon(log.level)} </Text>
                    <Text color="cyan">[{log.source}]</Text>
                    <Text> {log.message}</Text>
                  </Box>
                  {log.data && Object.keys(log.data).length > 0 && (
                    <Text color="gray">
                      └─ {JSON.stringify(log.data, null, 0).substring(0, width - 10)}
                    </Text>
                  )}
                </Box>
              )}
            </Static>
          )}
        </Box>

        {/* Status Bar */}
        <Box justifyContent="space-between" marginTop={1}>
          <Text color="gray">
            Auto-scroll: {autoScroll ? '✓' : '✗'}
          </Text>
          <Text color="gray">
            Errors: {logs.filter(l => l.level === 'error').length} | 
            Warnings: {logs.filter(l => l.level === 'warn').length}
          </Text>
        </Box>
      </Box>
    </Box>
  );
};

// Hook for external log injection
export const useSystemLogs = () => {
  const addLog = (level: 'info' | 'warn' | 'error' | 'debug', source: string, message: string, data?: any) => {
    const event: SystemEvent = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: level === 'error' ? 'task_error' : 'task_start',
      timestamp: Date.now(),
      agentId: source,
      data: { description: message, ...data }
    };

    systemEventEmitter.emit('systemEvent', event);
  };

  return { addLog };
};
