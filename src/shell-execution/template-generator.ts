// template-generator.ts - Template-based command generation with variable substitution
import { createHash } from 'crypto';
import { ParsedCommand } from './command-parser.js';

export interface CommandTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  pattern: string;
  variables: TemplateVariable[];
  examples: TemplateExample[];
  constraints: TemplateConstraints;
  metadata: TemplateMetadata;
}

export interface TemplateVariable {
  name: string;
  type: VariableType;
  description: string;
  required: boolean;
  defaultValue?: any;
  validation?: VariableValidation;
  suggestions?: string[];
  contextAware?: boolean;
}

export interface VariableValidation {
  pattern?: RegExp;
  minLength?: number;
  maxLength?: number;
  allowedValues?: string[];
  customValidator?: (value: any) => boolean;
}

export interface TemplateExample {
  description: string;
  input: Record<string, any>;
  expectedOutput: string;
  context?: string;
}

export interface TemplateConstraints {
  platform?: ('windows' | 'linux' | 'darwin')[];
  shell?: string[];
  permissions?: string[];
  dependencies?: string[];
  safetyLevel: 'safe' | 'caution' | 'dangerous';
}

export interface TemplateMetadata {
  author: string;
  version: string;
  created: Date;
  lastModified: Date;
  usage: number;
  successRate: number;
  averageExecutionTime: number;
}

export interface GenerationContext {
  workingDirectory: string;
  environment: Record<string, string>;
  platform: string;
  shell: string;
  userPreferences: UserPreferences;
  projectContext?: ProjectContext;
}

export interface UserPreferences {
  verboseOutput: boolean;
  confirmDestructive: boolean;
  preferredFlags: Record<string, string[]>;
  aliasMap: Record<string, string>;
}

export interface ProjectContext {
  type: 'node' | 'python' | 'rust' | 'go' | 'java' | 'generic';
  packageManager?: string;
  buildTool?: string;
  testFramework?: string;
  dependencies: string[];
}

export type TemplateCategory = 
  | 'file_operations'
  | 'text_processing'
  | 'system_admin'
  | 'development'
  | 'network'
  | 'git'
  | 'package_management'
  | 'monitoring'
  | 'security';

export type VariableType = 
  | 'string'
  | 'number'
  | 'boolean'
  | 'path'
  | 'pattern'
  | 'url'
  | 'email'
  | 'command'
  | 'flag'
  | 'enum';

export class TemplateGenerator {
  private templates = new Map<string, CommandTemplate>();
  private contextCache = new Map<string, any>();
  private generationHistory: GenerationRecord[] = [];

  constructor() {
    this.initializeBuiltinTemplates();
  }

  async generateCommand(
    templateId: string,
    variables: Record<string, any>,
    context: GenerationContext
  ): Promise<GeneratedCommand> {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // Validate template constraints
    this.validateConstraints(template, context);

    // Validate and process variables
    const processedVariables = await this.processVariables(template, variables, context);

    // Generate command from template
    const command = this.substituteVariables(template.pattern, processedVariables);

    // Apply context-aware enhancements
    const enhanced = await this.applyContextEnhancements(command, template, context);

    // Create generation record
    const generated: GeneratedCommand = {
      id: this.generateId(),
      templateId,
      command: enhanced,
      variables: processedVariables,
      context,
      metadata: {
        generatedAt: new Date(),
        template: template.name,
        confidence: this.calculateConfidence(template, processedVariables, context),
        estimatedExecutionTime: template.metadata.averageExecutionTime,
        safetyLevel: template.constraints.safetyLevel
      }
    };

    // Update template usage
    template.metadata.usage++;
    template.metadata.lastModified = new Date();

    // Store in history
    this.generationHistory.push({
      id: generated.id,
      templateId,
      success: true,
      executionTime: 0, // Will be updated after execution
      timestamp: new Date()
    });

    return generated;
  }

