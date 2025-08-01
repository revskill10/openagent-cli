// tool-documentation-formatter.ts - Format tool documentation for user display
import { ToolDefinition } from './base-executor.js';

export interface FormattedToolDoc {
  name: string;
  description: string;
  parameters: ParameterDoc[];
  examples: string[];
  usage: string;
}

export interface ParameterDoc {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  default?: any;
  enum?: any[];
  pattern?: string;
  minimum?: number;
  maximum?: number;
}

export class ToolDocumentationFormatter {
  /**
   * Format a tool definition into user-friendly documentation
   */
  static formatToolDocumentation(tool: ToolDefinition): FormattedToolDoc {
    const parameters = this.extractParameters(tool.inputSchema);
    const examples = this.generateExamples(tool.name, parameters);
    const usage = this.generateUsageText(tool.name, parameters);

    return {
      name: tool.name,
      description: tool.description,
      parameters,
      examples,
      usage
    };
  }

  /**
   * Extract parameter information from JSON schema
   */
  private static extractParameters(schema: any): ParameterDoc[] {
    if (!schema || !schema.properties) return [];

    const required = schema.required || [];
    const parameters: ParameterDoc[] = [];

    for (const [name, propSchema] of Object.entries(schema.properties as Record<string, any>)) {
      parameters.push({
        name,
        type: this.getTypeDescription(propSchema),
        required: required.includes(name),
        description: propSchema.description,
        default: propSchema.default,
        enum: propSchema.enum,
        pattern: propSchema.pattern,
        minimum: propSchema.minimum,
        maximum: propSchema.maximum
      });
    }

    return parameters.sort((a, b) => {
      // Required parameters first, then alphabetical
      if (a.required && !b.required) return -1;
      if (!a.required && b.required) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * Get human-readable type description
   */
  private static getTypeDescription(propSchema: any): string {
    if (propSchema.enum) {
      return `enum (${propSchema.enum.join(', ')})`;
    }
    
    if (propSchema.type === 'array') {
      const itemType = propSchema.items?.type || 'any';
      return `array of ${itemType}`;
    }
    
    if (propSchema.type === 'object') {
      return 'object';
    }
    
    let type = propSchema.type || 'any';
    
    if (propSchema.format) {
      type += ` (${propSchema.format})`;
    }
    
    if (propSchema.pattern) {
      type += ` matching /${propSchema.pattern}/`;
    }
    
    if (propSchema.minimum !== undefined || propSchema.maximum !== undefined) {
      const min = propSchema.minimum !== undefined ? propSchema.minimum : '';
      const max = propSchema.maximum !== undefined ? propSchema.maximum : '';
      type += ` (${min}..${max})`;
    }
    
    return type;
  }

  /**
   * Generate usage examples for the tool
   */
  private static generateExamples(toolName: string, parameters: ParameterDoc[]): string[] {
    const examples: string[] = [];

    // Example 1: Minimal required parameters only
    const requiredParams = parameters.filter(p => p.required);
    if (requiredParams.length > 0) {
      const minimalExample = this.generateExampleJson(toolName, requiredParams);
      examples.push(`Minimal usage:\n${minimalExample}`);
    }

    // Example 2: All parameters with example values
    if (parameters.length > requiredParams.length) {
      const fullExample = this.generateExampleJson(toolName, parameters);
      examples.push(`Full usage:\n${fullExample}`);
    }

    return examples;
  }

  /**
   * Generate example JSON for tool call
   */
  private static generateExampleJson(toolName: string, parameters: ParameterDoc[]): string {
    const params: Record<string, any> = {};

    for (const param of parameters) {
      params[param.name] = this.generateExampleValue(param);
    }

    return JSON.stringify({
      id: "example_id",
      tool: toolName,
      params
    }, null, 2);
  }

  /**
   * Generate example value for a parameter
   */
  private static generateExampleValue(param: ParameterDoc): any {
    if (param.default !== undefined) {
      return param.default;
    }

    if (param.enum && param.enum.length > 0) {
      return param.enum[0];
    }

    if (param.type.includes('string')) {
      if (param.name.toLowerCase().includes('path')) return 'example/path';
      if (param.name.toLowerCase().includes('file')) return 'example.txt';
      if (param.name.toLowerCase().includes('dir')) return 'example_directory';
      if (param.name.toLowerCase().includes('url')) return 'https://example.com';
      if (param.name.toLowerCase().includes('email')) return 'user@example.com';
      if (param.name.toLowerCase().includes('query')) return 'search query here';
      if (param.name.toLowerCase().includes('content')) return 'example content';
      if (param.name.toLowerCase().includes('message')) return 'example message';
      return 'example_value';
    }

    if (param.type.includes('number')) {
      if (param.minimum !== undefined) return param.minimum;
      return 42;
    }

    if (param.type.includes('boolean')) {
      return true;
    }

    if (param.type.includes('array')) {
      return ['example_item'];
    }

    if (param.type.includes('object')) {
      return { example_key: 'example_value' };
    }

    return 'example_value';
  }

  /**
   * Generate user-friendly usage text
   */
  private static generateUsageText(toolName: string, parameters: ParameterDoc[]): string {
    const lines: string[] = [];
    
    lines.push(`Tool: ${toolName}`);
    lines.push('');
    
    if (parameters.length === 0) {
      lines.push('This tool requires no parameters.');
      return lines.join('\n');
    }

    lines.push('Parameters:');
    
    for (const param of parameters) {
      const required = param.required ? ' (REQUIRED)' : ' (optional)';
      const defaultVal = param.default !== undefined ? ` [default: ${param.default}]` : '';
      
      lines.push(`  • ${param.name}: ${param.type}${required}${defaultVal}`);
      
      if (param.description) {
        lines.push(`    ${param.description}`);
      }
      
      if (param.enum) {
        lines.push(`    Valid values: ${param.enum.join(', ')}`);
      }
      
      if (param.pattern) {
        lines.push(`    Pattern: ${param.pattern}`);
      }
      
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Format tool documentation as markdown for display
   */
  static formatAsMarkdown(doc: FormattedToolDoc): string {
    const lines: string[] = [];
    
    lines.push(`# ${doc.name}`);
    lines.push('');
    lines.push(doc.description);
    lines.push('');
    
    if (doc.parameters.length > 0) {
      lines.push('## Parameters');
      lines.push('');
      
      for (const param of doc.parameters) {
        const required = param.required ? '**Required**' : '*Optional*';
        const defaultVal = param.default !== undefined ? ` (default: \`${param.default}\`)` : '';
        
        lines.push(`### \`${param.name}\` - ${param.type} ${required}${defaultVal}`);
        lines.push('');
        
        if (param.description) {
          lines.push(param.description);
          lines.push('');
        }
        
        if (param.enum) {
          lines.push(`**Valid values:** ${param.enum.map(v => `\`${v}\``).join(', ')}`);
          lines.push('');
        }
        
        if (param.pattern) {
          lines.push(`**Pattern:** \`${param.pattern}\``);
          lines.push('');
        }
      }
    }
    
    if (doc.examples.length > 0) {
      lines.push('## Examples');
      lines.push('');
      
      for (const example of doc.examples) {
        lines.push('```json');
        lines.push(example);
        lines.push('```');
        lines.push('');
      }
    }
    
    return lines.join('\n');
  }

  /**
   * Format validation error with tool documentation
   */
  static formatValidationError(
    toolName: string, 
    error: string, 
    tool: ToolDefinition,
    providedParams: any
  ): string {
    const doc = this.formatToolDocumentation(tool);
    const lines: string[] = [];
    
    lines.push('🚨 **Tool Validation Error**');
    lines.push('');
    lines.push(`Tool: \`${toolName}\``);
    lines.push(`Error: ${error}`);
    lines.push('');
    
    lines.push('**Your input:**');
    lines.push('```json');
    lines.push(JSON.stringify(providedParams, null, 2));
    lines.push('```');
    lines.push('');
    
    lines.push('**Expected format:**');
    lines.push(doc.usage);
    
    if (doc.examples.length > 0) {
      lines.push('**Examples:**');
      for (const example of doc.examples) {
        lines.push('```json');
        lines.push(example);
        lines.push('```');
        lines.push('');
      }
    }
    
    return lines.join('\n');
  }
}

export const toolDocFormatter = new ToolDocumentationFormatter();