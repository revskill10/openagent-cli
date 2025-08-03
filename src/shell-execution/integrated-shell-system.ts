// integrated-shell-system.ts - Main shell execution system integrating all components
import { commandParser, ParsedCommand } from './command-parser.js';
import { commandTranslator, CommandTranslation } from './command-translator.js';
import { shellExecutor, ExecutionResult, ExecutionOptions } from './shell-executor.js';
import { bytecodeOptimizer, CompiledBytecode } from './bytecode-optimizer.js';
import { templateGenerator, GeneratedCommand, GenerationContext, UserPreferences, ProjectContext } from './template-generator.js';
import { antiHallucinationFramework, VerificationResult } from './anti-hallucination.js';
import { memorySystem } from '../memory-system/memory-layers.js';
import { textChunker } from '../memory-system/text-chunker.js';
import { systemEventEmitter } from '../system-events.js';

export interface ShellExecutionRequest {
  input: string;
  context?: ExecutionContext;
  options?: ShellExecutionOptions;
}

export interface ExecutionContext {
  workingDirectory: string;
  environment: Record<string, string>;
  userPreferences: UserPreferences;
  projectContext?: ProjectContext;
  sessionId?: string;
}

// UserPreferences and ProjectContext are now imported from template-generator.ts

export interface ShellExecutionOptions extends ExecutionOptions {
  useTemplates?: boolean;
  enableOptimization?: boolean;
  enableVerification?: boolean;
  enableLearning?: boolean;
  confidenceThreshold?: number;
  maxRetries?: number;
}

export interface ShellExecutionResult {
  success: boolean;
  result: ExecutionResult;
  metadata: ExecutionMetadata;
  suggestions?: string[];
  alternatives?: GeneratedCommand[];
}

export interface ExecutionMetadata {
  originalInput: string;
  parsedCommand: ParsedCommand;
  translation: CommandTranslation;
  verification?: VerificationResult;
  bytecode?: CompiledBytecode;
  template?: GeneratedCommand;
  processingTime: number;
  confidence: number;
  riskLevel: string;
  fallbacksApplied: string[];
  learningRecorded: boolean;
}

export interface WorkflowStep {
  id: string;
  name: string;
  command: string;
  dependencies: string[];
  variables: Record<string, any>;
  condition?: string;
  onSuccess?: string[];
  onFailure?: string[];
}

export interface WorkflowExecution {
  id: string;
  steps: WorkflowStep[];
  context: Record<string, any>;
  results: Map<string, ShellExecutionResult>;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
}

export class IntegratedShellSystem {
  private workflows = new Map<string, WorkflowExecution>();
  private executionHistory: ShellExecutionResult[] = [];
  private isInitialized = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    console.log('Initializing Integrated Shell System...');
    
    // Initialize all subsystems
    await shellExecutor.initialize();
    await memorySystem.initialize();
    