  async suggestTemplates(
    intent: string,
    context: GenerationContext
  ): Promise<TemplateSuggestion[]> {
    const suggestions: TemplateSuggestion[] = [];

    for (const template of Array.from(this.templates.values())) {
      const relevance = this.calculateRelevance(intent, template, context);
      
      if (relevance > 0.3) {
        suggestions.push({
          template,
          relevance,
          reason: this.generateSuggestionReason(intent, template),
          requiredVariables: template.variables.filter(v => v.required),
          estimatedComplexity: this.estimateComplexity(template)
        });
      }
    }

    // Sort by relevance
    suggestions.sort((a, b) => b.relevance - a.relevance);

    return suggestions.slice(0, 10); // Return top 10 suggestions
  }

  async createTemplate(
    name: string,
    pattern: string,
    variables: TemplateVariable[],
    options: Partial<CommandTemplate>
  ): Promise<string> {
    const id = this.generateTemplateId(name);
    
    const template: CommandTemplate = {
      id,
      name,
      description: options.description || `Template for ${name}`,
      category: options.category || 'file_operations',
      pattern,
      variables,
      examples: options.examples || [],
      constraints: options.constraints || {
        safetyLevel: 'safe'
      },
      metadata: {
        author: 'user',
        version: '1.0.0',
        created: new Date(),
        lastModified: new Date(),
        usage: 0,
        successRate: 1.0,
        averageExecutionTime: 1000
      }
    };

    this.templates.set(id, template);
    return id;
  }

