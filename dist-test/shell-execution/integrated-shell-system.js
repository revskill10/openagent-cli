// integrated-shell-system.ts - Main shell execution system integrating all components
import { commandParser } from './command-parser.js';
import { commandTranslator } from './command-translator.js';
import { shellExecutor } from './shell-executor.js';
import { bytecodeOptimizer } from './bytecode-optimizer.js';
import { templateGenerator } from './template-generator.js';
import { antiHallucinationFramework } from './anti-hallucination.js';
import { memorySystem } from '../memory-system/memory-layers.js';
import { systemEventEmitter } from '../system-events.js';
export class IntegratedShellSystem {
    workflows = new Map();
    executionHistory = [];
    isInitialized = false;
    async initialize() {
        if (this.isInitialized)
            return;
        console.log('Initializing Integrated Shell System...');
        // Initialize all subsystems
        await shellExecutor.initialize();
        await memorySystem.initialize();
        console.log('Shell system initialization complete');
        this.isInitialized = true;
    }
    async executeCommand(request) {
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
            let generatedCommand;
            if (request.options?.useTemplates !== false) {
                generatedCommand = await this.tryTemplateGeneration(request.input, request.context);
                if (generatedCommand) {
                    // Use generated command instead of parsed input
                    const templateParsed = await commandParser.parseInput(generatedCommand.command);
                    Object.assign(parsed, templateParsed);
                }
            }
            // Step 3: Translate command for current platform
            const translation = await commandTranslator.translateCommand(`${parsed.command} ${parsed.args.join(' ')}`);
            // Step 4: Compile to bytecode for optimization
            let bytecode;
            if (request.options?.enableOptimization !== false) {
                bytecode = await bytecodeOptimizer.compileCommand(parsed, 'basic');
            }
            // Step 5: Verify command safety and correctness
            let verification;
            let fallbacksApplied = [];
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
                        const newTranslation = await commandTranslator.translateCommand(`${parsed.command} ${parsed.args.join(' ')}`);
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
            const executionOptions = {
                ...request.options,
                cwd: request.context?.workingDirectory,
                env: request.context?.environment
            };
            const result = await shellExecutor.executeCommand(`${translation.command} ${translation.args.join(' ')}`, executionOptions);
            // Step 8: Validate results
            if (verification) {
                const resultValidation = await antiHallucinationFramework.validateResult(parsed, result, verification);
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
            const executionResult = {
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
        }
        catch (error) {
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
                    parsedCommand: { id: '', type: 'simple', command: '', args: [], pipes: [], redirections: [], variables: [], conditions: [], metadata: {}, confidence: 0 },
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
    async executeWorkflow(steps, context = {}) {
        const workflowId = this.generateWorkflowId();
        const execution = {
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
                if (!step)
                    continue;
                // Check dependencies
                const dependenciesMet = step.dependencies.every(depId => execution.results.has(depId) && execution.results.get(depId).success);
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
                        environment: process.env,
                        userPreferences: {
                            safetyLevel: 'moderate',
                            confirmDangerous: false,
                            verboseOutput: false,
                            preferredShell: 'bash',
                            autoCorrect: true,
                            learningEnabled: true
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
                }
                else {
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
        }
        catch (error) {
            console.error('Workflow execution failed:', error);
            execution.status = 'failed';
        }
        return execution;
    }
    async parseInput(input, context) {
        // Determine input format and parse accordingly
        return await commandParser.parseInput(input);
    }
    async tryTemplateGeneration(input, context) {
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
        }
        catch (error) {
            console.warn('Template generation failed:', error);
        }
        return undefined;
    }
    async storeExecutionMemory(request, parsed, result, verification) {
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
    generateSuggestions(parsed, result, verification) {
        const suggestions = [];
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
    async generateAlternatives(input, context) {
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
            const alternatives = [];
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
                }
                catch (error) {
                    console.warn('Failed to generate alternative:', error);
                }
            }
            return alternatives;
        }
        catch (error) {
            console.warn('Failed to generate alternatives:', error);
            return [];
        }
    }
    extractVariablesFromInput(input, template) {
        // Simplified variable extraction
        const variables = {};
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
    buildDependencyGraph(steps) {
        const graph = new Map();
        for (const step of steps) {
            graph.set(step.id, step.dependencies);
        }
        return graph;
    }
    topologicalSort(graph) {
        const visited = new Set();
        const visiting = new Set();
        const result = [];
        const visit = (nodeId) => {
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
    substituteVariables(command, variables) {
        let result = command;
        for (const [key, value] of Object.entries(variables)) {
            const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
            result = result.replace(regex, String(value));
        }
        return result;
    }
    extractResultVariables(results) {
        const variables = {};
        for (const [stepId, result] of results.entries()) {
            variables[`${stepId}_output`] = result.result.stdout;
            variables[`${stepId}_success`] = result.success;
            variables[`${stepId}_exit_code`] = result.result.exitCode;
        }
        return variables;
    }
    async executeAction(action, execution) {
        // Parse and execute workflow actions
        if (action.startsWith('set_variable:')) {
            const [, assignment] = action.split(':', 2);
            const [key, value] = assignment.split('=', 2);
            execution.context[key] = value;
        }
        else if (action === 'fail_workflow') {
            execution.status = 'failed';
        }
        else if (action === 'continue') {
            // Continue execution (default behavior)
        }
    }
    generateExecutionId() {
        return `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }
    generateWorkflowId() {
        return `workflow_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }
    // Public utility methods
    getExecutionHistory() {
        return [...this.executionHistory];
    }
    getWorkflow(id) {
        return this.workflows.get(id);
    }
    getAllWorkflows() {
        return Array.from(this.workflows.values());
    }
    async getSystemStatistics() {
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
export const integratedShellSystem = new IntegratedShellSystem();
