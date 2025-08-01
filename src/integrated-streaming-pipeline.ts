// integrated-streaming-pipeline.ts - Complete streaming pipeline with AI parsing and concurrent execution
import { streamingAIParser, StreamingParseResult } from './streaming-ai-parser.js';
import { concurrentStreamingExecutor, ConcurrentStreamingResult } from './concurrent-streaming-executor.js';
import { UserInputHandler } from './interactive-block-executor.js';
import { systemEventEmitter } from './system-events.js';

export interface StreamingPipelineResult {
  id: string;
  source: 'ai_parser' | 'tool_executor' | 'pipeline' | 'user_input';
  type: 'ai_content' | 'block_parsed' | 'tool_start' | 'tool_progress' | 'tool_complete' | 'error' | 'prompt_needed';
  timestamp: number;
  
  // AI parsing results
  aiContent?: string;
  block?: any;
  
  // Tool execution results  
  toolName?: string;
  toolResult?: any;
  executionTime?: number;
  
  // Error information
  error?: string;
  
  // User input prompts
  promptDefinition?: any;
  
  // Pipeline metadata
  pipelineStats?: {
    activeAIParsing: boolean;
    activeToolExecutions: number;
    queuedToolExecutions: number;
    completedBlocks: number;
    totalExecutionTime: number;
  };
}

export interface PipelineOptions {
  inputHandler?: UserInputHandler;
  maxConcurrentTools?: number;
  enableRealTimeDisplay?: boolean;
  persistExecution?: boolean;
  executionTimeout?: number;
}

/**
 * Integrated streaming pipeline that processes AI responses linearly
 * while executing tool requests concurrently with real-time result streaming
 */
export class IntegratedStreamingPipeline {
  private pipelineId = 0;
  private activePipelines = new Map<string, PipelineState>();
  
  /**
   * Process streaming AI response with concurrent tool execution
   */
  async *processAIStreamWithConcurrentExecution(
    aiResponseStream: AsyncIterable<string>,
    options: PipelineOptions = {}
  ): AsyncGenerator<StreamingPipelineResult, void, unknown> {
    const pipelineId = `pipeline_${++this.pipelineId}_${Date.now()}`;
    const startTime = Date.now();
    
    const state: PipelineState = {
      id: pipelineId,
      startTime,
      aiParsingActive: true,
      completedBlocks: 0,
      totalExecutionTime: 0,
      results: []
    };
    
    this.activePipelines.set(pipelineId, state);
    
    try {
      systemEventEmitter.emitTaskStart(pipelineId, 'streaming-pipeline', 'Processing AI stream with concurrent execution');
      
      // Create concurrent streams for AI parsing and tool execution
      const aiParsingStream = streamingAIParser.processStreamingResponse(aiResponseStream, {
        inputHandler: options.inputHandler,
        maxConcurrentBlocks: options.maxConcurrentTools || 5,
        executionTimeout: options.executionTimeout,
        persistExecution: options.persistExecution
      });
      
      const toolExecutions = new Map<string, AsyncGenerator<ConcurrentStreamingResult, void, unknown>>();
      
      // Process AI parsing results and start tool executions concurrently
      for await (const parseResult of aiParsingStream) {
        state.aiParsingActive = true;
        
        // Handle different types of parsing results
        switch (parseResult.type) {
          case 'partial_block':
            // Stream AI content in real-time
            if (options.enableRealTimeDisplay && parseResult.partialContent) {
              yield {
                id: `${pipelineId}_ai_content_${Date.now()}`,
                source: 'ai_parser',
                type: 'ai_content',
                timestamp: Date.now(),
                aiContent: parseResult.partialContent,
                pipelineStats: this.getPipelineStats(state)
              };
            }
            break;
            
          case 'complete_block':
            // Block successfully parsed
            state.completedBlocks++;
            
            yield {
              id: `${pipelineId}_block_${Date.now()}`,
              source: 'ai_parser', 
              type: 'block_parsed',
              timestamp: Date.now(),
              block: parseResult.block,
              pipelineStats: this.getPipelineStats(state)
            };
            
            // Start concurrent execution if it's a tool block
            if (parseResult.block && this.isExecutableBlock(parseResult.block)) {
              const executionId = parseResult.executionId || `exec_${Date.now()}`;
              // Tool execution is handled internally by the AI parser
            }
            break;
            
          case 'execution_result':
            // Tool execution result from concurrent execution
            if (parseResult.executionResult) {
              const result = parseResult.executionResult;
              
              if (result.promptNeeded) {
                yield {
                  id: `${pipelineId}_prompt_${Date.now()}`,
                  source: 'pipeline',
                  type: 'prompt_needed',
                  timestamp: Date.now(),
                  promptDefinition: result.promptNeeded,
                  pipelineStats: this.getPipelineStats(state)
                };
              } else if (result.error) {
                yield {
                  id: `${pipelineId}_error_${Date.now()}`,
                  source: 'tool_executor',
                  type: 'error',
                  timestamp: Date.now(),
                  error: result.error,
                  pipelineStats: this.getPipelineStats(state)
                };
              } else if (result.done && result.result) {
                yield {
                  id: `${pipelineId}_tool_complete_${Date.now()}`,
                  source: 'tool_executor',
                  type: 'tool_complete',
                  timestamp: Date.now(),
                  toolName: result.tool,
                  toolResult: result.result,
                  executionTime: result.executionTime,
                  pipelineStats: this.getPipelineStats(state)
                };
              } else if (result.partial) {
                yield {
                  id: `${pipelineId}_tool_progress_${Date.now()}`,
                  source: 'tool_executor',
                  type: 'tool_progress',
                  timestamp: Date.now(),
                  toolName: result.tool,
                  toolResult: result.partial,
                  pipelineStats: this.getPipelineStats(state)
                };
              }
            }
            break;
            
          case 'error':
            yield {
              id: `${pipelineId}_parse_error_${Date.now()}`,
              source: 'ai_parser',
              type: 'error',
              timestamp: Date.now(),
              error: parseResult.error,
              pipelineStats: this.getPipelineStats(state)
            };
            break;
        }
      }
      
      // AI parsing completed
      state.aiParsingActive = false;
      state.totalExecutionTime = Date.now() - startTime;
      
      // Final pipeline stats
      yield {
        id: `${pipelineId}_complete`,
        source: 'pipeline',
        type: 'tool_complete',
        timestamp: Date.now(),
        pipelineStats: this.getPipelineStats(state)
      };
      
      systemEventEmitter.emitTaskComplete(pipelineId, {
        completedBlocks: state.completedBlocks,
        totalExecutionTime: state.totalExecutionTime
      });
      
    } catch (error) {
      systemEventEmitter.emitTaskError(pipelineId, error instanceof Error ? error.message : String(error));
      
      yield {
        id: `${pipelineId}_pipeline_error`,
        source: 'pipeline',
        type: 'error',
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : String(error),
        pipelineStats: this.getPipelineStats(state)
      };
    } finally {
      this.activePipelines.delete(pipelineId);
    }
  }
  
