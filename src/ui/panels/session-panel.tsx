import React, { useState, useEffect } from 'react';
import { Box, Text, Newline } from 'ink';
import { conversationPersistence, ConversationSession } from '../../conversation-persistence.js';

interface SessionPanelProps {
  width: number;
  height: number;
  visible: boolean;
}

export const SessionPanel: React.FC<SessionPanelProps> = ({ width, height, visible }) => {
  const [sessions, setSessions] = useState<Array<{ id: string; startTime: Date; lastActivity: Date; messageCount: number }>>([]);
  const [currentSession, setCurrentSession] = useState<ConversationSession | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (visible) {
      // Load sessions when panel becomes visible
      const loadSessions = () => {
        const sessionList = conversationPersistence.listSessions();
        setSessions(sessionList);
        setCurrentSession(conversationPersistence.getCurrentSession());
      };

      loadSessions();
      
      // Refresh every 5 seconds
      const interval = setInterval(loadSessions, 5000);
      return () => clearInterval(interval);
    }
  }, [visible]);

  if (!visible) return null;

  const displayHeight = Math.max(3, height - 4); // Reserve space for header and borders
  const displaySessions = sessions.slice(0, displayHeight);

  const formatDate = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const formatSessionId = (id: string): string => {
    // Extract timestamp from session ID and format it
    const parts = id.split('_');
    if (parts.length >= 2) {
      const timestamp = parseInt(parts[1]);
      if (!isNaN(timestamp)) {
        const date = new Date(timestamp);
        return date.toLocaleString();
      }
    }
    return id.substring(0, 20) + '...';
  };

  return (
    <Box flexDirection="column" width={width} height={height}>
      {/* Header */}
      <Box>
        <Text color="cyan" bold>📂 Conversation Sessions</Text>
      </Box>
      <Newline />

      {/* Current Session Info */}
      {currentSession && (
        <Box flexDirection="column">
          <Text color="green">
            🟢 Current: {formatSessionId(currentSession.id)}
          </Text>
          <Text color="gray">
            Messages: {currentSession.logs.length} | Started: {formatDate(currentSession.startTime)}
          </Text>
          <Newline />
        </Box>
      )}

      {/* Session List Header */}
      <Box>
        <Text color="yellow">Recent Sessions:</Text>
      </Box>

      {/* Session List */}
      <Box flexDirection="column" height={displayHeight}>
        {displaySessions.length === 0 ? (
          <Text color="gray">No previous sessions found</Text>
        ) : (
          displaySessions.map((session, index) => {
            const isSelected = index === selectedIndex;
            const isCurrent = currentSession?.id === session.id;
            
            return (
              <Box key={session.id} flexDirection="column">
                <Box>
                  <Text color={isCurrent ? "green" : isSelected ? "cyan" : "white"}>
                    {isCurrent ? "🟢 " : isSelected ? "👉 " : "   "}
                    {formatSessionId(session.id)}
                  </Text>
                </Box>
                <Box>
                  <Text color="gray">
                    {`   ${session.messageCount} msgs | ${formatDate(session.lastActivity)}`}
                  </Text>
                </Box>
              </Box>
            );
          })
        )}
      </Box>

      {/* Footer with instructions */}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          💡 Sessions auto-save every 30s
        </Text>
      </Box>
    </Box>
  );
};

export default SessionPanel;
