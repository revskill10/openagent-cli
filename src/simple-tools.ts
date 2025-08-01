export interface ToolCall {
  name: string;
  arguments: any;
}

/* ---------- NEW: high-level block AST ----------------------------- */
export type Block =
  | { type: 'SEQUENTIAL'; steps: Step[] }
  | { type: 'PARALLEL';   steps: Step[] }
  | { type: 'IF';         cond: string; body: Block }
  | { type: 'WHILE';      cond: string; body: Block }
  | { type: 'ASSIGN';     variable: string; expression: string }
  | { type: 'PROMPT';     prompt: PromptDefinition }
  | { type: 'TOOL';       step: Step };

export interface PromptDefinition {
  id: string;
  type: 'text' | 'select' | 'confirm' | 'number';
  message: string;
  variable: string;
  options?: Array<{ label: string; value: any }>;
  default?: any;
  required?: boolean;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    message?: string;
  };
}

export interface Step {
  id: string;
  tool: string;
  params: any;
  after?: string[];
  retry?: number;
  timeout?: number;
}

/* ---------- Streaming Token --------------------------------------- */
export type ParseToken =
  | { kind: 'block'; block: Block }
  | { kind: 'error'; message: string };

/* ---------- NEW: streaming parser --------------------------------- */
export class BlockParser {
  /** Public helper: returns an async iterable of parsed blocks */
  async *parseBlocksStreaming(text: string): AsyncGenerator<ParseToken, void, unknown> {
    const trimmed = text.trim();
    let cursor = 0;
    let lastCursor = -1;

    while (cursor < trimmed.length) {
      // Prevent infinite loop
      if (cursor === lastCursor) {
        // Can't parse more, yield error or break
        const remaining = trimmed.slice(cursor, cursor + 50);
        yield { kind: 'error', message: `Cannot parse remaining content: ${remaining}...` };
        break;
      }
      
      lastCursor = cursor;
      const token = this.nextBlock(trimmed, cursor);
      
      if (!token) {
        // No complete block found, check if there's a potential start of a block
        const remaining = trimmed.slice(cursor);
        const blockStarts = ['[SEQUENTIAL]', '[PARALLEL]', '[IF]', '[WHILE]', '[ASSIGN]', '[PROMPT]', '[TOOL_REQUEST]'];
        
        let foundPartialBlock = false;
        for (const start of blockStarts) {
          if (remaining.startsWith(start)) {
            // This looks like the start of a block but it's incomplete
            // Don't yield error, just break and wait for more content
            foundPartialBlock = true;
            break;
          }
        }
        
        if (!foundPartialBlock && remaining.trim()) {
          // Unknown content that doesn't look like a block start
          yield { kind: 'error', message: `Unknown content: ${remaining.slice(0, 50)}...` };
        }
        
        break;
      }
      
      yield { kind: 'block', block: token.block };
      cursor = token.end;
      
      // Skip whitespace and newlines after parsed block
      while (cursor < trimmed.length && /\s/.test(trimmed[cursor])) {
        cursor++;
      }
    }
  }

