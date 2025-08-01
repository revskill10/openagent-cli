import { readFileSync } from 'fs';

export interface AgentConfig {
  id: string;
  provider: string;
  toolTypes: Array<'localMCP' | 'remoteMCP' | 'function'>;
  canDelegate: boolean;
  subAgents?: string[];
  specialization?: string;
  system: string;
  model?: string;
  children?: Record<string, AgentConfig>;
}

export interface Config {
  providers: Array<{
    name: string;
    type: 'openai' | 'anthropic';
    baseURL?: string;
    apiKey: string;
    defaultModel: string;
  }>;
  tools: {
    localMCP: Array<{
      name: string;
      command: string;
      args: string[];
    }>;
    remoteMCP: Array<{
      name: string;
      url: string;
      apiKey?: string;
      headers?: Record<string, string>;
    }>;
    functions: Array<{
      name: string;
      description: string;
      inputSchema: any;
    }>;
  };
  agentHierarchy: {
    root: AgentConfig;
  };
  concurrency: {
    maxConcurrentAgents: number;
    taskTimeout: number;
    enableParallelExecution: boolean;
  };
}

let config: Config | null = null;

export function loadConfig(): Config {
  if (!config) {
    try {
      const configContent = readFileSync('./config.json', 'utf8');
      config = JSON.parse(configContent);
      console.log('📋 Configuration loaded');
    } catch (error) {
      console.error('❌ Error reading config.json:', error);
      process.exit(1);
    }
  }
  return config!;
}

export function getConfig(): Config {
  return config || loadConfig();
}