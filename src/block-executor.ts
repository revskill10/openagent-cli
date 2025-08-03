// block-interpreter.ts
import { unifiedToolExecutor } from './tools/unified-tool-executor.js';
import { validatingToolExecutor, ValidationError } from './tools/validating-tool-executor.js';
import { systemEventEmitter } from './system-events.js';
import { PromptDefinition, ToolApprovalPrompt } from './simple-tools.js';
import { UserInputHandler } from './interactive-block-executor.js';

export type BlockResult = {
  id: string;
  tool?: string;
  partial?: any;
  result?: any;
  error?: string;
  done: boolean;
  promptNeeded?: PromptDefinition;
  validationError?: ValidationError;
  toolApprovalNeeded?: ToolApprovalPrompt;
};

/* ------------------------------------------------------------------ */
/* 1️⃣  Public entry                                                   */
/* ------------------------------------------------------------------ */
export async function* executeBlocksStreaming(
  script: string, 
  inputHandler?: UserInputHandler
): AsyncGenerator<BlockResult, void, unknown> {
  const root = parseTopLevel(script.trim());
  const ctx: Record<string, { doneP: Promise<void>; value: any }> = {};
  yield* executeNode(root, ctx, inputHandler);
}

/* ------------------------------------------------------------------ */
/* 2️⃣  AST                                                            */
/* ------------------------------------------------------------------ */
type Node =
  | { type: 'sequential'; steps: Step[] }
  | { type: 'parallel';   steps: Step[] }
  | { type: 'if';         cond: string; body: Node }
  | { type: 'while';      cond: string; body: Node }
  | { type: 'assign';     variable: string; expression: string }
  | { type: 'prompt';     prompt: PromptDefinition }
  | { type: 'tool';       step: Step };

interface Step {
  id: string;
  tool: string;
  params: any;
  after?: string[];
  retry?: number;
  timeout?: number;
}

/* ------------------------------------------------------------------ */
/* 3️⃣  Safe JSON extractor                                            */
/* ------------------------------------------------------------------ */
function extractJSON(src: string, tagStart: string, tagEnd: string): {json: any, end: number} | null {
  const start = src.indexOf(tagStart);
  if (start === -1) return null;
  const bodyStart = start + tagStart.length;
  const end = src.indexOf(tagEnd, bodyStart);
  if (end === -1) return null;
  try {
    const json = JSON.parse(src.slice(bodyStart, end).trim());
    return { json, end: end + tagEnd.length };
  } catch {
    return null;
  }
}

function parseTopLevel(src: string): Node {
  src = src.trim();
  let m;

  if ((m = extractJSON(src, '[SEQUENTIAL]', '[END_SEQUENTIAL]'))) {
    return { type: 'sequential', steps: m.json.steps || m.json };
  }
  if ((m = extractJSON(src, '[PARALLEL]', '[END_PARALLEL]'))) {
    return { type: 'parallel', steps: Array.isArray(m.json) ? m.json : m.json.steps || [] };
  }
  if ((m = /\[IF\]\s*(.*?)\n([\s\S]*?)\[END_IF\]/.exec(src))) {
    return { type: 'if', cond: m[1].trim(), body: parseTopLevel(m[2].trim()) };
  }
  if ((m = /\[WHILE\]\s*(.*?)\n([\s\S]*?)\[END_WHILE\]/.exec(src))) {
    return { type: 'while', cond: m[1].trim(), body: parseTopLevel(m[2].trim()) };
  }
  if ((m = /\[ASSIGN\]\s*([^=]+)\s*=\s*([\s\S]*?)\[END_ASSIGN\]/.exec(src))) {
    return { type: 'assign', variable: m[1].trim(), expression: m[2].trim() };
  }
  if ((m = extractJSON(src, '[PROMPT]', '[END_PROMPT]'))) {
    return { type: 'prompt', prompt: m.json };
  }
  if ((m = extractJSON(src, '[TOOL_REQUEST]', '[END_TOOL_REQUEST]'))) {
    return { type: 'tool', step: m.json };
  }
  throw new Error('Unrecognised block');
}

