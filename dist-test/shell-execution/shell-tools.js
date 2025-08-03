// shell-tools.ts - Shell execution tools for the openagent system
import { integratedShellSystem } from './integrated-shell-system.js';
import { templateGenerator } from './template-generator.js';
import { antiHallucinationFramework } from './anti-hallucination.js';
import { memorySystem } from '../memory-system/memory-layers.js';
// Execute shell command with full AI assistance
export async function executeShellCommand(command, options = {}) {
    try {
        const request = {
            input: command,
            context: {
                workingDirectory: options.workingDirectory || process.cwd(),
                environment: options.environment || process.env,
                userPreferences: {
                    safetyLevel: options.safetyLevel || 'moderate',
                    confirmDangerous: options.safetyLevel === 'strict',
                    verboseOutput: false,
                    preferredShell: 'bash',
                    autoCorrect: true,
                    learningEnabled: options.enableLearning !== false
                }
            },
            options: {
                useTemplates: options.enableTemplates !== false,
                enableOptimization: options.enableOptimization !== false,
                enableVerification: true,
                enableLearning: options.enableLearning !== false,
                confidenceThreshold: options.confidenceThreshold || 0.6,
                dryRun: options.dryRun || false,
                sandbox: options.safetyLevel === 'strict'
            }
        };
        const result = await integratedShellSystem.executeCommand(request);
        return {
            success: result.success,
            output: result.result.stdout,
            error: result.result.stderr,
            exitCode: result.result.exitCode,
            executionTime: result.result.executionTime,
            confidence: result.metadata.confidence,
            riskLevel: result.metadata.riskLevel,
            suggestions: result.suggestions || [],
            alternatives: result.alternatives?.map(alt => alt.command) || [],
            metadata: {
                originalCommand: command,
                translatedCommand: `${result.metadata.translation.command} ${result.metadata.translation.args.join(' ')}`,
                processingTime: result.metadata.processingTime,
                fallbacksApplied: result.metadata.fallbacksApplied,
                verificationIssues: result.metadata.verification?.issues || [],
                warnings: result.result.warnings
            }
        };
    }
    catch (error) {
        return {
            success: false,
            output: '',
            error: error instanceof Error ? error.message : String(error),
            exitCode: -1,
            executionTime: 0,
            confidence: 0,
            riskLevel: 'unknown',
            suggestions: ['Command execution failed - check syntax and permissions'],
            alternatives: [],
            metadata: {
                originalCommand: command,
                translatedCommand: command,
                processingTime: 0,
                fallbacksApplied: [],
                verificationIssues: [],
                warnings: []
            }
        };
    }
}
// Generate shell command from natural language description
export async function generateShellCommand(description, options = {}) {
    try {
        const suggestions = await templateGenerator.suggestTemplates(description, {
            workingDirectory: options.workingDirectory || process.cwd(),
            environment: options.environment || process.env,
            platform: process.platform,
            shell: 'bash',
            userPreferences: {
                verboseOutput: false,
                confirmDestructive: options.safetyLevel === 'strict',
                preferredFlags: {},
                aliasMap: {}
            }
        });
        if (suggestions.length === 0) {
            return {
                success: false,
                commands: [],
                message: 'No suitable command templates found for the description',
                suggestions: [
                    'Try being more specific about the operation you want to perform',
                    'Use keywords like "list", "find", "copy", "delete", "create", etc.',
                    'Specify file types or patterns if working with files'
                ]
            };
        }
        const commands = [];
        for (const suggestion of suggestions.slice(0, 3)) {
            try {
                // Extract variables from description (simplified)
                const variables = extractVariablesFromDescription(description, suggestion.template);
                const generated = await templateGenerator.generateCommand(suggestion.template.id, variables, {
                    workingDirectory: options.workingDirectory || process.cwd(),
                    environment: options.environment || process.env,
                    platform: process.platform,
                    shell: 'bash',
                    userPreferences: {
                        verboseOutput: false,
                        confirmDestructive: options.safetyLevel === 'strict',
                        preferredFlags: {},
                        aliasMap: {}
                    }
                });
                commands.push({
                    command: generated.command,
                    description: suggestion.template.description,
                    confidence: generated.metadata.confidence,
                    safetyLevel: generated.metadata.safetyLevel,
                    estimatedTime: generated.metadata.estimatedExecutionTime,
                    template: suggestion.template.name
                });
            }
            catch (error) {
                console.warn('Failed to generate command from template:', error);
            }
        }
        return {
            success: commands.length > 0,
            commands,
            message: commands.length > 0
                ? `Generated ${commands.length} command option(s) from your description`
                : 'Failed to generate commands from available templates',
            suggestions: commands.length === 0 ? [
                'Try a different description or be more specific',
                'Check if the operation you want is supported'
            ] : []
        };
    }
    catch (error) {
        return {
            success: false,
            commands: [],
            message: `Command generation failed: ${error instanceof Error ? error.message : String(error)}`,
            suggestions: ['Try a simpler description or use direct shell commands']
        };
    }
}
// Execute a complex workflow with multiple steps
export async function executeWorkflow(workflow, options = {}) {
    try {
        const execution = await integratedShellSystem.executeWorkflow(workflow.steps, workflow.variables || {});
        const results = Array.from(execution.results.entries()).map(([stepId, result]) => ({
            stepId,
            stepName: workflow.steps.find(s => s.id === stepId)?.name || stepId,
            success: result.success,
            output: result.result.stdout,
            error: result.result.stderr,
            executionTime: result.result.executionTime,
            confidence: result.metadata.confidence
        }));
        const overallSuccess = execution.status === 'completed';
        const totalTime = results.reduce((sum, r) => sum + r.executionTime, 0);
        const averageConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / Math.max(results.length, 1);
        return {
            success: overallSuccess,
            status: execution.status,
            workflowId: execution.id,
            results,
            summary: {
                totalSteps: workflow.steps.length,
                completedSteps: results.filter(r => r.success).length,
                failedSteps: results.filter(r => !r.success).length,
                totalExecutionTime: totalTime,
                averageConfidence
            },
            message: overallSuccess
                ? `Workflow "${workflow.name}" completed successfully`
                : `Workflow "${workflow.name}" failed or was incomplete`
        };
    }
    catch (error) {
        return {
            success: false,
            status: 'failed',
            workflowId: null,
            results: [],
            summary: {
                totalSteps: workflow.steps.length,
                completedSteps: 0,
                failedSteps: 0,
                totalExecutionTime: 0,
                averageConfidence: 0
            },
            message: `Workflow execution failed: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}
// Get shell command suggestions based on context
export async function getShellSuggestions(context, options = {}) {
    try {
        // Search memory for similar contexts
        const memoryResults = await memorySystem.retrieve({
            query: context,
            types: ['workflow', 'pattern'],
            maxResults: 10
        });
        const suggestions = [];
        // Extract successful commands from memory
        for (const entry of memoryResults.entries) {
            if (entry.content.type === 'command_execution' && entry.content.result?.success) {
                suggestions.push({
                    command: entry.content.input,
                    description: `Previously successful command`,
                    confidence: entry.metadata.importance,
                    source: 'memory',
                    lastUsed: entry.metadata.lastAccessed
                });
            }
            else if (entry.content.type === 'command_pattern' && entry.content.success) {
                suggestions.push({
                    command: entry.content.pattern,
                    description: `Learned command pattern`,
                    confidence: entry.content.confidence,
                    source: 'pattern',
                    successRate: entry.content.success ? 1 : 0
                });
            }
        }
        // Get template suggestions
        const templateSuggestions = await templateGenerator.suggestTemplates(context, {
            workingDirectory: options.workingDirectory || process.cwd(),
            environment: options.environment || process.env,
            platform: process.platform,
            shell: 'bash',
            userPreferences: {
                verboseOutput: false,
                confirmDestructive: options.safetyLevel === 'strict',
                preferredFlags: {},
                aliasMap: {}
            }
        });
        for (const suggestion of templateSuggestions.slice(0, 5)) {
            suggestions.push({
                command: `Template: ${suggestion.template.name}`,
                description: suggestion.template.description,
                confidence: suggestion.relevance,
                source: 'template',
                category: suggestion.template.category
            });
        }
        // Sort by confidence
        suggestions.sort((a, b) => b.confidence - a.confidence);
        return {
            success: true,
            suggestions: suggestions.slice(0, 10),
            context,
            message: suggestions.length > 0
                ? `Found ${suggestions.length} relevant command suggestions`
                : 'No specific suggestions found for this context'
        };
    }
    catch (error) {
        return {
            success: false,
            suggestions: [],
            context,
            message: `Failed to get suggestions: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}
// Analyze shell command for safety and correctness
export async function analyzeShellCommand(command, options = {}) {
    try {
        // Parse the command
        const parsed = await integratedShellSystem['parseInput'](command);
        // Translate for current platform
        const translation = await integratedShellSystem['commandTranslator'].translateCommand(command);
        // Verify safety and correctness
        const verification = await antiHallucinationFramework.verifyCommand(parsed, translation);
        // Get confidence score
        const confidenceScore = antiHallucinationFramework.getConfidenceScore(parsed);
        return {
            success: true,
            analysis: {
                isValid: verification.isValid,
                confidence: verification.confidence,
                riskLevel: verification.riskLevel,
                issues: verification.issues.map(issue => ({
                    type: issue.type,
                    severity: issue.severity,
                    message: issue.message,
                    suggestion: issue.suggestion
                })),
                suggestions: verification.suggestions,
                metadata: {
                    originalCommand: command,
                    translatedCommand: `${translation.command} ${translation.args.join(' ')}`,
                    commandType: parsed.type,
                    complexity: parsed.metadata?.complexity || 0,
                    estimatedExecutionTime: verification.metadata.verificationTime || 0,
                    platformCompatible: translation.confidence > 0.7,
                    historicalConfidence: confidenceScore
                }
            },
            recommendations: generateRecommendations(verification, translation),
            message: verification.isValid
                ? 'Command analysis completed - no critical issues found'
                : 'Command analysis found potential issues - review before execution'
        };
    }
    catch (error) {
        return {
            success: false,
            analysis: null,
            recommendations: [],
            message: `Command analysis failed: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}
// Get system statistics and performance metrics
export async function getShellSystemStats() {
    try {
        const stats = await integratedShellSystem.getSystemStatistics();
        const learningStats = antiHallucinationFramework.getLearningStatistics();
        return {
            success: true,
            statistics: {
                execution: {
                    totalCommands: stats.totalExecutions,
                    successRate: (stats.successRate * 100).toFixed(1) + '%',
                    averageProcessingTime: Math.round(stats.averageProcessingTime) + 'ms',
                    averageConfidence: (stats.averageConfidence * 100).toFixed(1) + '%'
                },
                workflows: {
                    activeWorkflows: stats.activeWorkflows,
                    totalWorkflows: integratedShellSystem.getAllWorkflows().length
                },
                learning: {
                    totalLearningRecords: learningStats.totalRecords,
                    successRate: (learningStats.successRate * 100).toFixed(1) + '%',
                    knownPatterns: learningStats.knownPatterns,
                    averageConfidence: (learningStats.averageConfidence * 100).toFixed(1) + '%'
                },
                memory: {
                    totalEntries: stats.memoryStatistics.totalEntries,
                    memoryUsage: formatBytes(stats.memoryStatistics.memoryUsage),
                    averageImportance: (stats.memoryStatistics.averageImportance * 100).toFixed(1) + '%'
                }
            },
            message: 'System statistics retrieved successfully'
        };
    }
    catch (error) {
        return {
            success: false,
            statistics: null,
            message: `Failed to get system statistics: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}
// Helper functions
function extractVariablesFromDescription(description, template) {
    const variables = {};
    // Extract common patterns from natural language
    const patterns = [
        { regex: /files?\s+named?\s+["']([^"']+)["']/i, variable: 'pattern' },
        { regex: /files?\s+with\s+extension\s+\.?(\w+)/i, variable: 'extension' },
        { regex: /in\s+(?:the\s+)?(?:directory\s+)?["']?([^"'\s]+)["']?/i, variable: 'path' },
        { regex: /to\s+["']?([^"'\s]+)["']?/i, variable: 'destination' },
        { regex: /from\s+["']?([^"'\s]+)["']?/i, variable: 'source' },
        { regex: /containing\s+["']([^"']+)["']/i, variable: 'content' }
    ];
    for (const pattern of patterns) {
        const match = description.match(pattern.regex);
        if (match) {
            variables[pattern.variable] = match[1];
        }
    }
    // Set defaults for template variables
    if (template.variables) {
        for (const templateVar of template.variables) {
            if (!variables[templateVar.name] && templateVar.defaultValue) {
                variables[templateVar.name] = templateVar.defaultValue;
            }
        }
    }
    return variables;
}
function generateRecommendations(verification, translation) {
    const recommendations = [];
    if (verification.confidence < 0.5) {
        recommendations.push('Consider using a more specific or well-known command');
    }
    if (verification.riskLevel === 'high' || verification.riskLevel === 'critical') {
        recommendations.push('Review command carefully - it may modify or delete files');
        recommendations.push('Consider running with --dry-run flag first if available');
    }
    if (translation.confidence < 0.7) {
        recommendations.push('Command may not be fully compatible with current platform');
    }
    if (verification.issues.some((issue) => issue.type === 'security')) {
        recommendations.push('Security concerns detected - verify command is from trusted source');
    }
    if (verification.issues.some((issue) => issue.type === 'syntax')) {
        recommendations.push('Syntax issues detected - check command format and arguments');
    }
    return recommendations;
}
function formatBytes(bytes) {
    if (bytes === 0)
        return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
// Export all tools
export const shellTools = {
    executeShellCommand,
    generateShellCommand,
    executeWorkflow,
    getShellSuggestions,
    analyzeShellCommand,
    getShellSystemStats
};