  /**
   * Process AI response from LLM with streaming execution
   */
  async *processLLMResponse(
    llmStream: AsyncIterable<{ content: string; done?: boolean }>,
    options: PipelineOptions = {}
  ): AsyncGenerator<StreamingPipelineResult, void, unknown> {
    // Convert LLM stream format to string stream
    const aiResponseStream = this.convertLLMStream(llmStream);
    
    // Process with the integrated pipeline
    yield* this.processAIStreamWithConcurrentExecution(aiResponseStream, options);
  }
  
  /**
   * Create a mock AI response stream for testing
   */
  async *createMockAIStream(responses: string[]): AsyncIterable<string> {
    for (const response of responses) {
      // Simulate streaming by yielding character by character
      for (let i = 0; i < response.length; i++) {
        yield response.slice(0, i + 1);
        // Small delay to simulate real streaming
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      yield '\n';
    }
  }
  
  private async *convertLLMStream(
    llmStream: AsyncIterable<{ content: string; done?: boolean }>
  ): AsyncIterable<string> {
    let buffer = '';
    
    for await (const chunk of llmStream) {
      buffer += chunk.content;
      yield chunk.content;
      
      if (chunk.done) {
        break;
      }
    }
  }
  
  private isExecutableBlock(block: any): boolean {
    return block && (
      block.type === 'TOOL' ||
      block.type === 'SEQUENTIAL' ||
      block.type === 'PARALLEL' ||
      block.type === 'PROMPT'
    );
  }
  
  private getPipelineStats(state: PipelineState): StreamingPipelineResult['pipelineStats'] {
    return {
      activeAIParsing: state.aiParsingActive,
      activeToolExecutions: 0, // Would be tracked from concurrent executor
      queuedToolExecutions: 0,  // Would be tracked from concurrent executor
      completedBlocks: state.completedBlocks,
      totalExecutionTime: Date.now() - state.startTime
    };
  }
  
  /**
   * Get status of all active pipelines
   */
  getActivePipelines(): Array<{
    id: string;
    startTime: number;
    duration: number;
    completedBlocks: number;
    aiParsingActive: boolean;
  }> {
    return Array.from(this.activePipelines.values()).map(state => ({
      id: state.id,
      startTime: state.startTime,
      duration: Date.now() - state.startTime,
      completedBlocks: state.completedBlocks,
      aiParsingActive: state.aiParsingActive
    }));
  }
}

interface PipelineState {
  id: string;
  startTime: number;
  aiParsingActive: boolean;
  completedBlocks: number;
  totalExecutionTime: number;
  results: any[];
}

export const integratedStreamingPipeline = new IntegratedStreamingPipeline();