  private initializeBuiltinTemplates(): void {
    // File listing template
    this.templates.set('list_files', {
      id: 'list_files',
      name: 'List Files',
      description: 'List files and directories with various options',
      category: 'file_operations',
      pattern: 'ls {{flags}} {{path}}',
      variables: [
        {
          name: 'path',
          type: 'path',
          description: 'Directory path to list',
          required: false,
          defaultValue: '.',
          validation: {
            pattern: /^[^\0]+$/
          },
          contextAware: true
        },
        {
          name: 'flags',
          type: 'flag',
          description: 'Listing options',
          required: false,
          defaultValue: '-la',
          suggestions: ['-l', '-la', '-lah', '-lt', '-lS'],
          validation: {
            pattern: /^-[alhtSr]*$/
          }
        }
      ],
      examples: [
        {
          description: 'List current directory with details',
          input: { path: '.', flags: '-la' },
          expectedOutput: 'ls -la .'
        },
        {
          description: 'List specific directory',
          input: { path: '/home/user', flags: '-l' },
          expectedOutput: 'ls -l /home/user'
        }
      ],
      constraints: {
        safetyLevel: 'safe'
      },
      metadata: {
        author: 'system',
        version: '1.0.0',
        created: new Date(),
        lastModified: new Date(),
        usage: 0,
        successRate: 0.95,
        averageExecutionTime: 200
      }
    });

    // File search template
    this.templates.set('find_files', {
      id: 'find_files',
      name: 'Find Files',
      description: 'Search for files by name, type, or content',
      category: 'file_operations',
      pattern: 'find {{searchPath}} {{type}} {{namePattern}} {{additional}}',
      variables: [
        {
          name: 'searchPath',
          type: 'path',
          description: 'Path to search in',
          required: false,
          defaultValue: '.',
          contextAware: true
        },
        {
          name: 'namePattern',
          type: 'pattern',
          description: 'File name pattern',
          required: true,
          validation: {
            pattern: /^.+$/
          }
        },
        {
          name: 'type',
          type: 'enum',
          description: 'File type filter',
          required: false,
          defaultValue: '',
          suggestions: ['-type f', '-type d', '']
        },
        {
          name: 'additional',
          type: 'string',
          description: 'Additional find options',
          required: false,
          defaultValue: ''
        }
      ],
      examples: [
        {
          description: 'Find all JavaScript files',
          input: { searchPath: '.', namePattern: '-name "*.js"', type: '-type f' },
          expectedOutput: 'find . -type f -name "*.js"'
        }
      ],
      constraints: {
        safetyLevel: 'safe'
      },
      metadata: {
        author: 'system',
        version: '1.0.0',
        created: new Date(),
        lastModified: new Date(),
        usage: 0,
        successRate: 0.88,
        averageExecutionTime: 1500
      }
    });

    // Git operations template
    this.templates.set('git_commit', {
      id: 'git_commit',
      name: 'Git Commit',
      description: 'Commit changes to git repository',
      category: 'git',
      pattern: 'git add {{files}} && git commit {{flags}} -m "{{message}}"',
      variables: [
        {
          name: 'files',
          type: 'string',
          description: 'Files to add',
          required: false,
          defaultValue: '.',
          suggestions: ['.', '-A', '-u']
        },
        {
          name: 'message',
          type: 'string',
          description: 'Commit message',
          required: true,
          validation: {
            minLength: 1,
            maxLength: 72
          }
        },
        {
          name: 'flags',
          type: 'flag',
          description: 'Additional commit flags',
          required: false,
          defaultValue: '',
          suggestions: ['--amend', '--no-verify', '-s']
        }
      ],
      examples: [
        {
          description: 'Commit all changes',
          input: { files: '.', message: 'Add new feature', flags: '' },
          expectedOutput: 'git add . && git commit -m "Add new feature"'
        }
      ],
      constraints: {
        safetyLevel: 'caution',
        dependencies: ['git']
      },
      metadata: {
        author: 'system',
        version: '1.0.0',
        created: new Date(),
        lastModified: new Date(),
        usage: 0,
        successRate: 0.92,
        averageExecutionTime: 800
      }
    });

    // Package installation template
    this.templates.set('install_package', {
      id: 'install_package',
      name: 'Install Package',
      description: 'Install packages using various package managers',
      category: 'package_management',
      pattern: '{{packageManager}} {{command}} {{flags}} {{packageName}}',
      variables: [
        {
          name: 'packageManager',
          type: 'enum',
          description: 'Package manager to use',
          required: true,
          suggestions: ['npm', 'yarn', 'pip', 'apt', 'brew', 'cargo'],
          contextAware: true
        },
        {
          name: 'command',
          type: 'enum',
          description: 'Install command',
          required: true,
          defaultValue: 'install',
          suggestions: ['install', 'add', 'get']
        },
        {
          name: 'packageName',
          type: 'string',
          description: 'Name of package to install',
          required: true,
          validation: {
            pattern: /^[a-zA-Z0-9@/_-]+$/
          }
        },
        {
          name: 'flags',
          type: 'flag',
          description: 'Installation flags',
          required: false,
          defaultValue: '',
          suggestions: ['--save-dev', '--global', '-g', '--save']
        }
      ],
      examples: [
        {
          description: 'Install npm package',
          input: { packageManager: 'npm', command: 'install', packageName: 'lodash', flags: '--save' },
          expectedOutput: 'npm install --save lodash'
        }
      ],
      constraints: {
        safetyLevel: 'caution'
      },
      metadata: {
        author: 'system',
        version: '1.0.0',
        created: new Date(),
        lastModified: new Date(),
        usage: 0,
        successRate: 0.85,
        averageExecutionTime: 5000
      }
    });
  }

  private validateConstraints(template: CommandTemplate, context: GenerationContext): void {
    const constraints = template.constraints;

    // Check platform compatibility
    if (constraints.platform && !constraints.platform.includes(context.platform as any)) {
      throw new Error(`Template ${template.name} is not compatible with platform ${context.platform}`);
    }

    // Check shell compatibility
    if (constraints.shell && !constraints.shell.includes(context.shell)) {
      throw new Error(`Template ${template.name} is not compatible with shell ${context.shell}`);
    }

    // Check dependencies
    if (constraints.dependencies) {
      // In a real implementation, this would check if dependencies are available
      // For now, we'll just log a warning
      console.warn(`Template ${template.name} requires dependencies: ${constraints.dependencies.join(', ')}`);
    }
  }

