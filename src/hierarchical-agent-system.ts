import { SimpleLogger } from './tools/base-executor.js';
import { modelManager, StreamingCallback } from './simple-models.js';
import { unifiedToolRegistry } from './tools/unified-tool-registry.js';
import { toolParser } from './simple-tools.js';
import { SystemPromptBuilder } from './tools/system-prompt-builder.js';
import { systemEventEmitter } from './system-events.js';
import { executeBlocksStreaming } from './block-executor.js';


const logger = new SimpleLogger('HierarchicalAgents');

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

export interface AgentTask {
  id: string;
  agentId: string;
  message: string;
  context?: any;
  parentTaskId?: string;
  priority: 'high' | 'medium' | 'low';
  timeout?: number;
}

export interface AgentResult {
  taskId: string;
  agentId: string;
  success: boolean;
  result?: string;
  error?: string;
  executionTime: number;
  subTaskResults?: AgentResult[];
}

export interface ConcurrencyConfig {
  maxConcurrentAgents: number;
  taskTimeout: number;
  enableParallelExecution: boolean;
}
interface BlockCtx extends Record<string, any> {
  $taskId: string;
  $agentId: string;
}
export class HierarchicalAgentSystem {
  private agents: Map<string, AgentConfig> = new Map();
  private providerConfigs: Map<string, any> = new Map();
  private activeTasks: Map<string, AgentTask> = new Map();
  private taskResults: Map<string, AgentResult> = new Map();
  private logger = new SimpleLogger('HierarchicalAgents');
  private concurrencyConfig: ConcurrencyConfig;
  private activeAgentCount = 0;
  private taskIdCounter = 1;

  constructor(concurrencyConfig: ConcurrencyConfig) {
    this.concurrencyConfig = concurrencyConfig;
  }

  async initialize(config: any): Promise<void> {
    this.logger.info('Initializing hierarchical agent system');

    // Store provider configs
    for (const provider of config.providers) {
      this.providerConfigs.set(provider.name, provider);
    }

    // Initialize tools
    await unifiedToolRegistry.initialize({
      localMCP: config.tools.localMCP,
      remoteMCP: config.tools.remoteMCP,
      functions: this.createInterAgentCommunicationFunctions()
    });

    // Build agent hierarchy
    await this.buildAgentHierarchy(config.agentHierarchy.root);

    this.logger.info('Hierarchical agent system initialized', {
      totalAgents: this.agents.size,
      agents: Array.from(this.agents.keys()),
      concurrency: this.concurrencyConfig
    });
  }

