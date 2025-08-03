// shell-executor.ts - Safe shell command execution with validation and sandboxing
import { spawn, exec, ChildProcess } from 'child_process';
import { promisify } from 'util';
import { join, resolve, dirname } from 'path';
import { access, constants } from 'fs/promises';
import { platformDetector, PlatformInfo } from './platform-detector.js';
import { commandTranslator, CommandTranslation, CommandOptions } from './command-translator.js';
import { systemEventEmitter } from '../system-events.js';
import { DockerValidator } from './docker-validator.js';

const execAsync = promisify(exec);

export interface ExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTime: number;
  command: string;
  pid?: number;
  warnings: string[];
  metadata: ExecutionMetadata;
}

export interface ExecutionMetadata {
  platform: string;
  shell: string;
  workingDirectory: string;
  environment: Record<string, string>;
  translation: CommandTranslation;
  dryRun: boolean;
  sandboxed: boolean;
}

export interface ExecutionOptions extends CommandOptions {
  dryRun?: boolean;
  sandbox?: boolean | SandboxConfig;
  allowedPaths?: string[];
  blockedCommands?: string[];
  maxExecutionTime?: number;
  requireApproval?: boolean;
  captureOutput?: boolean;
  streamOutput?: boolean;
}

export interface SandboxConfig {
  allowedPaths: string[];
  blockedCommands: string[];
  allowNetworkAccess: boolean;
  allowFileWrite: boolean;
  allowProcessSpawn: boolean;
  maxMemoryMB: number;
  maxExecutionTimeMs: number;
}

export class ShellExecutor {
  private platformInfo: PlatformInfo | null = null;
  private runningProcesses = new Map<string, ChildProcess>();
  private defaultSandbox: SandboxConfig;

  constructor() {
    this.defaultSandbox = {
      allowedPaths: [process.cwd()],
      blockedCommands: ['rm', 'del', 'format', 'fdisk', 'mkfs', 'dd'],
      allowNetworkAccess: false,
      allowFileWrite: false,
      allowProcessSpawn: false,
      maxMemoryMB: 512,
      maxExecutionTimeMs: 30000
    };
  }

  // Create Docker-friendly sandbox configuration
  private getDockerSandbox(): SandboxConfig {
    return {
      allowedPaths: [process.cwd(), '/var/run/docker.sock', '/usr/bin/docker', '/usr/local/bin/docker'],
      blockedCommands: ['format', 'fdisk', 'mkfs', 'dd'], // Allow rm for Docker cleanup
      allowNetworkAccess: true, // Docker needs network access
      allowFileWrite: true, // Docker needs to write files
      allowProcessSpawn: true, // Docker spawns processes
      maxMemoryMB: 2048, // Docker needs more memory
      maxExecutionTimeMs: 300000 // Docker operations can take longer (5 minutes)
    };
  }

  async initialize(): Promise<void> {
    this.platformInfo = await platformDetector.detectPlatform();
    await commandTranslator.initialize();
  }

