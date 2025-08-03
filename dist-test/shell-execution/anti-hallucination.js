import { memorySystem } from '../memory-system/memory-layers.js';
export class AntiHallucinationFramework {
    verificationRules = [];
    fallbackStrategies = [];
    learningRecords = [];
    knownPatterns = new Map();
    confidenceThresholds = {
        low: 0.3,
        medium: 0.6,
        high: 0.8,
        critical: 0.95
    };
    constructor() {
        this.initializeVerificationRules();
        this.initializeFallbackStrategies();
        this.loadKnownPatterns();
    }
    async verifyCommand(parsed, translation) {
        const startTime = Date.now();
        const issues = [];
        const suggestions = [];
        const checksPerformed = [];
        const evidenceSources = [];
        const confidenceFactors = [];
        // Run all verification rules
        for (const rule of this.verificationRules) {
            try {
                const ruleResult = await rule.verify(parsed, translation);
                checksPerformed.push(rule.name);
                if (ruleResult.issues.length > 0) {
                    issues.push(...ruleResult.issues);
                }
                if (ruleResult.suggestions.length > 0) {
                    suggestions.push(...ruleResult.suggestions);
                }
                if (ruleResult.evidence) {
                    evidenceSources.push(ruleResult.evidence);
                }
                confidenceFactors.push({
                    factor: rule.name,
                    impact: ruleResult.confidenceImpact,
                    description: ruleResult.description
                });
            }
            catch (error) {
                console.error(`Verification rule ${rule.name} failed:`, error);
                issues.push({
                    type: 'logic',
                    severity: 'warning',
                    message: `Verification rule ${rule.name} encountered an error`,
                    suggestion: 'Manual review recommended'
                });
            }
        }
        // Calculate overall confidence
        const confidence = this.calculateOverallConfidence(confidenceFactors, translation.confidence);
        // Determine risk level
        const riskLevel = this.assessRiskLevel(issues, confidence);
        // Check against known patterns
        await this.checkKnownPatterns(parsed, issues, suggestions, evidenceSources);
        return {
            isValid: issues.filter(i => i.severity === 'error' || i.severity === 'critical').length === 0,
            confidence,
            issues,
            suggestions,
            riskLevel,
            metadata: {
                verificationTime: Date.now() - startTime,
                checksPerformed,
                evidenceSources,
                confidenceFactors
            }
        };
    }
    async applyFallbacks(command, verificationResult) {
        let modifiedCommand = { ...command };
        // Sort fallback strategies by priority
        const applicableStrategies = this.fallbackStrategies
            .filter(strategy => strategy.condition(verificationResult))
            .sort((a, b) => b.priority - a.priority);
        for (const strategy of applicableStrategies) {
            try {
                console.log(`Applying fallback strategy: ${strategy.name}`);
                modifiedCommand = await strategy.action(modifiedCommand, verificationResult.issues);
                // Re-verify after applying fallback
                // Note: This would require re-translation, simplified here
                break; // Apply only the highest priority strategy for now
            }
            catch (error) {
                console.error(`Fallback strategy ${strategy.name} failed:`, error);
            }
        }
        return modifiedCommand;
    }
    async validateResult(command, result, verificationResult) {
        const validation = {
            isValid: true,
            confidence: 0.8,
            anomalies: [],
            expectedVsActual: {
                expected: this.predictExpectedResult(command),
                actual: result
            },
            recommendations: []
        };
        // Check for common error patterns
        if (!result.success) {
            validation.anomalies.push({
                type: 'execution_failure',
                description: 'Command execution failed',
                severity: 'error',
                evidence: result.stderr
            });
            validation.isValid = false;
        }
        // Check output patterns
        const outputValidation = this.validateOutput(result.stdout, command);
        if (!outputValidation.isValid) {
            validation.anomalies.push(...outputValidation.anomalies);
            validation.isValid = false;
        }
        // Check execution time anomalies
        const timeValidation = this.validateExecutionTime(result.executionTime, command);
        if (!timeValidation.isValid) {
            validation.anomalies.push(...timeValidation.anomalies);
        }
        // Update confidence based on validation
        validation.confidence = this.calculateResultConfidence(validation, verificationResult);
        return validation;
    }
    async recordLearning(command, verificationResult, executionResult, userFeedback) {
        const outcome = this.determineLearningOutcome(verificationResult, executionResult, userFeedback);
        const learningRecord = {
            id: this.generateLearningId(),
            originalCommand: command,
            verificationResult,
            executionResult,
            userFeedback,
            timestamp: new Date(),
            outcome
        };
        this.learningRecords.push(learningRecord);
        // Store in memory system for long-term learning
        await memorySystem.store(learningRecord, 'pattern', {
            importance: this.calculateLearningImportance(learningRecord),
            tags: ['learning', 'command_verification', command.command],
            source: 'anti_hallucination_framework'
        });
        // Update known patterns
        await this.updateKnownPatterns(learningRecord);
        // Limit memory usage
        if (this.learningRecords.length > 1000) {
            this.learningRecords = this.learningRecords.slice(-500);
        }
    }
    getConfidenceScore(command) {
        // Calculate confidence based on historical data
        const similarCommands = this.findSimilarCommands(command);
        if (similarCommands.length === 0)
            return 0.5; // Default for unknown commands
        const successRate = similarCommands.filter(r => r.outcome === 'success' || r.outcome === 'partial_success').length / similarCommands.length;
        const avgConfidence = similarCommands.reduce((sum, r) => sum + r.verificationResult.confidence, 0) / similarCommands.length;
        return (successRate * 0.6) + (avgConfidence * 0.4);
    }
    initializeVerificationRules() {
        // Syntax verification rule
        this.verificationRules.push({
            name: 'syntax_verification',
            verify: async (parsed, translation) => {
                const issues = [];
                let confidenceImpact = 0;
                // Check for basic syntax issues
                if (!parsed.command || parsed.command.trim() === '') {
                    issues.push({
                        type: 'syntax',
                        severity: 'error',
                        message: 'Empty command',
                        suggestion: 'Provide a valid command'
                    });
                    confidenceImpact = -0.5;
                }
                // Check for suspicious patterns
                const suspiciousPatterns = [
                    /rm\s+-rf\s+\/\s*$/, // rm -rf /
                    />\s*\/dev\/sd[a-z]/, // Writing to disk devices
                    /chmod\s+777/, // Overly permissive permissions
                ];
                const commandString = `${parsed.command} ${parsed.args.join(' ')}`;
                for (const pattern of suspiciousPatterns) {
                    if (pattern.test(commandString)) {
                        issues.push({
                            type: 'security',
                            severity: 'critical',
                            message: 'Potentially dangerous command pattern detected',
                            suggestion: 'Review command carefully before execution'
                        });
                        confidenceImpact = -0.8;
                        break;
                    }
                }
                return {
                    issues,
                    suggestions: [],
                    confidenceImpact,
                    description: 'Basic syntax and pattern validation',
                    evidence: 'static_analysis'
                };
            }
        });
        // Semantic verification rule
        this.verificationRules.push({
            name: 'semantic_verification',
            verify: async (parsed, translation) => {
                const issues = [];
                const suggestions = [];
                let confidenceImpact = 0;
                // Check command-argument compatibility
                const incompatibleCombinations = [
                    { command: 'ls', args: ['-r'], issue: 'ls does not have -r flag, did you mean -R?' },
                    { command: 'grep', args: ['-l', '-n'], issue: 'grep -l and -n are conflicting options' },
                ];
                for (const combo of incompatibleCombinations) {
                    if (parsed.command === combo.command &&
                        combo.args.every(arg => parsed.args.includes(arg))) {
                        issues.push({
                            type: 'semantic',
                            severity: 'warning',
                            message: combo.issue,
                            suggestion: 'Check command documentation'
                        });
                        confidenceImpact = -0.2;
                    }
                }
                // Check for logical inconsistencies
                if (parsed.command === 'find' && parsed.args.includes('-delete') &&
                    !parsed.args.includes('-name')) {
                    issues.push({
                        type: 'logic',
                        severity: 'error',
                        message: 'find -delete without specific criteria is dangerous',
                        suggestion: 'Add specific search criteria before using -delete'
                    });
                    confidenceImpact = -0.6;
                }
                return {
                    issues,
                    suggestions,
                    confidenceImpact,
                    description: 'Semantic and logical validation',
                    evidence: 'semantic_analysis'
                };
            }
        });
        // Historical pattern verification
        this.verificationRules.push({
            name: 'historical_pattern_verification',
            verify: async (parsed, translation) => {
                const issues = [];
                const suggestions = [];
                let confidenceImpact = 0;
                // Check against historical failures
                const historicalFailures = this.learningRecords.filter(r => r.outcome === 'failure' &&
                    r.originalCommand.command === parsed.command);
                if (historicalFailures.length > 0) {
                    const failureRate = historicalFailures.length /
                        this.learningRecords.filter(r => r.originalCommand.command === parsed.command).length;
                    if (failureRate > 0.3) {
                        issues.push({
                            type: 'logic',
                            severity: 'warning',
                            message: `Command has ${(failureRate * 100).toFixed(0)}% historical failure rate`,
                            suggestion: 'Consider alternative approaches or additional validation'
                        });
                        confidenceImpact = -failureRate * 0.5;
                    }
                }
                return {
                    issues,
                    suggestions,
                    confidenceImpact,
                    description: 'Historical pattern analysis',
                    evidence: 'learning_records'
                };
            }
        });
    }
    initializeFallbackStrategies() {
        // Add safety flags strategy
        this.fallbackStrategies.push({
            name: 'add_safety_flags',
            condition: (result) => result.riskLevel === 'high' || result.riskLevel === 'critical',
            action: async (command, issues) => {
                const modifiedCommand = { ...command };
                // Add interactive flags for dangerous operations
                if (command.command === 'rm' && !command.args.includes('-i')) {
                    modifiedCommand.args = ['-i', ...command.args];
                }
                if (command.command === 'mv' && !command.args.includes('-i')) {
                    modifiedCommand.args = ['-i', ...command.args];
                }
                return modifiedCommand;
            },
            priority: 8
        });
        // Suggest alternatives strategy
        this.fallbackStrategies.push({
            name: 'suggest_alternatives',
            condition: (result) => result.confidence < 0.5,
            action: async (command, issues) => {
                const alternatives = this.getSaferAlternatives(command);
                if (alternatives.length > 0) {
                    // For now, return the first alternative
                    // In a real implementation, you might prompt the user
                    return alternatives[0];
                }
                return command;
            },
            priority: 5
        });
        // Add dry-run strategy
        this.fallbackStrategies.push({
            name: 'add_dry_run',
            condition: (result) => result.riskLevel === 'medium' || result.riskLevel === 'high',
            action: async (command, issues) => {
                const modifiedCommand = { ...command };
                // Add dry-run flags where available
                const dryRunFlags = {
                    'rsync': '--dry-run',
                    'cp': '--no-clobber',
                    'mv': '--no-clobber'
                };
                const dryRunFlag = dryRunFlags[command.command];
                if (dryRunFlag && !command.args.includes(dryRunFlag)) {
                    modifiedCommand.args = [dryRunFlag, ...command.args];
                }
                return modifiedCommand;
            },
            priority: 6
        });
    }
    async loadKnownPatterns() {
        // Load patterns from memory system
        try {
            const patternQuery = await memorySystem.retrieve({
                query: 'command patterns',
                types: ['pattern'],
                maxResults: 100
            });
            for (const entry of patternQuery.entries) {
                if (entry.content.commandPattern) {
                    this.knownPatterns.set(entry.content.pattern, {
                        pattern: entry.content.pattern,
                        successRate: entry.content.successRate || 0.5,
                        commonIssues: entry.content.commonIssues || [],
                        recommendations: entry.content.recommendations || [],
                        lastUpdated: new Date(entry.metadata.lastAccessed)
                    });
                }
            }
        }
        catch (error) {
            console.error('Failed to load known patterns:', error);
        }
    }
    calculateOverallConfidence(factors, baseConfidence) {
        let confidence = baseConfidence;
        for (const factor of factors) {
            confidence += factor.impact;
        }
        return Math.max(0, Math.min(1, confidence));
    }
    assessRiskLevel(issues, confidence) {
        const criticalIssues = issues.filter(i => i.severity === 'critical').length;
        const errorIssues = issues.filter(i => i.severity === 'error').length;
        if (criticalIssues > 0 || confidence < this.confidenceThresholds.low) {
            return 'critical';
        }
        else if (errorIssues > 0 || confidence < this.confidenceThresholds.medium) {
            return 'high';
        }
        else if (confidence < this.confidenceThresholds.high) {
            return 'medium';
        }
        else {
            return 'low';
        }
    }
    async checkKnownPatterns(command, issues, suggestions, evidenceSources) {
        const commandPattern = `${command.command} ${command.args.join(' ')}`;
        for (const [pattern, knowledge] of this.knownPatterns.entries()) {
            if (commandPattern.includes(pattern)) {
                evidenceSources.push(`known_pattern:${pattern}`);
                if (knowledge.successRate < 0.5) {
                    issues.push({
                        type: 'logic',
                        severity: 'warning',
                        message: `Pattern "${pattern}" has low success rate (${(knowledge.successRate * 100).toFixed(0)}%)`,
                        suggestion: knowledge.recommendations[0] || 'Consider alternative approach'
                    });
                }
                suggestions.push(...knowledge.recommendations);
            }
        }
    }
    validateOutput(output, command) {
        const anomalies = [];
        // Check for unexpected output patterns
        if (command.command === 'ls' && output.includes('Permission denied')) {
            anomalies.push({
                type: 'permission_error',
                description: 'Permission denied when listing directory',
                severity: 'warning',
                evidence: output
            });
        }
        // Check for empty output when output is expected
        const expectsOutput = ['ls', 'cat', 'grep', 'find', 'ps'];
        if (expectsOutput.includes(command.command) && output.trim() === '') {
            anomalies.push({
                type: 'unexpected_empty_output',
                description: 'Command expected to produce output but returned empty result',
                severity: 'info',
                evidence: 'empty_output'
            });
        }
        return {
            isValid: anomalies.filter(a => a.severity === 'error').length === 0,
            anomalies
        };
    }
    validateExecutionTime(executionTime, command) {
        const anomalies = [];
        // Define expected execution time ranges
        const timeExpectations = {
            'ls': { min: 0, max: 1000 }, // 0-1 second
            'cat': { min: 0, max: 5000 }, // 0-5 seconds
            'grep': { min: 0, max: 10000 }, // 0-10 seconds
            'find': { min: 100, max: 30000 }, // 0.1-30 seconds
        };
        const expectation = timeExpectations[command.command];
        if (expectation) {
            if (executionTime > expectation.max) {
                anomalies.push({
                    type: 'slow_execution',
                    description: `Command took ${executionTime}ms, expected max ${expectation.max}ms`,
                    severity: 'warning',
                    evidence: `execution_time:${executionTime}`
                });
            }
        }
        return {
            isValid: anomalies.filter(a => a.severity === 'error').length === 0,
            anomalies
        };
    }
    predictExpectedResult(command) {
        // Simple prediction based on command type
        const predictions = {
            'ls': { type: 'file_list', format: 'lines' },
            'cat': { type: 'file_content', format: 'text' },
            'grep': { type: 'search_results', format: 'lines' },
            'find': { type: 'file_paths', format: 'lines' },
        };
        return predictions[command.command] || { type: 'unknown', format: 'text' };
    }
    calculateResultConfidence(validation, verificationResult) {
        let confidence = verificationResult.confidence;
        // Reduce confidence for anomalies
        const errorAnomalies = validation.anomalies.filter(a => a.severity === 'error').length;
        const warningAnomalies = validation.anomalies.filter(a => a.severity === 'warning').length;
        confidence -= errorAnomalies * 0.3;
        confidence -= warningAnomalies * 0.1;
        return Math.max(0, Math.min(1, confidence));
    }
    determineLearningOutcome(verificationResult, executionResult, userFeedback) {
        if (userFeedback) {
            return userFeedback.wasCorrect ? 'success' : 'user_corrected';
        }
        if (!executionResult) {
            return verificationResult.isValid ? 'success' : 'failure';
        }
        if (executionResult.success && verificationResult.isValid) {
            return 'success';
        }
        else if (executionResult.success && !verificationResult.isValid) {
            return 'partial_success';
        }
        else {
            return 'failure';
        }
    }
    calculateLearningImportance(record) {
        let importance = 0.5;
        // Boost importance for failures and corrections
        if (record.outcome === 'failure' || record.outcome === 'user_corrected') {
            importance += 0.3;
        }
        // Boost importance for low-confidence commands that succeeded
        if (record.outcome === 'success' && record.verificationResult.confidence < 0.5) {
            importance += 0.2;
        }
        // Boost importance for critical risk commands
        if (record.verificationResult.riskLevel === 'critical') {
            importance += 0.2;
        }
        return Math.max(0, Math.min(1, importance));
    }
    async updateKnownPatterns(record) {
        const commandPattern = `${record.originalCommand.command} ${record.originalCommand.args.join(' ')}`;
        const existing = this.knownPatterns.get(commandPattern);
        if (existing) {
            // Update existing pattern
            const totalRecords = this.learningRecords.filter(r => `${r.originalCommand.command} ${r.originalCommand.args.join(' ')}` === commandPattern).length;
            const successfulRecords = this.learningRecords.filter(r => `${r.originalCommand.command} ${r.originalCommand.args.join(' ')}` === commandPattern &&
                (r.outcome === 'success' || r.outcome === 'partial_success')).length;
            existing.successRate = successfulRecords / totalRecords;
            existing.lastUpdated = new Date();
        }
        else {
            // Create new pattern
            this.knownPatterns.set(commandPattern, {
                pattern: commandPattern,
                successRate: record.outcome === 'success' || record.outcome === 'partial_success' ? 1 : 0,
                commonIssues: record.verificationResult.issues.map(i => i.message),
                recommendations: record.verificationResult.suggestions,
                lastUpdated: new Date()
            });
        }
    }
    findSimilarCommands(command) {
        return this.learningRecords.filter(record => {
            const similarity = this.calculateCommandSimilarity(command, record.originalCommand);
            return similarity > 0.7;
        });
    }
    calculateCommandSimilarity(cmd1, cmd2) {
        if (cmd1.command !== cmd2.command)
            return 0;
        const args1 = new Set(cmd1.args);
        const args2 = new Set(cmd2.args);
        const intersection = new Set([...args1].filter(arg => args2.has(arg)));
        const union = new Set([...args1, ...args2]);
        return union.size > 0 ? intersection.size / union.size : 1;
    }
    getSaferAlternatives(command) {
        const alternatives = [];
        // Define safer alternatives for risky commands
        if (command.command === 'rm' && command.args.includes('-rf')) {
            alternatives.push({
                ...command,
                command: 'mv',
                args: command.args.filter(arg => arg !== '-rf').concat(['/tmp/deleted_' + Date.now()])
            });
        }
        return alternatives;
    }
    generateLearningId() {
        return `learn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }
    // Public utility methods
    getVerificationRules() {
        return this.verificationRules;
    }
    getFallbackStrategies() {
        return this.fallbackStrategies;
    }
    getLearningStatistics() {
        const total = this.learningRecords.length;
        const outcomes = this.learningRecords.reduce((acc, record) => {
            acc[record.outcome] = (acc[record.outcome] || 0) + 1;
            return acc;
        }, {});
        return {
            totalRecords: total,
            outcomeDistribution: outcomes,
            averageConfidence: total > 0 ?
                this.learningRecords.reduce((sum, r) => sum + r.verificationResult.confidence, 0) / total : 0,
            knownPatterns: this.knownPatterns.size,
            successRate: total > 0 ?
                (outcomes.success || 0) / total : 0
        };
    }
}
export const antiHallucinationFramework = new AntiHallucinationFramework();