  private async processVariables(
    template: CommandTemplate,
    variables: Record<string, any>,
    context: GenerationContext
  ): Promise<Record<string, any>> {
    const processed: Record<string, any> = {};

    for (const templateVar of template.variables) {
      let value = variables[templateVar.name];

      // Use default value if not provided
      if (value === undefined) {
        if (templateVar.required) {
          throw new Error(`Required variable '${templateVar.name}' not provided`);
        }
        value = templateVar.defaultValue;
      }

      // Apply context-aware processing
      if (templateVar.contextAware) {
        value = await this.applyContextToVariable(templateVar, value, context);
      }

      // Validate variable
      if (templateVar.validation) {
        this.validateVariable(templateVar, value);
      }

      processed[templateVar.name] = value;
    }

    return processed;
  }

  private async applyContextToVariable(
    variable: TemplateVariable,
    value: any,
    context: GenerationContext
  ): Promise<any> {
    switch (variable.type) {
      case 'path':
        // Resolve relative paths
        if (value === '.' || value === './') {
          return context.workingDirectory;
        }
        break;
      
      case 'command':
        // Apply user aliases
        if (context.userPreferences.aliasMap[value]) {
          return context.userPreferences.aliasMap[value];
        }
        break;
      
      case 'enum':
        // Auto-detect package manager for project context
        if (variable.name === 'packageManager' && context.projectContext) {
          return this.detectPackageManager(context.projectContext);
        }
        break;
    }

    return value;
  }

  private detectPackageManager(projectContext: ProjectContext): string {
    if (projectContext.packageManager) {
      return projectContext.packageManager;
    }

    switch (projectContext.type) {
      case 'node': return 'npm';
      case 'python': return 'pip';
      case 'rust': return 'cargo';
      case 'go': return 'go';
      default: return 'npm';
    }
  }

  private validateVariable(variable: TemplateVariable, value: any): void {
    const validation = variable.validation!;

    if (validation.pattern && !validation.pattern.test(String(value))) {
      throw new Error(`Variable '${variable.name}' does not match required pattern`);
    }

    if (validation.minLength && String(value).length < validation.minLength) {
      throw new Error(`Variable '${variable.name}' is too short`);
    }

    if (validation.maxLength && String(value).length > validation.maxLength) {
      throw new Error(`Variable '${variable.name}' is too long`);
    }

    if (validation.allowedValues && !validation.allowedValues.includes(value)) {
      throw new Error(`Variable '${variable.name}' must be one of: ${validation.allowedValues.join(', ')}`);
    }

    if (validation.customValidator && !validation.customValidator(value)) {
      throw new Error(`Variable '${variable.name}' failed custom validation`);
    }
  }

