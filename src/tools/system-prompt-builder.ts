// src/tools/system-prompt-builder.ts

import { ToolDefinition } from './base-executor.js';

export interface ToolDescription {
  name: string;
  description: string;
  arguments: Record<string, any>;
  category?: string;
  source?: string;
}

export class SystemPromptBuilder {
  // src/tools/system-prompt-builder.ts

// Replace the buildSystemPrompt method with:
static buildSystemPrompt(
  basePrompt: string,
  availableTools: ToolDescription[] = [],
  includeBuiltins: boolean = true
): string {
  const builtinTools = includeBuiltins ? [
    { name: 'echo', description: 'Echo a message', arguments: { message: 'string' }, category: 'utility' },
    { name: 'timestamp', description: 'Get current timestamp', arguments: {}, category: 'utility' },
    { name: 'random', description: 'Generate random number', arguments: { min: 'number', max: 'number' }, category: 'utility' },
    { name: 'math', description: 'Do math', arguments: { operation: 'string', a: 'number', b: 'number' }, category: 'utility' }
  ] : [];
  
  const allTools = [...availableTools, ...builtinTools];
  const toolsByCategory = this.groupToolsByCategory(allTools);

  return `${basePrompt}

Format: [TOOL_REQUEST]{"id":"x","tool":"name","params":{"key":"value"}}[END_TOOL_REQUEST]
Example: [TOOL_REQUEST]{"id":"test","tool":"write_file","params":{"path":"file.txt","content":"hello"}}[END_TOOL_REQUEST]
CRITICAL: JSON must end with }} before [END_TOOL_REQUEST]
write_file uses "path" not "file_path"
Tools: ${this.formatToolsUltraCompact(toolsByCategory)}
`.trim();
}

  /**
   * Extract tool descriptions from unified tool registry
   */
  static extractToolDescriptions(tools: ToolDefinition[]): ToolDescription[] {
    return tools.map(tool => {
      // Handle both old format (with source) and new format (with executorType)
      const sourceType = tool.executorType || 'unknown';
      const sourceName = tool.metadata?.serverName || tool.metadata?.functionName || 'unknown';
      
      return {
        name: tool.name,
        description: `${tool.description} [${sourceType.toUpperCase()}: ${sourceName}]`,
        arguments: SystemPromptBuilder.formatArguments(tool.inputSchema),
        category: SystemPromptBuilder.categorizeToolByName(tool.name, sourceName)
      };
    });
  }

  /**
   * Group tools by category for better organization
   */
  private static groupToolsByCategory(tools: ToolDescription[]): Record<string, ToolDescription[]> {
    const grouped: Record<string, ToolDescription[]> = {};

    for (const tool of tools) {
      const category = tool.category || 'other';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(tool);
    }

    return grouped;
  }

  /**
   * Format tools in ultra-compact form to save tokens
   */
  private static formatToolsUltraCompact(toolsByCategory: Record<string, ToolDescription[]>): string {
    const allTools: string[] = [];
    
    for (const [, tools] of Object.entries(toolsByCategory)) {
      if (tools.length === 0) continue;
      
      for (const tool of tools) {
        allTools.push(tool.name);
      }
    }
    
    return allTools.join(',');
  }

  /**
   * Format tool categories for the system prompt - ultra compact
   */
  private static formatToolCategories(toolsByCategory: Record<string, ToolDescription[]>): string {
    const lines: string[] = [];
    
    for (const [category, tools] of Object.entries(toolsByCategory)) {
      if (tools.length === 0) continue;
      
      const toolList = tools.map(tool => {
        const args = Object.keys(tool.arguments).length > 0 
          ? `(${Object.keys(tool.arguments).join(',')})` 
          : '()';
        return `${tool.name}${args}`;
      }).join(' ');
      
      lines.push(`${category}: ${toolList}`);
    }
    
    return lines.join('\\n');
  }

  /**
   * Categorize a tool based on its name and server
   */
  private static categorizeToolByName(toolName: string, serverName: string): string {
    // Filesystem tools
    if (serverName === 'fs' || toolName.includes('file') || toolName.includes('directory') || 
        ['read_file', 'write_file', 'list_directory', 'create_directory', 'move_file', 'search_files'].includes(toolName)) {
      return 'filesystem';
    }

    // Utility tools
    if (['echo', 'timestamp', 'random', 'math'].includes(toolName)) {
      return 'utility';
    }

    return 'other';
  }

  /**
   * Format tool arguments from JSON schema
   */
  private static formatArguments(inputSchema: any): Record<string, any> {
    if (!inputSchema?.properties) return {};

    const formatted: Record<string, any> = {};
    const required = inputSchema.required || [];

    for (const [name, schema] of Object.entries(inputSchema.properties)) {
      const prop = schema as any;
      const isRequired = required.includes(name);
      const type = prop.type || 'any';
      const description = prop.description || '';
      
      let argDesc = `${type}`;
      if (isRequired) {
        argDesc += ' (required)';
      } else {
        argDesc += ' (optional)';
      }
      if (description) {
        argDesc += ` - ${description}`;
      }

      formatted[name] = argDesc;
    }

    return formatted;
  }

  /**
   * Build dynamic system prompt with all available tools
   */
  static buildDynamicSystemPrompt(
    basePrompt: string,
    tools: ToolDefinition[]
  ): string {
    const toolDescriptions = SystemPromptBuilder.extractToolDescriptions(tools);
    return SystemPromptBuilder.buildSystemPrompt(basePrompt, toolDescriptions);
  }
}