/* ------------------------------------------------------------------ */
/* 4️⃣  Executor                                                       */
/* ------------------------------------------------------------------ */
async function* executeNode(node: Node, ctx: Record<string, any>, inputHandler?: UserInputHandler): AsyncGenerator<BlockResult, void, unknown> {
  switch (node.type) {
    case 'sequential': {
      for (const step of node.steps) {
        yield* executeStep(step, ctx, inputHandler);
      }
      break;
    }
    case 'parallel': {
      const gens = node.steps.map(s => executeStep(s, ctx, inputHandler));
      for await (const chunk of mergeAsyncIterators(gens)) yield chunk;
      break;
    }
    case 'if': {
      if (evalExpr(node.cond, ctx)) yield* executeNode(node.body, ctx, inputHandler);
      break;
    }
    case 'while': {
      while (evalExpr(node.cond, ctx)) yield* executeNode(node.body, ctx, inputHandler);
      break;
    }
    case 'assign': {
      const value = evalExpression(node.expression, ctx);
      ctx[node.variable] = { value, doneP: Promise.resolve() };
      yield { id: `assign_${Date.now()}`, result: value, done: true };
      break;
    }
    case 'prompt': {
      yield { 
        id: `prompt_${Date.now()}`, 
        promptNeeded: node.prompt, 
        done: false 
      };
      break;
    }
    case 'tool': {
      yield* executeStep(node.step, ctx, inputHandler);
      break;
    }
  }
}