  private substituteVariables(pattern: string, variables: Record<string, any>): string {
    let result = pattern;

    // Replace {{variable}} patterns
    for (const [name, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{${name}\\}\\}`, 'g');
      result = result.replace(regex, String(value));
    }

    // Clean up any remaining empty substitutions
    result = result.replace(/\s+/g, ' ').trim();

    return result;
  }

  private async applyContextEnhancements(
    command: string,
    template: CommandTemplate,
    context: GenerationContext
  ): Promise<string> {
    let enhanced = command;

    // Apply user preferences
    if (context.userPreferences.verboseOutput) {
      enhanced = this.addVerboseFlags(enhanced, template);
    }

    // Add confirmation for destructive operations
    if (template.constraints.safetyLevel === 'dangerous' && 
        context.userPreferences.confirmDestructive) {
      enhanced = `echo "About to execute: ${enhanced}" && read -p "Continue? (y/N) " -n 1 -r && echo && [[ $REPLY =~ ^[Yy]$ ]] && ${enhanced}`;
    }

    return enhanced;
  }

  private addVerboseFlags(command: string, template: CommandTemplate): string {
    // Add verbose flags based on command type
    const verboseMap: Record<string, string> = {
      'cp': ' -v',
      'mv': ' -v',
      'rm': ' -v',
      'mkdir': ' -v',
      'chmod': ' -v',
      'chown': ' -v'
    };

    for (const [cmd, flag] of Object.entries(verboseMap)) {
      if (command.startsWith(cmd + ' ')) {
        return command.replace(cmd, cmd + flag);
      }
    }

    return command;
  }

  private calculateRelevance(intent: string, template: CommandTemplate, context: GenerationContext): number {
    let relevance = 0;

    // Check intent keywords against template name and description
    const intentWords = intent.toLowerCase().split(/\s+/);
    const templateText = `${template.name} ${template.description}`.toLowerCase();

    for (const word of intentWords) {
      if (templateText.includes(word)) {
        relevance += 0.2;
      }
    }

    // Boost relevance for frequently used templates
    relevance += Math.min(template.metadata.usage / 100, 0.3);

    // Boost relevance for high success rate
    relevance += template.metadata.successRate * 0.2;

    // Context-based relevance
    if (context.projectContext) {
      if (template.category === 'development' || template.category === 'package_management') {
        relevance += 0.1;
      }
    }

    return Math.min(relevance, 1.0);
  }

  private generateSuggestionReason(intent: string, template: CommandTemplate): string {
    return `Template "${template.name}" matches your intent and has a ${(template.metadata.successRate * 100).toFixed(0)}% success rate`;
  }

  private estimateComplexity(template: CommandTemplate): number {
    let complexity = 1;
    
    complexity += template.variables.filter(v => v.required).length * 0.5;
    complexity += template.variables.length * 0.2;
    
    if (template.constraints.safetyLevel === 'dangerous') complexity += 1;
    if (template.constraints.dependencies?.length) complexity += 0.5;
    
    return complexity;
  }

  private calculateConfidence(
    template: CommandTemplate,
    variables: Record<string, any>,
    context: GenerationContext
  ): number {
    let confidence = template.metadata.successRate;

    // Reduce confidence for missing optional variables
    const providedVars = Object.keys(variables).length;
    const totalVars = template.variables.length;
    confidence *= (providedVars / totalVars) * 0.8 + 0.2;

    // Platform compatibility
    if (template.constraints.platform && 
        !template.constraints.platform.includes(context.platform as any)) {
      confidence *= 0.5;
    }

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  private generateId(): string {
    return `gen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private generateTemplateId(name: string): string {
    const hash = createHash('md5').update(name + Date.now()).digest('hex').slice(0, 8);
    return `template_${hash}`;
  }

  // Public utility methods
  getTemplate(id: string): CommandTemplate | undefined {
    return this.templates.get(id);
  }

  getAllTemplates(): CommandTemplate[] {
    return Array.from(this.templates.values());
  }

  getTemplatesByCategory(category: TemplateCategory): CommandTemplate[] {
    return Array.from(this.templates.values()).filter(t => t.category === category);
  }

  updateTemplateSuccess(templateId: string, success: boolean, executionTime: number): void {
    const template = this.templates.get(templateId);
    if (template) {
      const totalExecutions = template.metadata.usage;
      const currentSuccessRate = template.metadata.successRate;
      
      // Update success rate using weighted average
      const newSuccessRate = (currentSuccessRate * totalExecutions + (success ? 1 : 0)) / (totalExecutions + 1);
      template.metadata.successRate = newSuccessRate;
      
      // Update average execution time
      const currentAvgTime = template.metadata.averageExecutionTime;
      template.metadata.averageExecutionTime = (currentAvgTime * totalExecutions + executionTime) / (totalExecutions + 1);
    }
  }
}

export interface GeneratedCommand {
  id: string;
  templateId: string;
  command: string;
  variables: Record<string, any>;
  context: GenerationContext;
  metadata: {
    generatedAt: Date;
    template: string;
    confidence: number;
    estimatedExecutionTime: number;
    safetyLevel: string;
  };
}

export interface TemplateSuggestion {
  template: CommandTemplate;
  relevance: number;
  reason: string;
  requiredVariables: TemplateVariable[];
  estimatedComplexity: number;
}

export interface GenerationRecord {
  id: string;
  templateId: string;
  success: boolean;
  executionTime: number;
  timestamp: Date;
}

export const templateGenerator = new TemplateGenerator();
