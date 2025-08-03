// command-parser.ts - Modular parser system for multiple input formats
import { createHash } from 'crypto';
export class CommandParser {
    parseCache = new Map();
    patterns = new Map();
    nlpPatterns = new Map();
    constructor() {
        this.initializePatterns();
        this.initializeNLPPatterns();
    }
    async parseInput(input, format) {
        const startTime = Date.now();
        const inputHash = this.hashInput(input);
        // Check cache first
        const cached = this.parseCache.get(inputHash);
        if (cached) {
            return cached;
        }
        // Detect input format if not provided
        const detectedFormat = format || this.detectInputFormat(input);
        let parsed;
        switch (detectedFormat) {
            case 'natural_language':
                parsed = await this.parseNaturalLanguage(input);
                break;
            case 'shell_command':
                parsed = this.parseShellCommand(input);
                break;
            case 'structured_query':
                parsed = this.parseStructuredQuery(input);
                break;
            case 'code_snippet':
                parsed = this.parseCodeSnippet(input);
                break;
            default:
                parsed = this.parseGeneric(input);
        }
        // Add metadata
        parsed.metadata = {
            originalInput: input,
            inputFormat: detectedFormat,
            parseTime: Date.now() - startTime,
            complexity: this.calculateComplexity(parsed),
            safety: this.assessSafety(parsed),
            estimatedExecutionTime: this.estimateExecutionTime(parsed)
        };
        // Cache the result
        this.parseCache.set(inputHash, parsed);
        return parsed;
    }
    detectInputFormat(input) {
        const trimmed = input.trim();
        // Check for natural language patterns
        if (this.isNaturalLanguage(trimmed)) {
            return 'natural_language';
        }
        // Check for structured query patterns (JSON, YAML, etc.)
        if (this.isStructuredQuery(trimmed)) {
            return 'structured_query';
        }
        // Check for code snippet patterns
        if (this.isCodeSnippet(trimmed)) {
            return 'code_snippet';
        }
        // Default to shell command
        return 'shell_command';
    }
    isNaturalLanguage(input) {
        const nlIndicators = [
            /^(please|can you|could you|would you|i want to|i need to|help me)/i,
            /\b(list|show|display|find|search|create|delete|copy|move)\b.*\b(files?|directories?|folders?)\b/i,
            /\b(what|how|where|when|why)\b/i,
            /\?(.*)?$/,
            /\b(the|a|an)\b.*\b(file|directory|folder|process)\b/i
        ];
        return nlIndicators.some(pattern => pattern.test(input));
    }
    isStructuredQuery(input) {
        try {
            JSON.parse(input);
            return true;
        }
        catch {
            // Check for YAML-like structure
            return /^[\w\s]*:\s*[\w\s]*$/m.test(input) ||
                /^-\s+[\w\s]+$/m.test(input);
        }
    }
    isCodeSnippet(input) {
        const codeIndicators = [
            /^(function|def|class|if|for|while|const|let|var)\s/,
            /\{[\s\S]*\}/,
            /^\s*(import|from|require)\s/,
            /\/\*[\s\S]*\*\/|\/\/.*$/m,
            /^\s*#.*$/m
        ];
        return codeIndicators.some(pattern => pattern.test(input));
    }
    async parseNaturalLanguage(input) {
        const id = this.generateId();
        // Try to match against known NLP patterns
        for (const [intent, pattern] of this.nlpPatterns.entries()) {
            const match = pattern.regex.test(input);
            if (match) {
                const command = this.generateCommandFromIntent(intent, input, pattern);
                return {
                    id,
                    type: 'simple',
                    command: command.command,
                    args: command.args,
                    pipes: [],
                    redirections: [],
                    variables: [],
                    conditions: [],
                    metadata: {},
                    confidence: pattern.confidence
                };
            }
        }
        // Fallback: extract key terms and generate best-guess command
        return this.generateFallbackCommand(input, id);
    }
    parseShellCommand(input) {
        const id = this.generateId();
        // Parse pipes
        const pipes = this.extractPipes(input);
        // Parse redirections
        const redirections = this.extractRedirections(input);
        // Parse variable assignments
        const variables = this.extractVariables(input);
        // Parse conditional operations
        const conditions = this.extractConditions(input);
        // Extract base command and args
        const cleanInput = this.cleanInput(input, pipes, redirections, variables);
        const parts = this.tokenizeCommand(cleanInput);
        const type = this.determineCommandType(pipes, conditions, input);
        return {
            id,
            type,
            command: parts[0] || '',
            args: parts.slice(1),
            pipes,
            redirections,
            variables,
            conditions,
            metadata: {},
            confidence: 0.9
        };
    }
    parseStructuredQuery(input) {
        const id = this.generateId();
        try {
            const parsed = JSON.parse(input);
            return {
                id,
                type: 'simple',
                command: parsed.command || '',
                args: parsed.args || [],
                pipes: parsed.pipes || [],
                redirections: parsed.redirections || [],
                variables: parsed.variables || [],
                conditions: parsed.conditions || [],
                metadata: {},
                confidence: 0.95
            };
        }
        catch {
            // Try YAML-like parsing
            return this.parseYamlLike(input, id);
        }
    }
    parseCodeSnippet(input) {
        const id = this.generateId();
        // Extract shell commands from code comments or strings
        const shellCommands = this.extractShellFromCode(input);
        if (shellCommands.length > 0) {
            return this.parseShellCommand(shellCommands[0]);
        }
        // Generate command based on code analysis
        return this.generateCommandFromCode(input, id);
    }
    parseGeneric(input) {
        const id = this.generateId();
        const parts = input.trim().split(/\s+/);
        return {
            id,
            type: 'simple',
            command: parts[0] || '',
            args: parts.slice(1),
            pipes: [],
            redirections: [],
            variables: [],
            conditions: [],
            metadata: {},
            confidence: 0.5
        };
    }
    extractPipes(input) {
        const pipes = [];
        const pipePattern = /([^|&;]+)(\|\||&&|\|)([^|&;]+)/g;
        let match;
        while ((match = pipePattern.exec(input)) !== null) {
            pipes.push({
                sourceCommand: match[1].trim(),
                targetCommand: match[3].trim(),
                pipeType: match[2]
            });
        }
        return pipes;
    }
    extractRedirections(input) {
        const redirections = [];
        const redirectPattern = /(2?>>?|<|&>)\s*([^\s]+)/g;
        let match;
        while ((match = redirectPattern.exec(input)) !== null) {
            redirections.push({
                type: match[1],
                target: match[2]
            });
        }
        return redirections;
    }
    extractVariables(input) {
        const variables = [];
        const varPattern = /(\w+)=([^\s]+)/g;
        let match;
        while ((match = varPattern.exec(input)) !== null) {
            variables.push({
                name: match[1],
                value: match[2],
                scope: 'local'
            });
        }
        return variables;
    }
    extractConditions(input) {
        const conditions = [];
        const condPattern = /(.+?)(&&|\|\||;)(.+)/;
        const match = input.match(condPattern);
        if (match) {
            conditions.push({
                condition: match[1].trim(),
                trueCommand: match[3].trim(),
                operator: match[2]
            });
        }
        return conditions;
    }
    cleanInput(input, pipes, redirections, variables) {
        let cleaned = input;
        // Remove pipes
        pipes.forEach(pipe => {
            cleaned = cleaned.replace(new RegExp(`\\${pipe.pipeType}`, 'g'), ' ');
        });
        // Remove redirections
        redirections.forEach(redir => {
            cleaned = cleaned.replace(new RegExp(`\\${redir.type}\\s*${redir.target}`, 'g'), ' ');
        });
        // Remove variable assignments
        variables.forEach(variable => {
            cleaned = cleaned.replace(new RegExp(`${variable.name}=${variable.value}`, 'g'), ' ');
        });
        return cleaned.trim();
    }
    tokenizeCommand(input) {
        const tokens = [];
        let current = '';
        let inQuotes = false;
        let quoteChar = '';
        for (let i = 0; i < input.length; i++) {
            const char = input[i];
            if ((char === '"' || char === "'") && !inQuotes) {
                inQuotes = true;
                quoteChar = char;
            }
            else if (char === quoteChar && inQuotes) {
                inQuotes = false;
                quoteChar = '';
            }
            else if (char === ' ' && !inQuotes) {
                if (current) {
                    tokens.push(current);
                    current = '';
                }
            }
            else {
                current += char;
            }
        }
        if (current) {
            tokens.push(current);
        }
        return tokens;
    }
    determineCommandType(pipes, conditions, input) {
        if (pipes.length > 0)
            return 'pipeline';
        if (conditions.length > 0)
            return 'conditional';
        if (input.includes('for ') || input.includes('while '))
            return 'loop';
        if (input.includes('function ') || input.includes('def '))
            return 'function';
        if (input.includes('&&') || input.includes('||') || input.includes(';'))
            return 'compound';
        return 'simple';
    }
    calculateComplexity(parsed) {
        let complexity = 1;
        complexity += parsed.args.length * 0.1;
        complexity += parsed.pipes.length * 0.5;
        complexity += parsed.redirections.length * 0.3;
        complexity += parsed.variables.length * 0.2;
        complexity += parsed.conditions.length * 0.7;
        if (parsed.type === 'pipeline')
            complexity += 1;
        if (parsed.type === 'conditional')
            complexity += 0.8;
        if (parsed.type === 'loop')
            complexity += 1.5;
        return Math.min(complexity, 10);
    }
    assessSafety(parsed) {
        const dangerousCommands = ['rm', 'del', 'format', 'fdisk', 'dd', 'mkfs'];
        const cautionCommands = ['cp', 'mv', 'chmod', 'chown', 'sudo'];
        if (dangerousCommands.includes(parsed.command)) {
            return 'dangerous';
        }
        if (cautionCommands.includes(parsed.command)) {
            return 'caution';
        }
        // Check for dangerous patterns in args
        const hasForceFlag = parsed.args.some(arg => arg === '-f' || arg === '--force');
        const hasRecursiveFlag = parsed.args.some(arg => arg === '-r' || arg === '--recursive');
        if (hasForceFlag && hasRecursiveFlag) {
            return 'dangerous';
        }
        if (hasForceFlag || hasRecursiveFlag) {
            return 'caution';
        }
        return 'safe';
    }
    estimateExecutionTime(parsed) {
        let baseTime = 100; // Base 100ms
        // Add time based on complexity
        baseTime += parsed.metadata?.complexity * 200;
        // Add time for pipes
        baseTime += parsed.pipes.length * 500;
        // Add time for file operations
        const fileOps = ['cp', 'mv', 'find', 'grep', 'sort'];
        if (fileOps.includes(parsed.command)) {
            baseTime += 1000;
        }
        // Add time for network operations
        const networkOps = ['curl', 'wget', 'ping', 'ssh'];
        if (networkOps.includes(parsed.command)) {
            baseTime += 5000;
        }
        return baseTime;
    }
    initializePatterns() {
        this.patterns.set('pipe', /\|/g);
        this.patterns.set('redirect', /(>>?|<|2>>?|&>)/g);
        this.patterns.set('variable', /\w+=\S+/g);
        this.patterns.set('condition', /(&&|\|\||;)/g);
    }
    initializeNLPPatterns() {
        this.nlpPatterns.set('list_files', {
            regex: /\b(list|show|display)\b.*\b(files?|directories?|folders?)\b/i,
            confidence: 0.8,
            template: 'ls {args}'
        });
        this.nlpPatterns.set('find_files', {
            regex: /\b(find|search|locate)\b.*\b(files?|directories?)\b.*\b(named?|called?)\b/i,
            confidence: 0.85,
            template: 'find {path} -name {pattern}'
        });
        this.nlpPatterns.set('copy_files', {
            regex: /\b(copy|duplicate)\b.*\b(file|directory)\b/i,
            confidence: 0.8,
            template: 'cp {source} {dest}'
        });
        this.nlpPatterns.set('delete_files', {
            regex: /\b(delete|remove|rm)\b.*\b(file|directory)\b/i,
            confidence: 0.9,
            template: 'rm {target}'
        });
    }
    generateCommandFromIntent(intent, input, pattern) {
        // This is a simplified implementation
        // In a real system, this would use more sophisticated NLP
        const template = pattern.template;
        const words = input.toLowerCase().split(/\s+/);
        switch (intent) {
            case 'list_files':
                return { command: 'ls', args: ['-la'] };
            case 'find_files':
                const nameIndex = words.findIndex(w => w === 'named' || w === 'called');
                const pattern_name = nameIndex >= 0 ? words[nameIndex + 1] : '*';
                return { command: 'find', args: ['.', '-name', pattern_name] };
            default:
                return { command: 'echo', args: ['Command not recognized'] };
        }
    }
    generateFallbackCommand(input, id) {
        return {
            id,
            type: 'simple',
            command: 'echo',
            args: [`"Could not parse: ${input}"`],
            pipes: [],
            redirections: [],
            variables: [],
            conditions: [],
            metadata: {},
            confidence: 0.1
        };
    }
    parseYamlLike(input, id) {
        // Simple YAML-like parsing
        const lines = input.split('\n');
        const result = {};
        lines.forEach(line => {
            const match = line.match(/^(\w+):\s*(.+)$/);
            if (match) {
                result[match[1]] = match[2];
            }
        });
        return {
            id,
            type: 'simple',
            command: result.command || '',
            args: result.args ? result.args.split(' ') : [],
            pipes: [],
            redirections: [],
            variables: [],
            conditions: [],
            metadata: {},
            confidence: 0.7
        };
    }
    extractShellFromCode(input) {
        const commands = [];
        // Extract from comments
        const commentMatches = input.match(/(?:\/\/|#)\s*(.+)/g);
        if (commentMatches) {
            commands.push(...commentMatches.map(m => m.replace(/(?:\/\/|#)\s*/, '')));
        }
        // Extract from strings that look like shell commands
        const stringMatches = input.match(/["'`]([^"'`]*(?:ls|grep|find|cp|mv|rm)[^"'`]*)["'`]/g);
        if (stringMatches) {
            commands.push(...stringMatches.map(m => m.slice(1, -1)));
        }
        return commands;
    }
    generateCommandFromCode(input, id) {
        // Analyze code and suggest relevant commands
        if (input.includes('import') || input.includes('require')) {
            return {
                id,
                type: 'simple',
                command: 'npm',
                args: ['install'],
                pipes: [],
                redirections: [],
                variables: [],
                conditions: [],
                metadata: {},
                confidence: 0.6
            };
        }
        return this.generateFallbackCommand(input, id);
    }
    hashInput(input) {
        return createHash('md5').update(input).digest('hex');
    }
    generateId() {
        return `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }
    // Public utility methods
    clearCache() {
        this.parseCache.clear();
    }
    getCacheStats() {
        return {
            size: this.parseCache.size,
            hitRate: 0 // Would need to track hits/misses for real implementation
        };
    }
}
export const commandParser = new CommandParser();