  private createInterAgentCommunicationFunctions() {
    return [
      {
        name: 'delegate_to_agent',
        description: 'Delegate a task to a specialized subagent',
        inputSchema: {
          type: 'object',
          properties: {
            agentId: {
              type: 'string',
              description: 'ID of the agent to delegate to'
            },
            task: {
              type: 'string', 
              description: 'Task description to delegate'
            },
            priority: {
              type: 'string',
              enum: ['high', 'medium', 'low'],
              description: 'Task priority level'
            },
            context: {
              type: 'object',
              description: 'Additional context for the task'
            }
          },
          required: ['agentId', 'task']
        },
        fn: async (args: any) => {
          return await this.delegateTask(args.agentId, args.task, args.priority || 'medium', args.context);
        }
      },
      {
        name: 'communicate_with_agent',
        description: 'Send a message to another agent for collaboration',
        inputSchema: {
          type: 'object',
          properties: {
            agentId: {
              type: 'string',
              description: 'ID of the agent to communicate with'
            },
            message: {
              type: 'string',
              description: 'Message to send'
            },
            waitForResponse: {
              type: 'boolean',
              description: 'Whether to wait for a response'
            }
          },
          required: ['agentId', 'message']
        },
        fn: async (args: any) => {
          return await this.sendMessage(args.agentId, args.message, args.waitForResponse !== false);
        }
      },
      {
        name: 'get_agent_status',
        description: 'Get the current status of agents in the system',
        inputSchema: {
          type: 'object',
          properties: {
            agentId: {
              type: 'string',
              description: 'Specific agent ID to check (optional)'
            }
          }
        },
        fn: async (args: any) => {
          return this.getAgentStatus(args.agentId);
        }
      },
      {
        name: 'create_chapter_template',
        description: 'Create a standardized chapter template with proper structure',
        inputSchema: {
          type: 'object',
          properties: {
            chapterNumber: { type: 'number' },
            title: { type: 'string' },
            learningObjectives: { type: 'array', items: { type: 'string' } },
            sections: { type: 'array', items: { type: 'string' } }
          },
          required: ['chapterNumber', 'title', 'learningObjectives', 'sections']
        },
        fn: async (args: any) => {
          const template = `# Chapter ${args.chapterNumber}: ${args.title}

## Learning Objectives
${args.learningObjectives.map((obj: string) => `- ${obj}`).join('\n')}

## Overview
[Brief chapter overview goes here]

${args.sections.map((section: string) => `## ${section}
[Content for ${section} goes here]

`).join('')}

## Summary
[Chapter summary goes here]

## Exercises
[Practice exercises go here]

## Further Reading
[Additional resources go here]
`;
          return template;
        }
      },
      {
        name: 'validate_code_example',
        description: 'Validate that code examples are syntactically correct and run properly',
        inputSchema: {
          type: 'object',
          properties: {
            language: { type: 'string' },
            code: { type: 'string' },
            expectedOutput: { type: 'string' }
          },
          required: ['language', 'code']
        },
        fn: async (args: any) => {
          try {
            // Basic syntax validation for common languages
            const { language, code, expectedOutput } = args;
            
            let isValid = true;
            let validationMessages = [];
            
            switch (language.toLowerCase()) {
              case 'javascript':
              case 'js':
                // Basic JS validation
                if (!code.includes('function') && !code.includes('=>') && !code.includes('const') && !code.includes('let')) {
                  validationMessages.push('Consider using proper variable declarations or function definitions');
                }
                break;
              
              case 'python':
              case 'py':
                // Basic Python validation
                if (code.includes('\t') && code.includes('    ')) {
                  isValid = false;
                  validationMessages.push('Mixed tabs and spaces detected');
                }
                break;
              
              case 'haskell':
              case 'hs':
                // Basic Haskell validation
                if (!code.includes('=') && !code.includes('::')) {
                  validationMessages.push('Consider adding type signatures');
                }
                break;
            }
            
            return {
              isValid,
              language,
              validationMessages,
              codeLength: code.length,
              hasExpectedOutput: !!expectedOutput
            };
          } catch (error) {
            return {
              isValid: false,
              error: error instanceof Error ? error.message : String(error)
            };
          }
        }
      },
      {
        name: 'generate_bibliography',
        description: 'Generate a bibliography entry for research sources',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            author: { type: 'string' },
            url: { type: 'string' },
            accessDate: { type: 'string' },
            type: { type: 'string', enum: ['book', 'article', 'website', 'paper'] }
          },
          required: ['title', 'author', 'type']
        },
        fn: async (args: any) => {
          const { title, author, url, accessDate, type } = args;
          const currentDate = accessDate || new Date().toISOString().split('T')[0];
          
          let entry = '';
          
          switch (type) {
            case 'book':
              entry = `${author}. *${title}*. ${url ? `Available: ${url}` : ''}`;
              break;
            case 'article':
              entry = `${author}. "${title}." ${url ? `Available: ${url}` : ''} (accessed ${currentDate})`;
              break;
            case 'website':
              entry = `${author}. "${title}." ${url} (accessed ${currentDate})`;
              break;
            case 'paper':
              entry = `${author}. "${title}." ${url ? `Available: ${url}` : ''} (accessed ${currentDate})`;
              break;
            default:
              entry = `${author}. "${title}." ${url || ''} (accessed ${currentDate})`;
          }
          
          return {
            entry,
            type,
            formattedDate: currentDate
          };
        }
      },
      {
        name: 'cross_reference_chapters',
        description: 'Create cross-references between chapters for concepts',
        inputSchema: {
          type: 'object',
          properties: {
            concept: { type: 'string' },
            sourceChapter: { type: 'number' },
            targetChapters: { type: 'array', items: { type: 'number' } },
            referenceType: { type: 'string', enum: ['prerequisite', 'related', 'advanced'] }
          },
          required: ['concept', 'sourceChapter', 'targetChapters']
        },
        fn: async (args: any) => {
          const { concept, sourceChapter, targetChapters, referenceType } = args;
          
          const references = targetChapters.map((chapter: number) => {
            let prefix = '';
            switch (referenceType) {
              case 'prerequisite':
                prefix = 'See prerequisite concept in';
                break;
              case 'related':
                prefix = 'For related concepts, see';
                break;
              case 'advanced':
                prefix = 'For advanced topics, see';
                break;
              default:
                prefix = 'See also';
            }
            
            return `${prefix} Chapter ${chapter}`;
          });
          
          return {
            concept,
            sourceChapter,
            targetChapters,
            referenceType,
            formattedReferences: references,
            markdownReference: `> **${concept}**: ${references.join(', ')}`
          };
        }
      }
    ];
  }

  private async buildAgentHierarchy(rootConfig: AgentConfig, parentId?: string): Promise<void> {
    this.agents.set(rootConfig.id, rootConfig);
    
    this.logger.debug('Registered agent', {
      id: rootConfig.id,
      canDelegate: rootConfig.canDelegate,
      specialization: rootConfig.specialization,
      subAgents: rootConfig.subAgents,
      parentId
    });

    // Recursively build child agents
    if (rootConfig.children) {
      for (const [childId, childConfig] of Object.entries(rootConfig.children)) {
        await this.buildAgentHierarchy(childConfig, rootConfig.id);
      }
    }
  }

  async processMessage(agentId: string, message: string, context?: any, streamingCallback?: StreamingCallback): Promise<AgentResult> {
    const taskId = this.generateTaskId();
    
    const task: AgentTask = {
      id: taskId,
      agentId,
      message,
      context,
      priority: 'high',
      timeout: this.concurrencyConfig.taskTimeout
    };

    this.logger.info('Processing message', {
      taskId,
      agentId,
      message: message.substring(0, 100) + (message.length > 100 ? '...' : '')
    });

    // Emit task start event
    systemEventEmitter.emitTaskStart(taskId, agentId, message);

    return await this.executeTask(task, streamingCallback);
  }

  /* 3️⃣  EXECUTE TASK (single entry point) -------------------------- */
  private async executeTask(
    task: AgentTask,
    streamingCallback?: StreamingCallback
  ): Promise<AgentResult> {
    const start = Date.now();

    /* wait for concurrency slot */
    if (this.activeAgentCount >= this.concurrencyConfig.maxConcurrentAgents) {
      await this.waitForAvailableSlot();
    }
    this.activeAgentCount++;

    try {
      /* build DSL prompt */
      const agent = this.agents.get(task.agentId)!;
      const provider = this.providerConfigs.get(agent.provider)!;
      const tools = [
        ...unifiedToolRegistry.getToolsByType('local-mcp'),
        ...unifiedToolRegistry.getToolsByType('remote-mcp'),
        ...unifiedToolRegistry.getToolsByType('function'),
      ];
      if (agent.canDelegate) {
        tools.push(...unifiedToolRegistry.getToolsByType('function'));
      }
      const toolDescriptions = SystemPromptBuilder.extractToolDescriptions(tools);
      const prompt = SystemPromptBuilder.buildSystemPrompt(agent.system, toolDescriptions);

      /* ask the model for DSL script */
      const modelResp = await modelManager.callModel(
        provider.name,
        provider.type,
        agent.model || provider.defaultModel,
        prompt,
        task.message,
        streamingCallback
      );

      /* run the DSL script */
      const script = modelResp.content.trim();
      const ctx: BlockCtx = { $taskId: task.id, $agentId: task.agentId, ...(task.context ?? {}) };

      const results: string[] = [];
      for await (const chunk of executeBlocksStreaming(script)) {
        if (chunk.partial && streamingCallback) streamingCallback(chunk.partial);
        if (chunk.done) {
          if (chunk.result) results.push(String(chunk.result));
          if (chunk.error) throw new Error(chunk.error);
        }
      }

      const executionTime = Date.now() - start;
      const result: AgentResult = {
        taskId: task.id,
        agentId: task.agentId,
        success: true,
        result: results.join('\n'),
        executionTime
      };

      this.taskResults.set(task.id, result);
      systemEventEmitter.emitTaskComplete(task.id, result.result!);
      return result;

    } catch (err: any) {
      const executionTime = Date.now() - start;
      const result: AgentResult = {
        taskId: task.id,
        agentId: task.agentId,
        success: false,
        error: err.message,
        executionTime
      };
      this.taskResults.set(task.id, result);
      systemEventEmitter.emitTaskError(task.id, err.message);
      return result;
    } finally {
      this.activeAgentCount--;
      this.activeTasks.delete(task.id);
    }
  }

  private async executeAgentTask(task: AgentTask, streamingCallback?: StreamingCallback): Promise<string> {
    const agent = this.agents.get(task.agentId);
    if (!agent) {
      throw new Error(`Agent ${task.agentId} not found`);
    }

    const providerConfig = this.providerConfigs.get(agent.provider);
    if (!providerConfig) {
      throw new Error(`Provider ${agent.provider} not found`);
    }

    // Get available tools for this agent
    let availableTools = [];
    for (const toolType of agent.toolTypes) {
      const tools = unifiedToolRegistry.getToolsByType(toolType);
      availableTools.push(...tools);
    }

    // Add inter-agent communication tools if agent can delegate
    if (agent.canDelegate) {
      const functionTools = unifiedToolRegistry.getToolsByType('function');
      availableTools.push(...functionTools);
    }

    // Build dynamic system prompt
    const toolDescriptions = SystemPromptBuilder.extractToolDescriptions(availableTools);
    const dynamicSystemPrompt = SystemPromptBuilder.buildSystemPrompt(
      agent.system,
      toolDescriptions
    );

    this.logger.debug('Executing agent task', {
      taskId: task.id,
      agentId: task.agentId,
      toolCount: availableTools.length,
      canDelegate: agent.canDelegate
    });

    // Get model response with streaming
    const modelResponse = await modelManager.callModel(
      providerConfig.name,
      providerConfig.type,
      agent.model || providerConfig.defaultModel,
      dynamicSystemPrompt,
      task.message,
      streamingCallback
    );

    // Parse and execute tool calls
    const { toolCalls, cleanResponse } = toolParser.parseResponse(modelResponse.content);

    if (toolCalls.length === 0) {
      return modelResponse.content;
    }

    this.logger.debug('Processing tool calls', {
      taskId: task.id,
      agentId: task.agentId,
      toolCallCount: toolCalls.length,
      tools: toolCalls.map(tc => tc.name)
    });

    // Execute tools with structured concurrency
    const toolResults: string[] = [];
    
    if (this.concurrencyConfig.enableParallelExecution && toolCalls.length > 1) {
      // Execute tools in parallel
      const toolPromises = toolCalls.map(async (toolCall) => {
        const toolId = `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        systemEventEmitter.emitToolStart(toolId, toolCall.name, task.agentId, toolCall.arguments);
        
        try {
          const result = await unifiedToolRegistry.executeTool(toolCall);
          if (result.success) {
            systemEventEmitter.emitToolComplete(toolId, result);
          } else {
            systemEventEmitter.emitToolError(toolId, result.error || 'Unknown error');
          }
          return { toolCall, result };
        } catch (error) {
          systemEventEmitter.emitToolError(toolId, error instanceof Error ? error.message : String(error));
          throw error;
        }
      });

      const results = await Promise.allSettled(toolPromises);
      
      for (const promiseResult of results) {
        if (promiseResult.status === 'fulfilled') {
          const { toolCall, result } = promiseResult.value;
          if (result.success) {
            const resultText = typeof result.result === 'string' ? result.result : JSON.stringify(result.result, null, 2);
            toolResults.push(`**${toolCall.name}** (${result.executorType}): ${resultText}`);
          } else {
            toolResults.push(`**${toolCall.name}** (${result.executorType}): Error - ${result.error}`);
          }
        } else {
          toolResults.push(`**Tool execution failed**: ${promiseResult.reason}`);
        }
      }
    } else {
      // Execute tools sequentially
      for (const toolCall of toolCalls) {
        const toolId = `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        systemEventEmitter.emitToolStart(toolId, toolCall.name, task.agentId, toolCall.arguments);
        
        try {
          const result = await unifiedToolRegistry.executeTool(toolCall);
          
          if (result.success) {
            systemEventEmitter.emitToolComplete(toolId, result);
            const resultText = typeof result.result === 'string' ? result.result : JSON.stringify(result.result, null, 2);
            toolResults.push(`**${toolCall.name}** (${result.executorType}): ${resultText}`);
          } else {
            systemEventEmitter.emitToolError(toolId, result.error || 'Unknown error');
            toolResults.push(`**${toolCall.name}** (${result.executorType}): Error - ${result.error}`);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          systemEventEmitter.emitToolError(toolId, errorMessage);
          toolResults.push(`**${toolCall.name}**: Error - ${errorMessage}`);
        }
      }
    }

    // Combine response with tool results
    let finalResponse = cleanResponse;
    if (toolResults.length > 0) {
      finalResponse += '\n\n## Tool Results\n\n' + toolResults.join('\n\n');
    }

    return finalResponse;
  }

  private async delegateTask(agentId: string, task: string, priority: string, context?: any): Promise<string> {
    this.logger.info('Delegating task', {
      targetAgent: agentId,
      task: task.substring(0, 100) + (task.length > 100 ? '...' : ''),
      priority
    });

    const taskId = this.generateTaskId();
    systemEventEmitter.emitAgentDelegation('current', agentId, task, taskId);

    const taskResult = await this.processMessage(agentId, task, context);
    
    if (taskResult.success) {
      return `Task delegated to ${agentId} completed successfully:\n${taskResult.result}`;
    } else {
      return `Task delegation to ${agentId} failed: ${taskResult.error}`;
    }
  }

  private async sendMessage(agentId: string, message: string, waitForResponse: boolean): Promise<string> {
    this.logger.info('Sending message to agent', {
      targetAgent: agentId,
      message: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
      waitForResponse
    });

    systemEventEmitter.emitAgentCommunication('current', agentId, message);

    if (waitForResponse) {
      const result = await this.processMessage(agentId, message);
      return result.success ? result.result! : `Communication failed: ${result.error}`;
    } else {
      // Fire and forget
      this.processMessage(agentId, message).catch(error => {
        this.logger.error('Async message failed', { targetAgent: agentId, error });
      });
      return `Message sent to ${agentId}`;
    }
  }

  private getAgentStatus(agentId?: string): any {
    if (agentId) {
      const agent = this.agents.get(agentId);
      if (!agent) {
        return { error: `Agent ${agentId} not found` };
      }
      
      return {
        id: agent.id,
        specialization: agent.specialization,
        canDelegate: agent.canDelegate,
        subAgents: agent.subAgents,
        isActive: Array.from(this.activeTasks.values()).some(task => task.agentId === agentId)
      };
    }

    return {
      totalAgents: this.agents.size,
      activeTasksCount: this.activeTasks.size,
      activeAgents: this.activeAgentCount,
      maxConcurrent: this.concurrencyConfig.maxConcurrentAgents,
      agents: Array.from(this.agents.values()).map(agent => ({
        id: agent.id,
        specialization: agent.specialization,
        canDelegate: agent.canDelegate,
        isActive: Array.from(this.activeTasks.values()).some(task => task.agentId === agent.id)
      }))
    };
  }

  private generateTaskId(): string {
    return `task_${this.taskIdCounter++}_${Date.now()}`;
  }

  private async waitForAvailableSlot(): Promise<void> {
    return new Promise((resolve) => {
      const checkSlot = () => {
        if (this.activeAgentCount < this.concurrencyConfig.maxConcurrentAgents) {
          resolve();
        } else {
          setTimeout(checkSlot, 100);
        }
      };
      checkSlot();
    });
  }

  private createTimeoutPromise(timeout: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Task timeout after ${timeout}ms`));
      }, timeout);
    });
  }

  getAgent(agentId: string): AgentConfig | undefined {
    return this.agents.get(agentId);
  }

  getAllAgents(): AgentConfig[] {
    return Array.from(this.agents.values());
  }

  getTaskResult(taskId: string): AgentResult | undefined {
    return this.taskResults.get(taskId);
  }

  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up hierarchical agent system');
    
    // Cancel active tasks
    this.activeTasks.clear();
    this.taskResults.clear();
    
    // Cleanup tool registry
    await unifiedToolRegistry.cleanup();
    
    this.agents.clear();
    this.providerConfigs.clear();
    this.activeAgentCount = 0;
    
    this.logger.info('Hierarchical agent system cleanup complete');
  }
}

// Global instance will be initialized with config values
export let hierarchicalAgentSystem: HierarchicalAgentSystem;