  /* ---------- low-level scanner with streaming support ----------- */
  private nextBlock(src: string, from: number): { block: Block; end: number } | null {
    const sub = src.slice(from);

    const patterns = [
      { type: 'SEQUENTIAL', rx: /\[SEQUENTIAL\]([\s\S]*?)\[END_SEQUENTIAL\]/ },
      { type: 'PARALLEL',   rx: /\[PARALLEL\]([\s\S]*?)\[END_PARALLEL\]/ },
      { type: 'IF',         rx: /\[IF\]\s*([^\n]*)\n([\s\S]*?)\[END_IF\]/ },
      { type: 'WHILE',      rx: /\[WHILE\]\s*([^\n]*)\n([\s\S]*?)\[END_WHILE\]/ },
      { type: 'ASSIGN',     rx: /\[ASSIGN\]\s*([^=]+)\s*=\s*([\s\S]*?)\[END_ASSIGN\]/ },
      { type: 'PROMPT',     rx: /\[PROMPT\]([\s\S]*?)\[END_PROMPT\]/ },
      { type: 'TOOL',       rx: /\[TOOL_REQUEST\]([\s\S]*?)\[END_TOOL_REQUEST\]/ },
    ] as const;

    for (const { type, rx } of patterns) {
      const m = rx.exec(sub);
      if (m) {
        try {
          const matchText = m[0];
          const matchStart = from + m.index;
          const matchEnd = matchStart + matchText.length;
          
          let block: Block;
          
          switch (type) {
            case 'SEQUENTIAL': {
              const body = m[1].trim();
              const data = this.safeJSONParse(body);
              if (!data) return null; // JSON not complete yet
              
              block = { 
                type: 'SEQUENTIAL', 
                steps: Array.isArray(data) ? data : (data.steps || [])
              };
              break;
            }
            
            case 'PARALLEL': {
              const body = m[1].trim();
              const data = this.safeJSONParse(body);
              if (!data) return null; // JSON not complete yet
              
              block = { 
                type: 'PARALLEL', 
                steps: Array.isArray(data) ? data : (data.steps || [])
              };
              break;
            }
            
            case 'ASSIGN': {
              block = { 
                type: 'ASSIGN', 
                variable: m[1].trim(), 
                expression: m[2].trim() 
              };
              break;
            }
            
            case 'PROMPT': {
              const body = m[1].trim();
              const prompt = this.safeJSONParse(body);
              if (!prompt) return null; // JSON not complete yet
              
              block = { type: 'PROMPT', prompt };
              break;
            }
            
            case 'TOOL': {
              const body = m[1].trim();
              const step = this.safeJSONParse(body);
              if (!step) return null; // JSON not complete yet
              
              block = { type: 'TOOL', step };
              break;
            }
            
            case 'IF': {
              const cond = m[1].trim();
              const bodyText = m[2].trim();
              const bodyBlock = this.parseSingleTool(bodyText);
              
              block = { type: 'IF', cond, body: bodyBlock };
              break;
            }
            
            case 'WHILE': {
              const cond = m[1].trim();
              const bodyText = m[2].trim();
              const bodyBlock = this.parseSingleTool(bodyText);
              
              block = { type: 'WHILE', cond, body: bodyBlock };
              break;
            }
            
            default:
              return null;
          }
          
          return { block, end: matchEnd };
          
        } catch (error) {
          // Parsing failed - might be incomplete block, continue to next pattern
          continue;
        }
      }
    }
    
    return null;
  }
  
  /* ---------- Safe JSON parser for streaming content ------------- */
  private safeJSONParse(text: string): any | null {
    if (!text.trim()) return null;
    
    try {
      return JSON.parse(text);
    } catch (error) {
      // JSON is incomplete, return null to indicate we should wait for more content
      return null;
    }
  }

  private parseSingleTool(src: string): Block {
    const step = JSON.parse(src) as Step;
    return { type: 'TOOL', step };
  }

  /* ---------- legacy tool-only parser (unchanged) ------------------ */
  parseResponse(response: string): { toolCalls: ToolCall[]; cleanResponse: string } {
    const toolCalls: ToolCall[] = [];
    const toolRegex = /\[TOOL_REQUEST\]\s*(\{.*?\})\s*\[END_TOOL_REQUEST\]/gs;
    let match;
    while ((match = toolRegex.exec(response)) !== null) {
      try {
        const toolData = JSON.parse(match[1]);
        if (toolData.name && toolData.arguments) {
          toolCalls.push({ name: toolData.name, arguments: toolData.arguments });
        }
      } catch {
        /* ignore */
      }
    }
    const cleanResponse = response.replace(toolRegex, '').trim();
    return { toolCalls, cleanResponse };
  }
}

export const blockParser = new BlockParser();
export const toolParser = new BlockParser(); // backward alias