async function* executeStep(step: Step, ctx: Record<string, any>, inputHandler?: UserInputHandler): AsyncGenerator<BlockResult, void, unknown> {
  /* 1. wait for dependencies */
  if (step.after?.length) {
    await Promise.all(step.after.map(id => ctx[id]?.doneP));
  }

  /* 2. substitute variables */
  const params = substituteVars(step.params, ctx);

  /* 3. retry / timeout wrapper */
  const maxRetries = step.retry ?? 0;
  const timeoutMs  = step.timeout ?? 30000;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const toolCall = { name: step.tool, arguments: params };
      let timeoutHandle: NodeJS.Timeout | null = null;
      let completed = false;

      // Check if user approval is needed for tool execution
      if (inputHandler?.handleToolApproval) {
        const approvalPrompt: ToolApprovalPrompt = {
          id: `approval_${step.id}_${Date.now()}`,
          type: 'tool_approval',
          toolName: step.tool,
          toolParams: params,
          message: `Do you want to execute the tool "${step.tool}" with the following parameters?\n${JSON.stringify(params, null, 2)}`,
          options: [
            { label: 'Approve', value: 'approve' },
            { label: 'Reject', value: 'reject' },
            { label: 'Modify', value: 'modify' }
          ]
        };

        // Yield approval prompt and wait for user response
        yield {
          id: step.id,
          toolApprovalNeeded: approvalPrompt,
          done: false
        };

        try {
          const approvalResponse = await inputHandler.handleToolApproval(approvalPrompt);

          if (approvalResponse === 'reject') {
            yield {
              id: step.id,
              tool: step.tool,
              result: 'Tool execution rejected by user',
              done: true
            };
            return;
          }

          if (approvalResponse === 'modify') {
            // For now, just proceed - modification would need additional UI
            console.log('Tool modification requested but not implemented yet');
          }

          // Continue with execution if approved
        } catch (error) {
          yield {
            id: step.id,
            tool: step.tool,
            error: `Tool approval failed: ${error}`,
            done: true
          };
          return;
        }
      }

      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error('timeout')), timeoutMs);
      });

      try {
        // Use validating executor if input handler is available, otherwise fallback to basic executor
        const executor = inputHandler ? validatingToolExecutor : unifiedToolExecutor;
        
        if (inputHandler) {
          // Use validating executor with user correction capability
          for await (const chunk of validatingToolExecutor.executeToolCallWithValidation(
            toolCall, 
            { 
              inputHandler, 
              enableValidationPrompts: true,
              maxValidationRetries: 3 
            }
          )) {
            if (completed) break;
            
            if ('type' in chunk && chunk.type === 'validation_error') {
              // Yield validation error for UI to handle
              yield { 
                id: step.id, 
                tool: step.tool, 
                validationError: chunk,
                done: false 
              };
              continue;
            }
            
            yield { id: step.id, tool: step.tool, partial: chunk.result, done: false };
            if (chunk.done) {
              completed = true;
              ctx[step.id] = { value: chunk.result, doneP: Promise.resolve() };
              yield { id: step.id, tool: step.tool, result: chunk.result, done: true };
              break;
            }
          }
        } else {
          // Use basic executor for backward compatibility
          for await (const chunk of unifiedToolExecutor.executeToolCallStreaming(toolCall)) {
            if (completed) break;
            yield { id: step.id, tool: step.tool, partial: chunk.result, done: false };
            if (chunk.done) {
              completed = true;
              ctx[step.id] = { value: chunk.result, doneP: Promise.resolve() };
              yield { id: step.id, tool: step.tool, result: chunk.result, done: true };
              break;
            }
          }
        }
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
      }
      
      if (completed) return;
    } catch (err) {
      if (attempt === maxRetries) {
        yield { id: step.id, tool: step.tool, error: String(err), done: true };
        return;
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* 5️⃣  Helpers                                                        */
/* ------------------------------------------------------------------ */
function substituteVars(obj: any, ctx: Record<string, any>): any {
  if (typeof obj === 'string') {
    return obj.replace(/\$\{([^}]+)\}/g, (_, path) => {
      const keys = path.split('.');
      let v = ctx[keys[0]]?.value;
      for (let i = 1; i < keys.length; i++) v = v?.[keys[i]];
      if (v === undefined) throw new Error(`Variable ${path} not found`);
      return v;
    });
  }
  if (Array.isArray(obj)) return obj.map(v => substituteVars(v, ctx));
  if (obj && typeof obj === 'object') {
    const out: any = {};
    for (const [k, v] of Object.entries(obj)) out[k] = substituteVars(v, ctx);
    return out;
  }
  return obj;
}

function evalExpr(expr: string, ctx: Record<string, any>): boolean {
  try {
    // whitelist-safe subset: numbers, strings, ${var}, ===, !==, >, <, &&, ||
    const code = expr
      .replace(/\$\{([^}]+)\}/g, (_, path) => {
        const keys = path.split('.');
        let v = ctx[keys[0]]?.value;
        for (let i = 1; i < keys.length; i++) {
          if (v === null || v === undefined) break;
          v = v[keys[i]];
        }
        return JSON.stringify(v);
      })
      .replace(/[^$\w\s=!<>&|()"'[\]\d.]/g, ''); // strip dangerous chars
    // eslint-disable-next-line no-new-func
    return new Function(`return (${code})`)();
  } catch {
    return false;
  }
}

function evalExpression(expr: string, ctx: Record<string, any>): any {
  try {
    // For assignments, support more complex expressions
    const substituted = expr.replace(/\$\{([^}]+)\}/g, (_, path) => {
      const keys = path.split('.');
      let v = ctx[keys[0]]?.value;
      for (let i = 1; i < keys.length; i++) {
        if (v === null || v === undefined) break;
        v = v[keys[i]];
      }
      return JSON.stringify(v);
    });
    
    // Try to parse as JSON first
    try {
      return JSON.parse(substituted);
    } catch {
      // If not JSON, try to evaluate as expression
      // eslint-disable-next-line no-new-func
      return new Function(`return (${substituted})`)();
    }
  } catch {
    return expr; // fallback to original string
  }
}

async function* mergeAsyncIterators<T>(iters: AsyncIterable<T>[]): AsyncIterable<T> {
  const its = iters.map(i => i[Symbol.asyncIterator]());
  const nexts = its.map((it, idx) => it.next().then(r => ({ idx, r })));
  while (nexts.length) {
    const { idx, r } = await Promise.race(nexts);
    if (!r.done) {
      yield r.value;
      nexts[idx] = its[idx]!.next().then(r2 => ({ idx, r: r2 }));
    } else {
      nexts.splice(idx, 1);
      its.splice(idx, 1);
    }
  }
}