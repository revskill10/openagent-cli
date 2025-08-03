// platform-detector.ts - Cross-platform detection and shell configuration
import { platform, arch, release } from 'os';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface PlatformInfo {
  os: 'windows' | 'linux' | 'darwin' | 'unknown';
  arch: string;
  release: string;
  shell: ShellType;
  shellPath: string;
  shellVersion?: string;
  capabilities: PlatformCapabilities;
}

export interface PlatformCapabilities {
  supportsColors: boolean;
  supportsUnicode: boolean;
  maxCommandLength: number;
  pathSeparator: string;
  envVarPrefix: string;
  supportsSymlinks: boolean;
  caseSensitiveFS: boolean;
  defaultEncoding: string;
}

export type ShellType = 'powershell' | 'cmd' | 'bash' | 'zsh' | 'fish' | 'sh' | 'unknown';

export class PlatformDetector {
  private static instance: PlatformDetector;
  private platformInfo: PlatformInfo | null = null;

  private constructor() {}

  static getInstance(): PlatformDetector {
    if (!PlatformDetector.instance) {
      PlatformDetector.instance = new PlatformDetector();
    }
    return PlatformDetector.instance;
  }

  async detectPlatform(): Promise<PlatformInfo> {
    if (this.platformInfo) {
      return this.platformInfo;
    }

    const osType = this.normalizeOS(platform());
    const architecture = arch();
    const osRelease = release();

    const shell = await this.detectShell(osType);
    const shellPath = await this.getShellPath(shell, osType);
    const shellVersion = await this.getShellVersion(shell, shellPath);
    const capabilities = this.getPlatformCapabilities(osType, shell);

    this.platformInfo = {
      os: osType,
      arch: architecture,
      release: osRelease,
      shell,
      shellPath,
      shellVersion,
      capabilities
    };

    return this.platformInfo;
  }

  private normalizeOS(osType: string): PlatformInfo['os'] {
    switch (osType.toLowerCase()) {
      case 'win32':
        return 'windows';
      case 'linux':
        return 'linux';
      case 'darwin':
        return 'darwin';
      default:
        return 'unknown';
    }
  }

  private async detectShell(osType: PlatformInfo['os']): Promise<ShellType> {
    if (osType === 'windows') {
      // Check for PowerShell Core first, then Windows PowerShell, then cmd
      if (await this.commandExists('pwsh')) {
        return 'powershell';
      } else if (await this.commandExists('powershell')) {
        return 'powershell';
      } else {
        return 'cmd';
      }
    } else {
      // Unix-like systems
      const shellEnv = process.env.SHELL;
      if (shellEnv) {
        if (shellEnv.includes('bash')) return 'bash';
        if (shellEnv.includes('zsh')) return 'zsh';
        if (shellEnv.includes('fish')) return 'fish';
        if (shellEnv.includes('sh')) return 'sh';
      }

      // Fallback detection
      if (await this.commandExists('bash')) return 'bash';
      if (await this.commandExists('zsh')) return 'zsh';
      if (await this.commandExists('fish')) return 'fish';
      if (await this.commandExists('sh')) return 'sh';

      return 'unknown';
    }
  }

  private async getShellPath(shell: ShellType, osType: PlatformInfo['os']): Promise<string> {
    if (osType === 'windows') {
      switch (shell) {
        case 'powershell':
          if (await this.commandExists('pwsh')) {
            return 'pwsh';
          } else if (await this.commandExists('powershell')) {
            return 'powershell';
          }
          return 'powershell';
        case 'cmd':
          return 'cmd';
        default:
          return 'cmd';
      }
    } else {
      switch (shell) {
        case 'bash':
          return await this.which('bash') || '/bin/bash';
        case 'zsh':
          return await this.which('zsh') || '/bin/zsh';
        case 'fish':
          return await this.which('fish') || '/usr/bin/fish';
        case 'sh':
          return await this.which('sh') || '/bin/sh';
        default:
          return '/bin/sh';
      }
    }
  }

  private async getShellVersion(shell: ShellType, shellPath: string): Promise<string | undefined> {
    try {
      let versionCommand: string;
      
      switch (shell) {
        case 'powershell':
          versionCommand = `${shellPath} -Command "$PSVersionTable.PSVersion.ToString()"`;
          break;
        case 'bash':
          versionCommand = `${shellPath} --version`;
          break;
        case 'zsh':
          versionCommand = `${shellPath} --version`;
          break;
        case 'fish':
          versionCommand = `${shellPath} --version`;
          break;
        default:
          return undefined;
      }

      const { stdout } = await execAsync(versionCommand);
      return stdout.trim().split('\n')[0];
    } catch (error) {
      return undefined;
    }
  }

  private getPlatformCapabilities(osType: PlatformInfo['os'], shell: ShellType): PlatformCapabilities {
    const isWindows = osType === 'windows';
    
    return {
      supportsColors: shell !== 'cmd',
      supportsUnicode: true,
      maxCommandLength: isWindows ? 8191 : 131072,
      pathSeparator: isWindows ? '\\' : '/',
      envVarPrefix: isWindows ? '$env:' : '$',
      supportsSymlinks: !isWindows || shell === 'powershell',
      caseSensitiveFS: !isWindows,
      defaultEncoding: isWindows ? 'utf16le' : 'utf8'
    };
  }

  private async commandExists(command: string): Promise<boolean> {
    try {
      const testCommand = platform() === 'win32' 
        ? `where ${command}` 
        : `which ${command}`;
      
      await execAsync(testCommand);
      return true;
    } catch {
      return false;
    }
  }

  private async which(command: string): Promise<string | null> {
    try {
      const { stdout } = await execAsync(`which ${command}`);
      return stdout.trim();
    } catch {
      return null;
    }
  }

  // Utility methods for platform-specific operations
  isWindows(): boolean {
    return this.platformInfo?.os === 'windows' || platform() === 'win32';
  }

  isUnix(): boolean {
    const os = this.platformInfo?.os || this.normalizeOS(platform());
    return os === 'linux' || os === 'darwin';
  }

  getPathSeparator(): string {
    return this.platformInfo?.capabilities.pathSeparator || (this.isWindows() ? '\\' : '/');
  }

  getEnvVarPrefix(): string {
    return this.platformInfo?.capabilities.envVarPrefix || (this.isWindows() ? '$env:' : '$');
  }

  supportsColors(): boolean {
    return this.platformInfo?.capabilities.supportsColors ?? true;
  }

  getMaxCommandLength(): number {
    return this.platformInfo?.capabilities.maxCommandLength || (this.isWindows() ? 8191 : 131072);
  }

  // Reset for testing
  reset(): void {
    this.platformInfo = null;
  }
}

export const platformDetector = PlatformDetector.getInstance();