    console.log('Shell system initialization complete');
    this.isInitialized = true;
  }

  async executeCommand(request: ShellExecutionRequest): Promise<ShellExecutionResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const startTime = Date.now();
    const executionId = this.generateExecutionId();
    
    systemEventEmitter.emitSystemInfo('Shell execution started', {
      executionId,
      input: request.input
    });

    try {
      // Step 1: Parse the input
      const parsed = await this.parseInput(request.input, request.context);
      
      // Step 2: Check for template matches
      let generatedCommand: GeneratedCommand | undefined;
      if (request.options?.useTemplates !== false) {
        generatedCommand = await this.tryTemplateGeneration(request.input, request.context);
        if (generatedCommand) {
          // Use generated command instead of parsed input
          const templateParsed = await commandParser.parseInput(generatedCommand.command);
          Object.assign(parsed, templateParsed);
        }
      }

      // Step 3: Translate command for current platform
      const translation = await commandTranslator.translateCommand(
        `${parsed.command} ${parsed.args.join(' ')}`
      );

      // Step 4: Compile to bytecode for optimization
      let bytecode: CompiledBytecode | undefined;
      if (request.options?.enableOptimization !== false) {
        bytecode = await bytecodeOptimizer.compileCommand(parsed, 'basic');
      }

      // Step 5: Verify command safety and correctness
      let verification: VerificationResult | undefined;
      let fallbacksApplied: string[] = [];
      
      if (request.options?.enableVerification !== false) {
        verification = await antiHallucinationFramework.verifyCommand(parsed, translation);
        
        // Apply fallbacks if needed
        if (verification.confidence < (request.options?.confidenceThreshold || 0.6) ||
            verification.riskLevel === 'high' || verification.riskLevel === 'critical') {
          
          const fallbackCommand = await antiHallucinationFramework.applyFallbacks(parsed, verification);
          if (JSON.stringify(fallbackCommand) !== JSON.stringify(parsed)) {
            Object.assign(parsed, fallbackCommand);
            fallbacksApplied.push('command_modification');
            
            // Re-translate after fallback
            const newTranslation = await commandTranslator.translateCommand(
              `${parsed.command} ${parsed.args.join(' ')}`
            );
            Object.assign(translation, newTranslation);
          }
        }
      }

      // Step 6: Check confidence threshold
      const finalConfidence = verification?.confidence || translation.confidence;
      if (finalConfidence < (request.options?.confidenceThreshold || 0.3)) {
        throw new Error(`Command confidence too low: ${finalConfidence.toFixed(2)}`);
      }

      // Step 7: Execute the command
      const executionOptions: ExecutionOptions = {
        ...request.options,
        cwd: request.context?.workingDirectory,
        env: request.context?.environment
      };

      const result = await shellExecutor.executeCommand(
        `${translation.command} ${translation.args.join(' ')}`,
        executionOptions
      );

      // Step 8: Validate results
      if (verification) {
        const resultValidation = await antiHallucinationFramework.validateResult(
          parsed, result, verification
        );
        
        if (!resultValidation.isValid) {
          console.warn('Result validation failed:', resultValidation.anomalies);
        }
      }

      // Step 9: Record learning
      let learningRecorded = false;
      if (request.options?.enableLearning !== false && verification) {
        await antiHallucinationFramework.recordLearning(parsed, verification, result);
        learningRecorded = true;
      }

      // Step 10: Store execution in memory
      await this.storeExecutionMemory(request, parsed, result, verification);

      // Step 11: Generate suggestions and alternatives
      const suggestions = this.generateSuggestions(parsed, result, verification);
      const alternatives = await this.generateAlternatives(request.input, request.context);

      const executionResult: ShellExecutionResult = {
        success: result.success,
        result,
        metadata: {
          originalInput: request.input,
          parsedCommand: parsed,
          translation,
          verification,
          bytecode,
          template: generatedCommand,
          processingTime: Date.now() - startTime,
          confidence: finalConfidence,
          riskLevel: verification?.riskLevel || 'unknown',
          fallbacksApplied,
          learningRecorded
        },
        suggestions,
        alternatives
      };

      // Store in execution history
      this.executionHistory.push(executionResult);
      if (this.executionHistory.length > 1000) {
        this.executionHistory = this.executionHistory.slice(-500);
      }

      systemEventEmitter.emitSystemInfo('Shell execution completed', {
        executionId,
        success: result.success,
        processingTime: executionResult.metadata.processingTime
      });

      return executionResult;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      systemEventEmitter.emitSystemInfo('Shell execution failed', {
        executionId,
        error: errorMessage
      });

      return {
        success: false,
        result: {
          success: false,
          stdout: '',
          stderr: errorMessage,
          exitCode: -1,
          executionTime: Date.now() - startTime,
          command: request.input,
          warnings: [`Execution failed: ${errorMessage}`],
          metadata: {
            platform: 'unknown',
            shell: 'unknown',
            workingDirectory: request.context?.workingDirectory || process.cwd(),
            environment: request.context?.environment || {},
            translation: {
              command: '',
              args: [],
              options: {},
              confidence: 0,
              warnings: []
            },
            dryRun: false,
            sandboxed: false
          }
        },
        metadata: {
          originalInput: request.input,
          parsedCommand: { id: '', type: 'simple', command: '', args: [], pipes: [], redirections: [], variables: [], conditions: [], metadata: {} as any, confidence: 0 },
          translation: { command: '', args: [], options: {}, confidence: 0, warnings: [] },
          processingTime: Date.now() - startTime,
          confidence: 0,
          riskLevel: 'unknown',
          fallbacksApplied: [],
          learningRecorded: false
        }
      };
    }
  }

  async executeWorkflow(steps: WorkflowStep[], context: Record<string, any> = {}): Promise<WorkflowExecution> {
    const workflowId = this.generateWorkflowId();
    const execution: WorkflowExecution = {
      id: workflowId,
      steps,
      context,
      results: new Map(),
      status: 'pending'
    };

    this.workflows.set(workflowId, execution);
    execution.status = 'running';

    try {
      // Build dependency graph
      const dependencyGraph = this.buildDependencyGraph(steps);
      
      // Execute steps in dependency order
      const executionOrder = this.topologicalSort(dependencyGraph);
      
      for (const stepId of executionOrder) {
        const step = steps.find(s => s.id === stepId);
        if (!step) continue;

        // Check dependencies
        const dependenciesMet = step.dependencies.every(depId => 
          execution.results.has(depId) && execution.results.get(depId)!.success
        );

        if (!dependenciesMet) {
          console.warn(`Skipping step ${step.id} - dependencies not met`);
          continue;
        }

        // Substitute variables
        const substitutedCommand = this.substituteVariables(step.command, {
          ...execution.context,
          ...step.variables,
          ...this.extractResultVariables(execution.results)
        });

        // Execute step
        const stepResult = await this.executeCommand({
          input: substitutedCommand,
          context: {
            workingDirectory: process.cwd(),
            environment: process.env as Record<string, string>,
            userPreferences: {
              verboseOutput: false,
              confirmDestructive: false,
              preferredFlags: {},
              aliasMap: {}
            }
          }
        });

        execution.results.set(step.id, stepResult);

        // Handle step result
        if (stepResult.success) {
          // Execute onSuccess actions
          if (step.onSuccess) {
            for (const action of step.onSuccess) {
              await this.executeAction(action, execution);
            }
          }
        } else {
          // Execute onFailure actions
          if (step.onFailure) {
            for (const action of step.onFailure) {
              await this.executeAction(action, execution);
            }
          }
          
          // Decide whether to continue or fail
          if (!step.onFailure || step.onFailure.includes('fail_workflow')) {
            execution.status = 'failed';
            break;
          }
        }
      }

      if (execution.status === 'running') {
        execution.status = 'completed';
      }

    } catch (error) {
      console.error('Workflow execution failed:', error);
      execution.status = 'failed';
    }

    return execution;
  }

  private async parseInput(input: string, context?: ExecutionContext): Promise<ParsedCommand> {
    // Determine input format and parse accordingly
    return await commandParser.parseInput(input);
  }

  private async tryTemplateGeneration(input: string, context?: ExecutionContext): Promise<GeneratedCommand | undefined> {
    try {
      // Suggest templates based on input
      const suggestions = await templateGenerator.suggestTemplates(input, {
        workingDirectory: context?.workingDirectory || process.cwd(),
        environment: context?.environment || {},
        platform: process.platform,
        shell: 'bash',
        userPreferences: context?.userPreferences || {
          verboseOutput: false,
          confirmDestructive: true,
          preferredFlags: {},
          aliasMap: {}
        },
        projectContext: context?.projectContext
      });

      if (suggestions.length > 0 && suggestions[0].relevance > 0.7) {
        // Use the most relevant template
        const template = suggestions[0].template;
        
        // Extract variables from input (simplified)
        const variables = this.extractVariablesFromInput(input, template);
        
        return await templateGenerator.generateCommand(template.id, variables, {
          workingDirectory: context?.workingDirectory || process.cwd(),
          environment: context?.environment || {},
          platform: process.platform,
          shell: 'bash',
          userPreferences: context?.userPreferences || {
            verboseOutput: false,
            confirmDestructive: true,
            preferredFlags: {},
            aliasMap: {}
          },
          projectContext: context?.projectContext
        });
      }
    } catch (error) {
      console.warn('Template generation failed:', error);
    }
    
    return undefined;
  }

  private async storeExecutionMemory(
    request: ShellExecutionRequest,
    parsed: ParsedCommand,
    result: ExecutionResult,
    verification?: VerificationResult
  ): Promise<void> {
    // Store command execution in memory system
    await memorySystem.store({
      type: 'command_execution',
      input: request.input,
      command: parsed,
      result,
      verification,
      timestamp: new Date()
    }, 'workflow', {
      importance: result.success ? 0.6 : 0.8, // Failed commands are more important to remember
      tags: ['shell_execution', parsed.command, result.success ? 'success' : 'failure'],
      source: 'integrated_shell_system'
    });

    // Store command patterns for learning
    if (verification && verification.confidence > 0.7) {
      await memorySystem.store({
        type: 'command_pattern',
        pattern: `${parsed.command} ${parsed.args.join(' ')}`,
        success: result.success,
        confidence: verification.confidence,
        issues: verification.issues,
        suggestions: verification.suggestions
      }, 'pattern', {
        importance: 0.7,
        tags: ['command_pattern', parsed.command],
        source: 'integrated_shell_system'
      });
    }
  }

  private generateSuggestions(
    parsed: ParsedCommand,
    result: ExecutionResult,
    verification?: VerificationResult
  ): string[] {
    const suggestions: string[] = [];

    // Add verification suggestions
    if (verification) {
      suggestions.push(...verification.suggestions);
    }

    // Add result-based suggestions
    if (!result.success) {
      if (result.stderr.includes('Permission denied')) {
        suggestions.push('Try running with sudo or check file permissions');
      }
      
      if (result.stderr.includes('command not found')) {
        suggestions.push('Check if the command is installed or available in PATH');
      }
      
      if (result.stderr.includes('No such file or directory')) {
        suggestions.push('Verify the file path exists and is accessible');
      }
    }

    // Add performance suggestions
    if (result.executionTime > 10000) {
      suggestions.push('Command took a long time to execute - consider optimizing or using alternatives');
    }

    return suggestions;
  }

  private async generateAlternatives(input: string, context?: ExecutionContext): Promise<GeneratedCommand[]> {
    try {
      const suggestions = await templateGenerator.suggestTemplates(input, {
        workingDirectory: context?.workingDirectory || process.cwd(),
        environment: context?.environment || {},
        platform: process.platform,
        shell: 'bash',
        userPreferences: context?.userPreferences || {
          verboseOutput: false,
          confirmDestructive: true,
          preferredFlags: {},
          aliasMap: {}
        },
        projectContext: context?.projectContext
      });

      const alternatives: GeneratedCommand[] = [];
      
      for (const suggestion of suggestions.slice(0, 3)) {
        try {
          const variables = this.extractVariablesFromInput(input, suggestion.template);
          const generated = await templateGenerator.generateCommand(suggestion.template.id, variables, {
            workingDirectory: context?.workingDirectory || process.cwd(),
            environment: context?.environment || {},
            platform: process.platform,
            shell: 'bash',
            userPreferences: context?.userPreferences || {
              verboseOutput: false,
              confirmDestructive: true,
              preferredFlags: {},
              aliasMap: {}
            },
            projectContext: context?.projectContext
          });
          
          alternatives.push(generated);
        } catch (error) {
          console.warn('Failed to generate alternative:', error);
        }
      }

      return alternatives;
    } catch (error) {
      console.warn('Failed to generate alternatives:', error);
      return [];
    }
  }

  private extractVariablesFromInput(input: string, template: any): Record<string, any> {
    // Simplified variable extraction
    const variables: Record<string, any> = {};
    
    // Extract file paths
    const pathMatches = input.match(/[^\s]+\.[a-zA-Z0-9]+/g);
    if (pathMatches) {
      variables.path = pathMatches[0];
    }
    
    // Extract quoted strings
    const stringMatches = input.match(/"([^"]+)"/g);
    if (stringMatches) {
      variables.pattern = stringMatches[0].slice(1, -1);
    }
    
    return variables;
  }

  private buildDependencyGraph(steps: WorkflowStep[]): Map<string, string[]> {
    const graph = new Map<string, string[]>();
    
    for (const step of steps) {
      graph.set(step.id, step.dependencies);
    }
    
    return graph;
  }

  private topologicalSort(graph: Map<string, string[]>): string[] {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const result: string[] = [];

    const visit = (nodeId: string) => {
      if (visiting.has(nodeId)) {
        throw new Error(`Circular dependency detected involving ${nodeId}`);
      }
      
      if (visited.has(nodeId)) {
        return;
      }

      visiting.add(nodeId);
      
      const dependencies = graph.get(nodeId) || [];
      for (const depId of dependencies) {
        visit(depId);
      }
      
      visiting.delete(nodeId);
      visited.add(nodeId);
      result.push(nodeId);
    };

    for (const nodeId of graph.keys()) {
      if (!visited.has(nodeId)) {
        visit(nodeId);
      }
    }

    return result;
  }

  private substituteVariables(command: string, variables: Record<string, any>): string {
    let result = command;
    
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      result = result.replace(regex, String(value));
    }
    
    return result;
  }

  private extractResultVariables(results: Map<string, ShellExecutionResult>): Record<string, any> {
    const variables: Record<string, any> = {};
    
    for (const [stepId, result] of results.entries()) {
      variables[`${stepId}_output`] = result.result.stdout;
      variables[`${stepId}_success`] = result.success;
      variables[`${stepId}_exit_code`] = result.result.exitCode;
    }
    
    return variables;
  }

  private async executeAction(action: string, execution: WorkflowExecution): Promise<void> {
    // Parse and execute workflow actions
    if (action.startsWith('set_variable:')) {
      const [, assignment] = action.split(':', 2);
      const [key, value] = assignment.split('=', 2);
      execution.context[key] = value;
    } else if (action === 'fail_workflow') {
      execution.status = 'failed';
    } else if (action === 'continue') {
      // Continue execution (default behavior)
    }
  }

  private generateExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private generateWorkflowId(): string {
    return `workflow_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  // Public utility methods
  getExecutionHistory(): ShellExecutionResult[] {
    return [...this.executionHistory];
  }

  getWorkflow(id: string): WorkflowExecution | undefined {
    return this.workflows.get(id);
  }

  getAllWorkflows(): WorkflowExecution[] {
    return Array.from(this.workflows.values());
  }

  async getSystemStatistics(): Promise<SystemStatistics> {
    const memoryStats = await memorySystem.getMemoryStatistics();
    const learningStats = antiHallucinationFramework.getLearningStatistics();
    
    return {
      totalExecutions: this.executionHistory.length,
      successRate: this.executionHistory.filter(e => e.success).length / Math.max(this.executionHistory.length, 1),
      averageProcessingTime: this.executionHistory.reduce((sum, e) => sum + e.metadata.processingTime, 0) / Math.max(this.executionHistory.length, 1),
      averageConfidence: this.executionHistory.reduce((sum, e) => sum + e.metadata.confidence, 0) / Math.max(this.executionHistory.length, 1),
      activeWorkflows: Array.from(this.workflows.values()).filter(w => w.status === 'running').length,
      memoryStatistics: memoryStats,
      learningStatistics: learningStats
    };
  }
}

interface SystemStatistics {
  totalExecutions: number;
  successRate: number;
  averageProcessingTime: number;
  averageConfidence: number;
  activeWorkflows: number;
  memoryStatistics: any;
  learningStatistics: any;
}

export const integratedShellSystem = new IntegratedShellSystem();
