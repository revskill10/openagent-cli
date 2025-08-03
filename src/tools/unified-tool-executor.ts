// src/tools/unified-tool-executor.ts
import { ToolCall, ToolDefinition } from './base-executor.js';
import { unifiedToolRegistry } from './unified-tool-registry.js';
import { systemEventEmitter } from '../system-events.js';

export interface UnifiedToolExecutionContext {
  timeout?: number;
  retries?: number;
}

export interface ToolResult {
  toolCall: ToolCall;
  result?: any;
  error?: string;
  executionTime: number;
}

export interface StreamingToolResult extends ToolResult {
  partial?: any;          // incremental chunk
  done?: boolean;         // true when finished
}

/**
 * Unified **Streaming** Tool Executor
 */
export class UnifiedToolExecutor {
  /* ------------------------------------------------------------------ */
  /* 1️⃣  Execute ONE tool with streaming                               */
  /* ------------------------------------------------------------------ */
  async *executeToolCallStreaming(
    toolCall: ToolCall,
    context: UnifiedToolExecutionContext = {}
  ): AsyncGenerator<StreamingToolResult, void, unknown> {
    const startTime = Date.now();
    const toolId = `tool_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    try {
      const tool = unifiedToolRegistry.getTool(toolCall.name);
      if (!tool) {
        yield {
          toolCall,
          result: null,
          error: `Tool '${toolCall.name}' not found`,
          executionTime: Date.now() - startTime,
          done: true,
        };
        return;
      }

      // Emit start event
      systemEventEmitter.emitToolStart(toolId, toolCall.name, 'executor', toolCall.arguments);

      console.log(`🔧 Executing ${toolCall.name}`);

      // Route to correct executor via unified tool registry
      const result = await unifiedToolRegistry.executeTool(toolCall);
      
      console.log(`🎯 Tool execution result:`, result);
      
      yield {
        toolCall,
        result: result.success ? result.result : null,
        error: result.success ? undefined : result.error,
        executionTime: Date.now() - startTime,
        done: true,
      };

      systemEventEmitter.emitToolComplete(toolId, { toolCall });
    } catch (err: any) {
      systemEventEmitter.emitToolError(toolId, err.message);
      yield {
        toolCall,
        result: null,
        error: err.message,
        executionTime: Date.now() - startTime,
        done: true,
      };
    }
  }

  /* ------------------------------------------------------------------ */
  /* 2️⃣  Execute MANY tools with **concurrent streaming**               */
  /* ------------------------------------------------------------------ */
  async *executeToolCallsStreaming(
    toolCalls: ToolCall[],
    context: UnifiedToolExecutionContext = {}
  ): AsyncGenerator<StreamingToolResult, void, unknown> {
    const generators = toolCalls.map(tc => this.executeToolCallStreaming(tc, context));

    // Merge async iterators in arrival order
    const promises = generators.map(async function* (gen) {
      for await (const item of gen) yield item;
    });
    for await (const item of this.mergeAsyncIterators(promises)) {
      yield item;
    }
  }

  /* ------------------------------------------------------------------ */
  /* 3️⃣  Legacy non-streaming wrappers (backward compatible)            */
  /* ------------------------------------------------------------------ */
  async executeToolCall(
    toolCall: ToolCall,
    context: UnifiedToolExecutionContext = {}
  ): Promise<ToolResult> {
    const chunks: any[] = [];
    for await (const chunk of this.executeToolCallStreaming(toolCall, context)) {
      if (chunk.result) chunks.push(chunk.result);
      if (chunk.done) return chunk;
    }
    return {
      toolCall,
      result: chunks.length === 1 ? chunks[0] : chunks,
      executionTime: 0,
    };
  }

  async executeToolCalls(
    toolCalls: ToolCall[],
    context: UnifiedToolExecutionContext = {}
  ): Promise<ToolResult[]> {
    const results: ToolResult[] = [];
    for await (const res of this.executeToolCallsStreaming(toolCalls, context)) {
      if (res.done) results.push(res);
    }
    return results;
  }

  /* ------------------------------------------------------------------ */
  /* 4️⃣  Helpers                                                        */
  /* ------------------------------------------------------------------ */
  private async singleShot(tool: ToolDefinition, toolCall: ToolCall, ctx: UnifiedToolExecutionContext) {
    // retry loop (simple)
    let attempt = 0;
    const retries = ctx.retries ?? 0;
    while (attempt <= retries) {
      try {
        if (tool.source.type === 'local') {
          if (!tool.client) throw new Error('MCP client missing');
          return (await tool.client.callTool(toolCall)).content;
        }
        if (tool.handler) {
          return await tool.handler(toolCall.arguments);
        }
        return { content: [{ type: 'text', text: 'Remote fallback' }] };
      } catch (err) {
        if (attempt === retries) throw err;
        attempt++;
      }
    }
    throw new Error('Max retries exceeded');
  }

  private async* mergeAsyncIterators<T>(
    iterators: AsyncIterable<T>[]
  ): AsyncIterable<T> {
    const its = iterators.map(it => it[Symbol.asyncIterator]());
    const nextPromises = its.map((it, idx) =>
      it.next().then(res => ({ idx, res }))
    );
    while (nextPromises.length) {
      const { idx, res } = await Promise.race(nextPromises);
      if (!res.done) {
        yield res.value;
        nextPromises[idx] = its[idx]!.next().then(r => ({ idx, res: r }));
      } else {
        nextPromises.splice(idx, 1);
        its.splice(idx, 1);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* 5️⃣  Tool introspection (unchanged)                                */
  /* ------------------------------------------------------------------ */
  getAvailableTools(): ToolDefinition[] {
    return unifiedToolRegistry.getAllTools();
  }
  getToolsBySource(sourceType: 'local' | 'remote'): ToolDefinition[] {
    return unifiedToolRegistry.getToolsByType(sourceType === 'local' ? 'local-mcp' : 'remote-mcp');
  }
  async refreshTools(): Promise<void> {
    await unifiedToolRegistry.refreshToolCatalog();
  }
}

export const unifiedToolExecutor = new UnifiedToolExecutor();