  async executeCommand(
    input: string, 
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult> {
    if (!this.platformInfo) {
      await this.initialize();
    }

    const startTime = Date.now();
    const executionId = `exec_${startTime}_${Math.random().toString(36).slice(2, 8)}`;

    try {
      // Translate command for current platform
      const translation = await commandTranslator.translateCommand(input);
      
      // Validate command safety
      const validationResult = await this.validateCommand(translation, options);
      if (!validationResult.safe) {
        throw new Error(`Command validation failed: ${validationResult.reason}`);
      }

      // Apply sandbox restrictions if enabled
      if (options.sandbox !== false) {
        // Use Docker-friendly sandbox for Docker commands
        const fullCommand = `${translation.command} ${translation.args.join(' ')}`;
        const isDockerCommand = this.isDockerCommand(fullCommand);
        const sandboxConfig = isDockerCommand ? this.getDockerSandbox() : this.defaultSandbox;
        const sandboxResult = this.applySandbox(translation, { ...options, sandbox: sandboxConfig });
        if (!sandboxResult.allowed) {
          throw new Error(`Sandbox restriction: ${sandboxResult.reason}`);
        }
      }

      // Handle dry run
      if (options.dryRun) {
        return this.createDryRunResult(translation, options, startTime);
      }

      // Execute the command
      systemEventEmitter.emitToolStart(executionId, 'shell-executor', 'shell-agent', { command: input });
      
      const result = await this.executeTranslatedCommand(translation, options, executionId);
      
      systemEventEmitter.emitToolComplete(executionId, {
        command: input,
        success: result.success,
        executionTime: result.executionTime
      });

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      systemEventEmitter.emitToolError(executionId, errorMessage);
      
      return {
        success: false,
        stdout: '',
        stderr: errorMessage,
        exitCode: -1,
        executionTime: Date.now() - startTime,
        command: input,
        warnings: [`Execution failed: ${errorMessage}`],
        metadata: {
          platform: this.platformInfo?.os || 'unknown',
          shell: this.platformInfo?.shell || 'unknown',
          workingDirectory: options.cwd || process.cwd(),
          environment: options.env || {},
          translation: await commandTranslator.translateCommand(input),
          dryRun: options.dryRun || false,
          sandboxed: options.sandbox !== false
        }
      };
    }
  }

  private async validateCommand(
    translation: CommandTranslation,
    options: ExecutionOptions
  ): Promise<{ safe: boolean; reason?: string }> {
    // Check confidence threshold
    if (translation.confidence < 0.3) {
      return { safe: false, reason: 'Command translation confidence too low' };
    }

    // Docker-specific validation
    const fullCommandForValidation = `${translation.command} ${translation.args.join(' ')}`;
    if (this.isDockerCommand(fullCommandForValidation)) {
      const dockerValidation = DockerValidator.validateDockerCommand(fullCommandForValidation);
      if (!dockerValidation.safe) {
        const criticalIssues = dockerValidation.issues.filter(i => i.severity === 'critical');
        if (criticalIssues.length > 0) {
          return {
            safe: false,
            reason: `Docker security issue: ${criticalIssues[0].message}`
          };
        }
      }
      // Log Docker validation warnings but don't block execution
      if (dockerValidation.issues.length > 0) {
        console.warn('Docker validation warnings:', dockerValidation.issues);
      }
    }

    // Check blocked commands
    const blockedCommands = options.blockedCommands || this.defaultSandbox.blockedCommands;
    if (blockedCommands.includes(translation.command)) {
      return { safe: false, reason: `Command '${translation.command}' is blocked` };
    }

    // Check for dangerous patterns
    const dangerousPatterns = [
      /rm\s+-rf\s+\//, // rm -rf /
      /del\s+\/s\s+\/q\s+\*/, // del /s /q *
      /format\s+c:/, // format c:
      />\s*\/dev\/sd[a-z]/, // > /dev/sda
      /dd\s+if=.*of=\/dev/, // dd if=... of=/dev/...
    ];

    const fullCommand = `${translation.command} ${translation.args.join(' ')}`;
    for (const pattern of dangerousPatterns) {
      if (pattern.test(fullCommand)) {
        return { safe: false, reason: 'Command matches dangerous pattern' };
      }
    }

    // Check path restrictions
    if (options.allowedPaths) {
      const hasValidPath = translation.args.some(arg => {
        if (this.isPath(arg)) {
          return options.allowedPaths!.some(allowedPath => 
            resolve(arg).startsWith(resolve(allowedPath))
          );
        }
        return true; // Non-path arguments are allowed
      });

      if (!hasValidPath && translation.args.some(arg => this.isPath(arg))) {
        return { safe: false, reason: 'Command accesses restricted paths' };
      }
    }

    return { safe: true };
  }

  private applySandbox(
    translation: CommandTranslation,
    options: ExecutionOptions
  ): { allowed: boolean; reason?: string } {
    // Determine sandbox configuration
    let sandbox: SandboxConfig;
    if (typeof options.sandbox === 'object' && options.sandbox !== null) {
      sandbox = options.sandbox;
    } else {
      sandbox = { ...this.defaultSandbox, ...options };
    }

    // Check command against blocked list
    if (sandbox.blockedCommands.includes(translation.command)) {
      return { allowed: false, reason: `Command '${translation.command}' is blocked in sandbox` };
    }

    // Check file write operations
    if (!sandbox.allowFileWrite) {
      const writeCommands = ['cp', 'mv', 'rm', 'mkdir', 'touch', 'echo', 'cat'];
      const hasRedirection = translation.args.some(arg => arg.includes('>') || arg.includes('>>'));
      
      if (writeCommands.includes(translation.command) || hasRedirection) {
        return { allowed: false, reason: 'File write operations not allowed in sandbox' };
      }
    }

    // Check network access
    if (!sandbox.allowNetworkAccess) {
      const networkCommands = ['curl', 'wget', 'ping', 'ssh', 'scp', 'rsync'];
      if (networkCommands.includes(translation.command)) {
        return { allowed: false, reason: 'Network access not allowed in sandbox' };
      }
    }

    return { allowed: true };
  }

  private async executeTranslatedCommand(
    translation: CommandTranslation,
    options: ExecutionOptions,
    executionId: string
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const timeout = options.maxExecutionTime || translation.options.timeout || 30000;

    const execOptions = {
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...options.env },
      timeout,
      maxBuffer: options.maxBuffer || translation.options.maxBuffer || 1024 * 1024,
      encoding: options.encoding || translation.options.encoding || 'utf8'
    };

    try {
      const fullCommand = `${translation.command} ${translation.args.join(' ')}`;
      
      if (options.streamOutput) {
        return await this.executeWithStreaming(fullCommand, execOptions, executionId);
      } else {
        return await this.executeWithBuffer(fullCommand, execOptions, translation);
      }
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        success: false,
        stdout: '',
        stderr: errorMessage,
        exitCode: error instanceof Error && 'code' in error ? (error as any).code : -1,
        executionTime,
        command: `${translation.command} ${translation.args.join(' ')}`,
        warnings: translation.warnings,
        metadata: this.createMetadata(translation, options, execOptions)
      };
    }
  }

  private async executeWithBuffer(
    command: string,
    execOptions: any,
    translation: CommandTranslation
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      const { stdout, stderr } = await execAsync(command, execOptions);
      const executionTime = Date.now() - startTime;

      return {
        success: true,
        stdout: stdout.toString(),
        stderr: stderr.toString(),
        exitCode: 0,
        executionTime,
        command,
        warnings: translation.warnings,
        metadata: this.createMetadata(translation, {}, execOptions)
      };
    } catch (error: any) {
      const executionTime = Date.now() - startTime;

      return {
        success: false,
        stdout: error.stdout?.toString() || '',
        stderr: error.stderr?.toString() || error.message,
        exitCode: error.code || -1,
        executionTime,
        command,
        warnings: translation.warnings,
        metadata: this.createMetadata(translation, {}, execOptions)
      };
    }
  }

  private async executeWithStreaming(
    command: string,
    execOptions: any,
    executionId: string
  ): Promise<ExecutionResult> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      let stdout = '';
      let stderr = '';

      const [cmd, ...args] = command.split(' ');
      const childProcess = spawn(cmd, args, execOptions);
      
      this.runningProcesses.set(executionId, childProcess);

      childProcess.stdout?.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;
        systemEventEmitter.emitSystemInfo('Shell output', { 
          executionId, 
          type: 'stdout', 
          data: chunk 
        });
      });

      childProcess.stderr?.on('data', (data) => {
        const chunk = data.toString();
        stderr += chunk;
        systemEventEmitter.emitSystemInfo('Shell output', { 
          executionId, 
          type: 'stderr', 
          data: chunk 
        });
      });

      childProcess.on('close', (code) => {
        const executionTime = Date.now() - startTime;
        this.runningProcesses.delete(executionId);

        resolve({
          success: code === 0,
          stdout,
          stderr,
          exitCode: code || 0,
          executionTime,
          command,
          pid: childProcess.pid,
          warnings: [],
          metadata: this.createMetadata(
            { command: cmd, args, options: {}, confidence: 1, warnings: [] },
            {},
            execOptions
          )
        });
      });

      childProcess.on('error', (error) => {
        const executionTime = Date.now() - startTime;
        this.runningProcesses.delete(executionId);

        resolve({
          success: false,
          stdout,
          stderr: error.message,
          exitCode: -1,
          executionTime,
          command,
          warnings: [`Process error: ${error.message}`],
          metadata: this.createMetadata(
            { command: cmd, args, options: {}, confidence: 1, warnings: [] },
            {},
            execOptions
          )
        });
      });
    });
  }

  private createDryRunResult(
    translation: CommandTranslation,
    options: ExecutionOptions,
    startTime: number
  ): ExecutionResult {
    const fullCommand = `${translation.command} ${translation.args.join(' ')}`;
    
    return {
      success: true,
      stdout: `[DRY RUN] Would execute: ${fullCommand}`,
      stderr: '',
      exitCode: 0,
      executionTime: Date.now() - startTime,
      command: fullCommand,
      warnings: [...translation.warnings, 'This was a dry run - no actual execution'],
      metadata: this.createMetadata(translation, options, { cwd: process.cwd() })
    };
  }

  private createMetadata(
    translation: CommandTranslation,
    options: ExecutionOptions,
    execOptions: any
  ): ExecutionMetadata {
    return {
      platform: this.platformInfo?.os || 'unknown',
      shell: this.platformInfo?.shell || 'unknown',
      workingDirectory: execOptions.cwd || process.cwd(),
      environment: execOptions.env || {},
      translation,
      dryRun: options.dryRun || false,
      sandboxed: options.sandbox !== false
    };
  }

  private isPath(arg: string): boolean {
    // Simple heuristic to detect if argument is a file path
    return arg.includes('/') || arg.includes('\\') || arg.includes('.') || arg.startsWith('~');
  }

  // Process management
  async killProcess(executionId: string): Promise<boolean> {
    const process = this.runningProcesses.get(executionId);
    if (process && !process.killed) {
      process.kill('SIGTERM');
      this.runningProcesses.delete(executionId);
      return true;
    }
    return false;
  }

  getRunningProcesses(): string[] {
    return Array.from(this.runningProcesses.keys());
  }

  // Utility methods
  async testCommand(command: string): Promise<boolean> {
    try {
      const result = await this.executeCommand(command, { dryRun: true });
      return result.success;
    } catch {
      return false;
    }
  }

  getSupportedCommands(): string[] {
    return commandTranslator.getAvailableCommands().map(cmd => cmd.name);
  }

  // Check if command is a Docker command
  private isDockerCommand(command: string): boolean {
    const trimmedCommand = command.trim().toLowerCase();
    return trimmedCommand.startsWith('docker') ||
           trimmedCommand.startsWith('docker-compose') ||
           trimmedCommand.includes('docker run') ||
           trimmedCommand.includes('docker build') ||
           trimmedCommand.includes('docker exec') ||
           trimmedCommand.includes('docker ps') ||
           trimmedCommand.includes('docker images');
  }
}

export const shellExecutor = new ShellExecutor();
