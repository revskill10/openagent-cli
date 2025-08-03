// agents-panel.tsx - Live agents dashboard with status and collaboration view
import React, { useState, useEffect } from 'react';
import { Text, Box, Static } from 'ink';
import { Agent, agentManager } from '../../advanced-agents/agent-manager.js';
import { backgroundProcessor } from '../../advanced-agents/background-processor.js';

interface AgentsPanelProps {
  height: number;
  width: number;
  isMinimized: boolean;
}

interface AgentDisplayInfo extends Agent {
  currentTaskName?: string;
  collaborators?: string[];
  workload: number;
}

export const AgentsPanel: React.FC<AgentsPanelProps> = ({ height, width, isMinimized }) => {
  const [agents, setAgents] = useState<AgentDisplayInfo[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid' | 'collaboration'>('list');
  const [resourceUsage, setResourceUsage] = useState<any>(null);

  useEffect(() => {
    const updateAgents = () => {
      const allAgents = agentManager.getAllAgents();
      const processorStats = backgroundProcessor.getStats();
      const queueStatus = backgroundProcessor.getQueueStatus();

      const agentDisplayInfo: AgentDisplayInfo[] = allAgents.map(agent => {
        // Calculate workload
        const activeJobs = queueStatus.active.filter(job => job.agentId === agent.id);
        const workload = activeJobs.length / agent.capabilities.maxConcurrentTasks;

        // Find current task name
        const currentJob = activeJobs[0];
        const currentTaskName = currentJob ? `Task ${currentJob.taskId.slice(0, 8)}` : undefined;

        // Find collaborators (agents working on same plan)
        const collaborators = currentJob ? 
          queueStatus.active
            .filter(job => job.planId === currentJob.planId && job.agentId !== agent.id)
            .map(job => job.agentId)
            .slice(0, 3) : [];

        return {
          ...agent,
          currentTaskName,
          collaborators,
          workload
        };
      });

      setAgents(agentDisplayInfo);
      setResourceUsage(agentManager.getResourceUsage());
    };

    // Update immediately
    updateAgents();

    // Set up periodic updates
    const interval = setInterval(updateAgents, 2000);

    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'idle': return 'green';
      case 'busy': return 'yellow';
      case 'overloaded': return 'red';
      case 'error': return 'red';
      case 'offline': return 'gray';
      case 'spawning': return 'cyan';
      default: return 'white';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'idle': return '💤';
      case 'busy': return '⚡';
      case 'overloaded': return '🔥';
      case 'error': return '❌';
      case 'offline': return '⚫';
      case 'spawning': return '🌱';
      default: return '❓';
    }
  };

  const getWorkloadBar = (workload: number, width: number = 10) => {
    const filled = Math.round(workload * width);
    const empty = width - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  };

  const getAgentTypeIcon = (type: string) => {
    switch (type) {
      case 'specialist': return '🎯';
      case 'generalist': return '🔧';
      case 'coordinator': return '👑';
      case 'background': return '🌙';
      case 'temporary': return '⏱️';
      default: return '🤖';
    }
  };

  if (isMinimized) {
    const activeAgents = agents.filter(a => a.status === 'busy').length;
    const totalAgents = agents.length;

    return (
      <Box borderStyle="single" borderColor="green" width={width} height={3}>
        <Box flexDirection="column" width="100%">
          <Text color="green" bold>🤖 Agents (Minimized)</Text>
          <Text color="gray">
            {activeAgents}/{totalAgents} active | Memory: {resourceUsage?.memory.percentage.toFixed(0)}%
          </Text>
        </Box>
      </Box>
    );
  }

  const displayHeight = Math.max(height - 6, 5);

  return (
    <Box borderStyle="single" borderColor="green" width={width} height={height}>
      <Box flexDirection="column" width="100%">
        {/* Header */}
        <Box justifyContent="space-between" marginBottom={1}>
          <Text color="green" bold>🤖 Agents Dashboard</Text>
          <Text color="gray">
            {agents.filter(a => a.status === 'busy').length}/{agents.length} active
          </Text>
        </Box>

        {/* Resource Usage */}
        {resourceUsage && (
          <Box marginBottom={1}>
            <Text color="gray">Memory: </Text>
            <Text color={resourceUsage.memory.percentage > 80 ? 'red' : 'cyan'}>
              {resourceUsage.memory.percentage.toFixed(0)}%
            </Text>
            <Text color="gray"> | CPU: </Text>
            <Text color={resourceUsage.processing.percentage > 80 ? 'red' : 'cyan'}>
              {resourceUsage.processing.percentage.toFixed(0)}%
            </Text>
          </Box>
        )}

        {/* View Mode Controls */}
        <Box marginBottom={1}>
          <Text color="gray">View: </Text>
          <Text color={viewMode === 'list' ? 'cyan' : 'gray'}>List</Text>
          <Text color="gray"> | </Text>
          <Text color={viewMode === 'collaboration' ? 'cyan' : 'gray'}>Collaboration</Text>
        </Box>

        {/* Agents List */}
        <Box flexDirection="column" height={displayHeight}>
          {agents.length === 0 ? (
            <Text color="gray">No agents available</Text>
          ) : viewMode === 'list' ? (
            <Static items={agents.slice(0, displayHeight)}>
              {(agent, index) => (
                <Box key={`agent-${agent.id}-${index}`} flexDirection="column">
                  <Box>
                    <Text color={getStatusColor(agent.status)}>
                      {getStatusIcon(agent.status)}
                    </Text>
                    <Text color="cyan"> {getAgentTypeIcon(agent.type)} </Text>
                    <Text bold>{agent.name.substring(0, 15)}</Text>
                    <Text color="gray"> | </Text>
                    <Text color={getStatusColor(agent.status)}>{agent.status}</Text>
                  </Box>
                  
                  {agent.status === 'busy' && agent.currentTaskName && (
                    <Box marginLeft={2}>
                      <Text color="yellow">📋 {agent.currentTaskName}</Text>
                    </Box>
                  )}
                  
                  <Box marginLeft={2}>
                    <Text color="gray">Load: </Text>
                    <Text color={agent.workload > 0.8 ? 'red' : 'green'}>
                      {getWorkloadBar(agent.workload, 8)}
                    </Text>
                    <Text color="gray"> {(agent.workload * 100).toFixed(0)}%</Text>
                  </Box>

                  {agent.specialization.length > 0 && (
                    <Box marginLeft={2}>
                      <Text color="gray">Skills: </Text>
                      <Text color="magenta">
                        {agent.specialization.slice(0, 2).join(', ')}
                        {agent.specialization.length > 2 ? '...' : ''}
                      </Text>
                    </Box>
                  )}

                  {agent.collaborators && agent.collaborators.length > 0 && (
                    <Box marginLeft={2}>
                      <Text color="gray">Collaborating with: </Text>
                      <Text color="blue">
                        {agent.collaborators.length} agent{agent.collaborators.length > 1 ? 's' : ''}
                      </Text>
                    </Box>
                  )}
                </Box>
              )}
            </Static>
          ) : (
            // Collaboration View
            <Box flexDirection="column">
              <Text color="cyan" bold>🤝 Agent Collaboration</Text>
              {agents.filter(a => a.collaborators && a.collaborators.length > 0).length === 0 ? (
                <Text color="gray">No active collaborations</Text>
              ) : (
                <Static items={agents.filter(a => a.collaborators && a.collaborators.length > 0)}>
                  {(agent, index) => (
                    <Box key={`collab-${agent.id}-${index}`} flexDirection="column" marginTop={1}>
                      <Text color="cyan">
                        🎯 {agent.name} → {agent.collaborators?.length} collaborators
                      </Text>
                      <Box marginLeft={2}>
                        <Text color="gray">Working on: </Text>
                        <Text color="yellow">{agent.currentTaskName}</Text>
                      </Box>
                    </Box>
                  )}
                </Static>
              )}
            </Box>
          )}
        </Box>

        {/* Performance Summary */}
        <Box justifyContent="space-between" marginTop={1}>
          <Text color="gray">
            Avg Performance: {
              agents.length > 0 
                ? (agents.reduce((sum, a) => sum + a.performance.qualityScore, 0) / agents.length * 100).toFixed(0)
                : 0
            }%
          </Text>
          <Text color="gray">
            Success Rate: {
              agents.length > 0 
                ? (agents.reduce((sum, a) => sum + a.performance.reliabilityScore, 0) / agents.length * 100).toFixed(0)
                : 0
            }%
          </Text>
        </Box>
      </Box>
    </Box>
  );
};
