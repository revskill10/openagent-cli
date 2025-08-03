export class SimpleLogger {
    prefix;
    constructor(prefix) {
        this.prefix = prefix;
    }
    debug(message, data) {
        console.log(`🔍 [${this.prefix}] ${message}`, data ? JSON.stringify(data, null, 2) : '');
    }
    info(message, data) {
        console.log(`ℹ️  [${this.prefix}] ${message}`, data ? JSON.stringify(data, null, 2) : '');
    }
    warn(message, data) {
        console.warn(`⚠️  [${this.prefix}] ${message}`, data ? JSON.stringify(data, null, 2) : '');
    }
    error(message, data) {
        console.error(`❌ [${this.prefix}] ${message}`, data ? JSON.stringify(data, null, 2) : '');
    }
}
export class BaseToolExecutor {
    name;
    logger;
    constructor(name) {
        this.name = name;
        this.logger = new SimpleLogger(name);
    }
    async executeToolWithTiming(toolCall) {
        const startTime = Date.now();
        this.logger.info(`Executing tool: ${toolCall.name}`, { arguments: toolCall.arguments });
        try {
            const result = await this.executeTool(toolCall);
            const executionTime = Date.now() - startTime;
            this.logger.info(`Tool execution completed`, {
                toolName: toolCall.name,
                success: result.success,
                executionTime: `${executionTime}ms`
            });
            return {
                ...result,
                executionTime
            };
        }
        catch (error) {
            const executionTime = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Tool execution failed`, {
                toolName: toolCall.name,
                error: errorMessage,
                executionTime: `${executionTime}ms`
            });
            return {
                success: false,
                error: errorMessage,
                executionTime,
                executorType: this.name
            };
        }
    }
}
