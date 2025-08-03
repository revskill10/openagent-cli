// bytecode-optimizer.ts - Bytecode compilation and optimization for command patterns
import { createHash } from 'crypto';
export class BytecodeOptimizer {
    compiledCache = new Map();
    templatePatterns = new Map();
    optimizationRules = [];
    constantPool = new Map();
    constructor() {
        this.initializeOptimizationRules();
        this.initializeTemplatePatterns();
    }
    async compileCommand(parsed, optimizationLevel = 'basic') {
        const startTime = Date.now();
        const cacheKey = this.generateCacheKey(parsed, optimizationLevel);
        // Check cache first
        const cached = this.compiledCache.get(cacheKey);
        if (cached) {
            return cached;
        }
        // Check for template patterns
        const template = this.findMatchingTemplate(parsed);
        if (template) {
            return this.compileFromTemplate(parsed, template, optimizationLevel);
        }
        // Compile from scratch
        const instructions = this.generateInstructions(parsed);
        const optimized = this.optimizeInstructions(instructions, optimizationLevel);
        const compiled = {
            id: this.generateId(),
            instructions: optimized,
            constants: this.extractConstants(parsed),
            variables: this.extractVariables(parsed),
            metadata: {
                originalCommand: parsed,
                compilationTime: Date.now() - startTime,
                optimizations: this.getAppliedOptimizations(instructions, optimized),
                estimatedExecutionTime: this.estimateExecutionTime(optimized),
                memoryUsage: this.estimateMemoryUsage(optimized),
                complexity: this.calculateComplexity(optimized)
            },
            optimizationLevel
        };
        // Cache the result
        this.compiledCache.set(cacheKey, compiled);
        // Update template patterns if this is a new pattern
        this.updateTemplatePatterns(parsed, compiled);
        return compiled;
    }
    generateInstructions(parsed) {
        const instructions = [];
        let lineNumber = 0;
        // Add input validation
        instructions.push({
            opcode: 'VALIDATE',
            operands: ['input', parsed.command],
            metadata: {
                lineNumber: lineNumber++,
                sourceCommand: parsed.command,
                estimatedCost: 10,
                dependencies: [],
                canParallelize: false
            }
        });
        // Load variables
        parsed.variables.forEach(variable => {
            instructions.push({
                opcode: 'LOAD_CONST',
                operands: [variable.value],
                metadata: {
                    lineNumber: lineNumber++,
                    sourceCommand: `${variable.name}=${variable.value}`,
                    estimatedCost: 5,
                    dependencies: [],
                    canParallelize: true
                }
            });
            instructions.push({
                opcode: 'STORE_VAR',
                operands: [variable.name],
                metadata: {
                    lineNumber: lineNumber++,
                    sourceCommand: `${variable.name}=${variable.value}`,
                    estimatedCost: 5,
                    dependencies: [],
                    canParallelize: false
                }
            });
        });
        // Handle conditional operations
        parsed.conditions.forEach(condition => {
            instructions.push({
                opcode: 'CONDITION',
                operands: [condition.condition, condition.operator],
                metadata: {
                    lineNumber: lineNumber++,
                    sourceCommand: condition.condition,
                    estimatedCost: 20,
                    dependencies: [],
                    canParallelize: false
                }
            });
        });
        // Main command execution
        instructions.push({
            opcode: 'EXEC_CMD',
            operands: [parsed.command, ...parsed.args],
            metadata: {
                lineNumber: lineNumber++,
                sourceCommand: `${parsed.command} ${parsed.args.join(' ')}`,
                estimatedCost: 100,
                dependencies: parsed.variables.map(v => v.name),
                canParallelize: parsed.pipes.length === 0
            }
        });
        // Handle pipes
        parsed.pipes.forEach(pipe => {
            instructions.push({
                opcode: 'PIPE',
                operands: [pipe.sourceCommand, pipe.targetCommand, pipe.pipeType],
                metadata: {
                    lineNumber: lineNumber++,
                    sourceCommand: `${pipe.sourceCommand} ${pipe.pipeType} ${pipe.targetCommand}`,
                    estimatedCost: 50,
                    dependencies: [],
                    canParallelize: false
                }
            });
        });
        // Handle redirections
        parsed.redirections.forEach(redirect => {
            instructions.push({
                opcode: 'REDIRECT',
                operands: [redirect.type, redirect.target],
                metadata: {
                    lineNumber: lineNumber++,
                    sourceCommand: `${redirect.type} ${redirect.target}`,
                    estimatedCost: 30,
                    dependencies: [],
                    canParallelize: true
                }
            });
        });
        // Add error handling
        instructions.push({
            opcode: 'ERROR_HANDLER',
            operands: ['default'],
            metadata: {
                lineNumber: lineNumber++,
                sourceCommand: 'error_handler',
                estimatedCost: 15,
                dependencies: [],
                canParallelize: false
            }
        });
        return instructions;
    }
    optimizeInstructions(instructions, level) {
        let optimized = [...instructions];
        const appliedOptimizations = [];
        // Apply optimization rules based on level
        const rulesToApply = this.optimizationRules.filter(rule => {
            switch (level) {
                case 'none': return false;
                case 'basic': return rule.priority <= 3;
                case 'aggressive': return rule.priority <= 7;
                case 'experimental': return true;
                default: return rule.priority <= 3;
            }
        });
        // Sort rules by priority
        rulesToApply.sort((a, b) => b.priority - a.priority);
        // Apply each rule
        for (const rule of rulesToApply) {
            if (rule.pattern(optimized)) {
                const before = optimized.length;
                optimized = rule.transform(optimized);
                const after = optimized.length;
                if (before !== after || this.instructionsChanged(instructions, optimized)) {
                    appliedOptimizations.push(rule.name);
                }
            }
        }
        return optimized;
    }
    initializeOptimizationRules() {
        // Dead code elimination
        this.optimizationRules.push({
            name: 'dead_code_elimination',
            priority: 8,
            description: 'Remove unreachable instructions',
            pattern: (instructions) => {
                return instructions.some((inst, i) => inst.opcode === 'RETURN' && i < instructions.length - 1);
            },
            transform: (instructions) => {
                const returnIndex = instructions.findIndex(inst => inst.opcode === 'RETURN');
                return returnIndex >= 0 ? instructions.slice(0, returnIndex + 1) : instructions;
            }
        });
        // Constant folding
        this.optimizationRules.push({
            name: 'constant_folding',
            priority: 7,
            description: 'Fold constant expressions',
            pattern: (instructions) => {
                return instructions.some(inst => inst.opcode === 'LOAD_CONST' &&
                    inst.operands[0].match(/^\d+[\+\-\*\/]\d+$/));
            },
            transform: (instructions) => {
                return instructions.map(inst => {
                    if (inst.opcode === 'LOAD_CONST' && inst.operands[0].match(/^\d+[\+\-\*\/]\d+$/)) {
                        try {
                            const result = eval(inst.operands[0]);
                            return { ...inst, operands: [result.toString()] };
                        }
                        catch {
                            return inst;
                        }
                    }
                    return inst;
                });
            }
        });
        // Instruction combining
        this.optimizationRules.push({
            name: 'instruction_combining',
            priority: 6,
            description: 'Combine adjacent compatible instructions',
            pattern: (instructions) => {
                return instructions.some((inst, i) => i < instructions.length - 1 &&
                    inst.opcode === 'LOAD_CONST' &&
                    instructions[i + 1].opcode === 'STORE_VAR');
            },
            transform: (instructions) => {
                const result = [];
                for (let i = 0; i < instructions.length; i++) {
                    const current = instructions[i];
                    const next = instructions[i + 1];
                    if (current.opcode === 'LOAD_CONST' &&
                        next?.opcode === 'STORE_VAR') {
                        // Combine into a single instruction
                        result.push({
                            opcode: 'STORE_VAR',
                            operands: [next.operands[0], current.operands[0]],
                            metadata: {
                                ...current.metadata,
                                estimatedCost: current.metadata.estimatedCost + next.metadata.estimatedCost - 5
                            }
                        });
                        i++; // Skip next instruction
                    }
                    else {
                        result.push(current);
                    }
                }
                return result;
            }
        });
        // Parallel execution optimization
        this.optimizationRules.push({
            name: 'parallel_execution',
            priority: 5,
            description: 'Identify parallelizable operations',
            pattern: (instructions) => {
                return instructions.filter(inst => inst.metadata.canParallelize).length >= 2;
            },
            transform: (instructions) => {
                const result = [];
                const parallelizable = [];
                for (const inst of instructions) {
                    if (inst.metadata.canParallelize && parallelizable.length === 0) {
                        parallelizable.push(inst);
                    }
                    else if (inst.metadata.canParallelize && parallelizable.length > 0) {
                        parallelizable.push(inst);
                    }
                    else {
                        if (parallelizable.length > 1) {
                            result.push({
                                opcode: 'PARALLEL',
                                operands: parallelizable.map(p => p.metadata.lineNumber.toString()),
                                metadata: {
                                    lineNumber: parallelizable[0].metadata.lineNumber,
                                    sourceCommand: 'parallel_block',
                                    estimatedCost: Math.max(...parallelizable.map(p => p.metadata.estimatedCost)),
                                    dependencies: [],
                                    canParallelize: false
                                }
                            });
                            result.push(...parallelizable);
                            result.push({
                                opcode: 'SYNC',
                                operands: [],
                                metadata: {
                                    lineNumber: parallelizable[parallelizable.length - 1].metadata.lineNumber + 1,
                                    sourceCommand: 'sync_point',
                                    estimatedCost: 10,
                                    dependencies: [],
                                    canParallelize: false
                                }
                            });
                        }
                        else {
                            result.push(...parallelizable);
                        }
                        parallelizable.length = 0;
                        result.push(inst);
                    }
                }
                return result;
            }
        });
    }
    initializeTemplatePatterns() {
        // Common file listing pattern
        this.templatePatterns.set('list_files', {
            id: 'list_files',
            name: 'List Files',
            pattern: /^ls\s*(-[alh]*\s*)?(.*)$/,
            bytecode: [
                {
                    opcode: 'VALIDATE',
                    operands: ['path', '{path}'],
                    metadata: { lineNumber: 0, sourceCommand: 'validate', estimatedCost: 10, dependencies: [], canParallelize: false }
                },
                {
                    opcode: 'EXEC_CMD',
                    operands: ['ls', '{flags}', '{path}'],
                    metadata: { lineNumber: 1, sourceCommand: 'ls', estimatedCost: 50, dependencies: [], canParallelize: true }
                }
            ],
            variables: [
                { name: 'path', type: 'path', scope: 'local', defaultValue: '.' },
                { name: 'flags', type: 'string', scope: 'local', defaultValue: '-la' }
            ],
            usage: 0,
            lastUsed: new Date()
        });
        // File search pattern
        this.templatePatterns.set('find_files', {
            id: 'find_files',
            name: 'Find Files',
            pattern: /^find\s+(.+?)\s+-name\s+(.+)$/,
            bytecode: [
                {
                    opcode: 'VALIDATE',
                    operands: ['path', '{searchPath}'],
                    metadata: { lineNumber: 0, sourceCommand: 'validate', estimatedCost: 10, dependencies: [], canParallelize: false }
                },
                {
                    opcode: 'EXEC_CMD',
                    operands: ['find', '{searchPath}', '-name', '{pattern}'],
                    metadata: { lineNumber: 1, sourceCommand: 'find', estimatedCost: 200, dependencies: [], canParallelize: true }
                }
            ],
            variables: [
                { name: 'searchPath', type: 'path', scope: 'local', defaultValue: '.' },
                { name: 'pattern', type: 'pattern', scope: 'local', constraints: { required: true } }
            ],
            usage: 0,
            lastUsed: new Date()
        });
    }
    findMatchingTemplate(parsed) {
        const commandString = `${parsed.command} ${parsed.args.join(' ')}`;
        for (const template of this.templatePatterns.values()) {
            if (template.pattern.test(commandString)) {
                template.usage++;
                template.lastUsed = new Date();
                return template;
            }
        }
        return undefined;
    }
    compileFromTemplate(parsed, template, optimizationLevel) {
        const commandString = `${parsed.command} ${parsed.args.join(' ')}`;
        const match = commandString.match(template.pattern);
        if (!match) {
            throw new Error('Template pattern match failed');
        }
        // Substitute variables in bytecode
        const instructions = template.bytecode.map(inst => ({
            ...inst,
            operands: inst.operands.map(operand => {
                if (operand.startsWith('{') && operand.endsWith('}')) {
                    const varName = operand.slice(1, -1);
                    const matchIndex = template.variables.findIndex(v => v.name === varName);
                    return match[matchIndex + 1] || template.variables[matchIndex]?.defaultValue || operand;
                }
                return operand;
            })
        }));
        return {
            id: this.generateId(),
            instructions: this.optimizeInstructions(instructions, optimizationLevel),
            constants: this.extractConstants(parsed),
            variables: new Map(template.variables.map(v => [v.name, v])),
            metadata: {
                originalCommand: parsed,
                compilationTime: 5, // Template compilation is fast
                optimizations: ['template_matching'],
                estimatedExecutionTime: this.estimateExecutionTime(instructions),
                memoryUsage: this.estimateMemoryUsage(instructions),
                complexity: template.bytecode.length
            },
            optimizationLevel
        };
    }
    extractConstants(parsed) {
        const constants = new Map();
        // Extract string literals
        parsed.args.forEach((arg, index) => {
            if (arg.startsWith('"') && arg.endsWith('"')) {
                constants.set(`str_${index}`, arg.slice(1, -1));
            }
            else if (arg.startsWith("'") && arg.endsWith("'")) {
                constants.set(`str_${index}`, arg.slice(1, -1));
            }
            else if (/^\d+$/.test(arg)) {
                constants.set(`num_${index}`, parseInt(arg));
            }
        });
        return constants;
    }
    extractVariables(parsed) {
        const variables = new Map();
        parsed.variables.forEach(variable => {
            variables.set(variable.name, {
                name: variable.name,
                type: this.inferVariableType(variable.value),
                scope: variable.scope,
                defaultValue: variable.value
            });
        });
        return variables;
    }
    inferVariableType(value) {
        if (/^\d+$/.test(value))
            return 'number';
        if (value === 'true' || value === 'false')
            return 'boolean';
        if (value.includes('/') || value.includes('\\'))
            return 'path';
        if (value.includes('*') || value.includes('?'))
            return 'pattern';
        return 'string';
    }
    estimateExecutionTime(instructions) {
        return instructions.reduce((total, inst) => total + inst.metadata.estimatedCost, 0);
    }
    estimateMemoryUsage(instructions) {
        let memory = 0;
        instructions.forEach(inst => {
            switch (inst.opcode) {
                case 'LOAD_CONST':
                case 'STORE_VAR':
                    memory += 50; // bytes per variable
                    break;
                case 'EXEC_CMD':
                    memory += 1024; // 1KB for command execution
                    break;
                case 'PIPE':
                    memory += 512; // 512B for pipe buffer
                    break;
                default:
                    memory += 10; // minimal overhead
            }
        });
        return memory;
    }
    calculateComplexity(instructions) {
        let complexity = instructions.length;
        instructions.forEach(inst => {
            switch (inst.opcode) {
                case 'CONDITION':
                case 'LOOP':
                    complexity += 2;
                    break;
                case 'PARALLEL':
                    complexity += 1.5;
                    break;
                case 'PIPE':
                    complexity += 1;
                    break;
            }
        });
        return complexity;
    }
    getAppliedOptimizations(original, optimized) {
        const optimizations = [];
        if (original.length !== optimized.length) {
            optimizations.push('instruction_count_reduction');
        }
        // Check for specific optimization patterns
        const hasParallel = optimized.some(inst => inst.opcode === 'PARALLEL');
        if (hasParallel) {
            optimizations.push('parallel_execution');
        }
        return optimizations;
    }
    instructionsChanged(original, optimized) {
        if (original.length !== optimized.length)
            return true;
        return original.some((inst, i) => inst.opcode !== optimized[i].opcode ||
            inst.operands.length !== optimized[i].operands.length ||
            inst.operands.some((op, j) => op !== optimized[i].operands[j]));
    }
    updateTemplatePatterns(parsed, compiled) {
        // If this command pattern is used frequently, create a new template
        const commandString = `${parsed.command} ${parsed.args.join(' ')}`;
        const hash = createHash('md5').update(commandString).digest('hex').slice(0, 8);
        // Simple heuristic: if compilation took a while and the pattern is complex
        if (compiled.metadata.compilationTime > 50 && compiled.metadata.complexity > 3) {
            // This could become a template pattern
            // Implementation would analyze the command structure and create a reusable template
        }
    }
    generateCacheKey(parsed, level) {
        const content = JSON.stringify({
            command: parsed.command,
            args: parsed.args,
            type: parsed.type,
            level
        });
        return createHash('md5').update(content).digest('hex');
    }
    generateId() {
        return `bytecode_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }
    // Public utility methods
    clearCache() {
        this.compiledCache.clear();
    }
    getCacheStats() {
        return {
            size: this.compiledCache.size,
            templates: this.templatePatterns.size,
            hitRate: 0 // Would need to track hits/misses
        };
    }
    getTemplateUsage() {
        return Array.from(this.templatePatterns.values()).map(template => ({
            name: template.name,
            usage: template.usage,
            lastUsed: template.lastUsed
        }));
    }
}
export const bytecodeOptimizer = new BytecodeOptimizer();
