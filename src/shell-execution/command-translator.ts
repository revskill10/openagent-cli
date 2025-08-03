// command-translator.ts - Cross-platform command translation system
import { PlatformInfo, platformDetector } from './platform-detector.js';

export interface CommandTranslation {
  command: string;
  args: string[];
  options: CommandOptions;
  confidence: number;
  warnings: string[];
  requiresElevation?: boolean;
}

export interface CommandOptions {
  shell?: string;
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
  encoding?: string;
  maxBuffer?: number;
}

export interface CommandPattern {
  name: string;
  unixCommand: string;
  windowsCommand: string;
  description: string;
  category: CommandCategory;
  parameters: ParameterMapping[];
  examples: CommandExample[];
  dangerLevel: 'safe' | 'caution' | 'dangerous';
}

export interface ParameterMapping {
  unixParam: string;
  windowsParam: string;
  description: string;
  required?: boolean;
  valueType?: 'string' | 'number' | 'boolean' | 'path';
}

export interface CommandExample {
  description: string;
  unixExample: string;
  windowsExample: string;
}

export type CommandCategory = 
  | 'file_operations' 
  | 'text_processing' 
  | 'system_info' 
  | 'network' 
  | 'process_management' 
  | 'archive' 
  | 'git' 
  | 'development';

export class CommandTranslator {
  private commandPatterns: Map<string, CommandPattern> = new Map();
  private platformInfo: PlatformInfo | null = null;

  constructor() {
    this.initializeCommandPatterns();
  }

  async initialize(): Promise<void> {
    this.platformInfo = await platformDetector.detectPlatform();
  }

  private initializeCommandPatterns(): void {
    const patterns: CommandPattern[] = [
      // File Operations
      {
        name: 'ls',
        unixCommand: 'ls',
        windowsCommand: 'Get-ChildItem',
        description: 'List directory contents',
        category: 'file_operations',
        dangerLevel: 'safe',
        parameters: [
          { unixParam: '-l', windowsParam: '-Format List', description: 'Long format listing' },
          { unixParam: '-a', windowsParam: '-Force', description: 'Show hidden files' },
          { unixParam: '-h', windowsParam: '', description: 'Human readable sizes' },
          { unixParam: '-R', windowsParam: '-Recurse', description: 'Recursive listing' }
        ],
        examples: [
          {
            description: 'List files in current directory',
            unixExample: 'ls',
            windowsExample: 'Get-ChildItem'
          },
          {
            description: 'List all files including hidden',
            unixExample: 'ls -la',
            windowsExample: 'Get-ChildItem -Force -Format List'
          }
        ]
      },
      {
        name: 'cat',
        unixCommand: 'cat',
        windowsCommand: 'Get-Content',
        description: 'Display file contents',
        category: 'file_operations',
        dangerLevel: 'safe',
        parameters: [
          { unixParam: '-n', windowsParam: '', description: 'Number lines' },
          { unixParam: '-b', windowsParam: '', description: 'Number non-blank lines' }
        ],
        examples: [
          {
            description: 'Display file contents',
            unixExample: 'cat file.txt',
            windowsExample: 'Get-Content file.txt'
          }
        ]
      },
      {
        name: 'cp',
        unixCommand: 'cp',
        windowsCommand: 'Copy-Item',
        description: 'Copy files or directories',
        category: 'file_operations',
        dangerLevel: 'caution',
        parameters: [
          { unixParam: '-r', windowsParam: '-Recurse', description: 'Copy recursively' },
          { unixParam: '-f', windowsParam: '-Force', description: 'Force overwrite' },
          { unixParam: '-v', windowsParam: '-Verbose', description: 'Verbose output' }
        ],
        examples: [
          {
            description: 'Copy file',
            unixExample: 'cp source.txt dest.txt',
            windowsExample: 'Copy-Item source.txt dest.txt'
          }
        ]
      },
      {
        name: 'mv',
        unixCommand: 'mv',
        windowsCommand: 'Move-Item',
        description: 'Move/rename files or directories',
        category: 'file_operations',
        dangerLevel: 'caution',
        parameters: [
          { unixParam: '-f', windowsParam: '-Force', description: 'Force overwrite' },
          { unixParam: '-v', windowsParam: '-Verbose', description: 'Verbose output' }
        ],
        examples: [
          {
            description: 'Move file',
            unixExample: 'mv old.txt new.txt',
            windowsExample: 'Move-Item old.txt new.txt'
          }
        ]
      },
      {
        name: 'rm',
        unixCommand: 'rm',
        windowsCommand: 'Remove-Item',
        description: 'Remove files or directories',
        category: 'file_operations',
        dangerLevel: 'dangerous',
        parameters: [
          { unixParam: '-r', windowsParam: '-Recurse', description: 'Remove recursively' },
          { unixParam: '-f', windowsParam: '-Force', description: 'Force removal' },
          { unixParam: '-v', windowsParam: '-Verbose', description: 'Verbose output' }
        ],
        examples: [
          {
            description: 'Remove file',
            unixExample: 'rm file.txt',
            windowsExample: 'Remove-Item file.txt'
          }
        ]
      },
      {
        name: 'mkdir',
        unixCommand: 'mkdir',
        windowsCommand: 'New-Item -ItemType Directory',
        description: 'Create directories',
        category: 'file_operations',
        dangerLevel: 'safe',
        parameters: [
          { unixParam: '-p', windowsParam: '-Force', description: 'Create parent directories' }
        ],
        examples: [
          {
            description: 'Create directory',
            unixExample: 'mkdir newdir',
            windowsExample: 'New-Item -ItemType Directory newdir'
          }
        ]
      },
      {
        name: 'find',
        unixCommand: 'find',
        windowsCommand: 'Get-ChildItem',
        description: 'Search for files and directories',
        category: 'file_operations',
        dangerLevel: 'safe',
        parameters: [
          { unixParam: '-name', windowsParam: '-Name', description: 'Search by name pattern' },
          { unixParam: '-type f', windowsParam: '-File', description: 'Files only' },
          { unixParam: '-type d', windowsParam: '-Directory', description: 'Directories only' }
        ],
        examples: [
          {
            description: 'Find files by name',
            unixExample: 'find . -name "*.txt"',
            windowsExample: 'Get-ChildItem -Recurse -Name "*.txt"'
          }
        ]
      },

      // Text Processing
      {
        name: 'grep',
        unixCommand: 'grep',
        windowsCommand: 'Select-String',
        description: 'Search text patterns in files',
        category: 'text_processing',
        dangerLevel: 'safe',
        parameters: [
          { unixParam: '-i', windowsParam: '-CaseSensitive:$false', description: 'Case insensitive' },
          { unixParam: '-r', windowsParam: '-Recurse', description: 'Recursive search' },
          { unixParam: '-n', windowsParam: '-LineNumber', description: 'Show line numbers' },
          { unixParam: '-v', windowsParam: '-NotMatch', description: 'Invert match' }
        ],
        examples: [
          {
            description: 'Search for pattern in file',
            unixExample: 'grep "pattern" file.txt',
            windowsExample: 'Select-String "pattern" file.txt'
          }
        ]
      },
      {
        name: 'sed',
        unixCommand: 'sed',
        windowsCommand: 'ForEach-Object',
        description: 'Stream editor for filtering and transforming text',
        category: 'text_processing',
        dangerLevel: 'caution',
        parameters: [],
        examples: [
          {
            description: 'Replace text in file',
            unixExample: 'sed "s/old/new/g" file.txt',
            windowsExample: '(Get-Content file.txt) | ForEach-Object { $_ -replace "old", "new" }'
          }
        ]
      },
      {
        name: 'sort',
        unixCommand: 'sort',
        windowsCommand: 'Sort-Object',
        description: 'Sort lines of text',
        category: 'text_processing',
        dangerLevel: 'safe',
        parameters: [
          { unixParam: '-r', windowsParam: '-Descending', description: 'Reverse sort' },
          { unixParam: '-n', windowsParam: '-Property {[int]$_}', description: 'Numeric sort' },
          { unixParam: '-u', windowsParam: '-Unique', description: 'Unique values only' }
        ],
        examples: [
          {
            description: 'Sort file contents',
            unixExample: 'sort file.txt',
            windowsExample: 'Get-Content file.txt | Sort-Object'
          }
        ]
      },
      {
        name: 'uniq',
        unixCommand: 'uniq',
        windowsCommand: 'Sort-Object -Unique',
        description: 'Report or omit repeated lines',
        category: 'text_processing',
        dangerLevel: 'safe',
        parameters: [
          { unixParam: '-c', windowsParam: 'Group-Object | Select-Object Count,Name', description: 'Count occurrences' }
        ],
        examples: [
          {
            description: 'Remove duplicate lines',
            unixExample: 'uniq file.txt',
            windowsExample: 'Get-Content file.txt | Sort-Object -Unique'
          }
        ]
      },
      {
        name: 'wc',
        unixCommand: 'wc',
        windowsCommand: 'Measure-Object',
        description: 'Count lines, words, and characters',
        category: 'text_processing',
        dangerLevel: 'safe',
        parameters: [
          { unixParam: '-l', windowsParam: '-Line', description: 'Count lines' },
          { unixParam: '-w', windowsParam: '-Word', description: 'Count words' },
          { unixParam: '-c', windowsParam: '-Character', description: 'Count characters' }
        ],
        examples: [
          {
            description: 'Count lines in file',
            unixExample: 'wc -l file.txt',
            windowsExample: 'Get-Content file.txt | Measure-Object -Line'
          }
        ]
      },

      // System Information
      {
        name: 'ps',
        unixCommand: 'ps',
        windowsCommand: 'Get-Process',
        description: 'Display running processes',
        category: 'system_info',
        dangerLevel: 'safe',
        parameters: [
          { unixParam: 'aux', windowsParam: '', description: 'All processes with details' }
        ],
        examples: [
          {
            description: 'List all processes',
            unixExample: 'ps aux',
            windowsExample: 'Get-Process'
          }
        ]
      },
      {
        name: 'df',
        unixCommand: 'df',
        windowsCommand: 'Get-WmiObject -Class Win32_LogicalDisk',
        description: 'Display filesystem disk space usage',
        category: 'system_info',
        dangerLevel: 'safe',
        parameters: [
          { unixParam: '-h', windowsParam: '', description: 'Human readable format' }
        ],
        examples: [
          {
            description: 'Show disk usage',
            unixExample: 'df -h',
            windowsExample: 'Get-WmiObject -Class Win32_LogicalDisk | Select-Object DeviceID,Size,FreeSpace'
          }
        ]
      },

      // Network
      {
        name: 'curl',
        unixCommand: 'curl',
        windowsCommand: 'Invoke-WebRequest',
        description: 'Transfer data from or to a server',
        category: 'network',
        dangerLevel: 'caution',
        parameters: [
          { unixParam: '-o', windowsParam: '-OutFile', description: 'Output to file' },
          { unixParam: '-L', windowsParam: '-MaximumRedirection 5', description: 'Follow redirects' },
          { unixParam: '-s', windowsParam: '-UseBasicParsing', description: 'Silent mode' }
        ],
        examples: [
          {
            description: 'Download file',
            unixExample: 'curl -o file.zip https://example.com/file.zip',
            windowsExample: 'Invoke-WebRequest -Uri https://example.com/file.zip -OutFile file.zip'
          }
        ]
      },

      // Git Commands
      {
        name: 'git-status',
        unixCommand: 'git status',
        windowsCommand: 'git status',
        description: 'Show the working tree status',
        category: 'git',
        dangerLevel: 'safe',
        parameters: [],
        examples: [
          {
            description: 'Check git status',
            unixExample: 'git status',
            windowsExample: 'git status'
          }
        ]
      }
    ];

    patterns.forEach(pattern => {
      this.commandPatterns.set(pattern.name, pattern);
    });
  }

  async translateCommand(input: string): Promise<CommandTranslation> {
    if (!this.platformInfo) {
      await this.initialize();
    }

    const parsed = this.parseCommand(input);
    const pattern = this.findCommandPattern(parsed.command);
    
    if (!pattern) {
      return this.createPassthroughTranslation(input);
    }

    const isWindows = this.platformInfo!.os === 'windows';
    const targetCommand = isWindows ? pattern.windowsCommand : pattern.unixCommand;
    const translatedArgs = this.translateArguments(parsed.args, pattern, isWindows);
    
    const confidence = this.calculateConfidence(pattern, parsed.args);
    const warnings = this.generateWarnings(pattern, parsed.args);

    return {
      command: targetCommand.split(' ')[0],
      args: [...targetCommand.split(' ').slice(1), ...translatedArgs],
      options: this.getDefaultOptions(),
      confidence,
      warnings,
      requiresElevation: this.requiresElevation(pattern, parsed.args)
    };
  }

  private parseCommand(input: string): { command: string; args: string[] } {
    const parts = input.trim().split(/\s+/);
    return {
      command: parts[0] || '',
      args: parts.slice(1)
    };
  }

  private findCommandPattern(command: string): CommandPattern | undefined {
    // Direct match
    let pattern = this.commandPatterns.get(command);
    if (pattern) return pattern;

    // Try git subcommands
    if (command === 'git') {
      return this.commandPatterns.get('git-status');
    }

    // Fuzzy matching for common variations
    const variations = [
      command.replace(/^g/, 'grep'),
      command.replace(/^l/, 'ls'),
      command.replace(/^c/, 'cat')
    ];

    for (const variation of variations) {
      pattern = this.commandPatterns.get(variation);
      if (pattern) return pattern;
    }

    return undefined;
  }

  private translateArguments(args: string[], pattern: CommandPattern, isWindows: boolean): string[] {
    const translated: string[] = [];
    
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      
      if (arg.startsWith('-')) {
        const mapping = pattern.parameters.find(p => 
          isWindows ? p.unixParam === arg : p.windowsParam === arg
        );
        
        if (mapping) {
          const targetParam = isWindows ? mapping.windowsParam : mapping.unixParam;
          if (targetParam) {
            translated.push(targetParam);
          }
        } else {
          translated.push(arg); // Keep unknown parameters as-is
        }
      } else {
        // Non-flag arguments (files, patterns, etc.)
        translated.push(this.escapePath(arg));
      }
    }

    return translated;
  }

  private escapePath(path: string): string {
    if (!this.platformInfo) return path;

    const isWindows = this.platformInfo.os === 'windows';
    
    if (isWindows) {
      // Windows path escaping
      if (path.includes(' ')) {
        return `"${path}"`;
      }
      return path.replace(/\//g, '\\');
    } else {
      // Unix path escaping
      return path.replace(/(\s|[()[\]{}*?$`"'\\])/g, '\\$1');
    }
  }

  private calculateConfidence(pattern: CommandPattern, args: string[]): number {
    let confidence = 0.8; // Base confidence

    // Increase confidence for known parameters
    const knownParams = args.filter(arg => 
      arg.startsWith('-') && pattern.parameters.some(p => 
        p.unixParam === arg || p.windowsParam === arg
      )
    );
    
    confidence += (knownParams.length / Math.max(args.length, 1)) * 0.2;

    // Decrease confidence for dangerous operations
    if (pattern.dangerLevel === 'dangerous') {
      confidence -= 0.2;
    } else if (pattern.dangerLevel === 'caution') {
      confidence -= 0.1;
    }

    return Math.max(0, Math.min(1, confidence));
  }

  private generateWarnings(pattern: CommandPattern, args: string[]): string[] {
    const warnings: string[] = [];

    if (pattern.dangerLevel === 'dangerous') {
      warnings.push(`⚠️ DANGEROUS: ${pattern.description} - This command can cause data loss`);
    } else if (pattern.dangerLevel === 'caution') {
      warnings.push(`⚠️ CAUTION: ${pattern.description} - Use with care`);
    }

    // Check for potentially destructive flags
    const destructiveFlags = ['-f', '--force', '-r', '--recursive'];
    const hasDestructiveFlags = args.some(arg => destructiveFlags.includes(arg));
    
    if (hasDestructiveFlags && pattern.dangerLevel !== 'safe') {
      warnings.push('⚠️ Using force or recursive flags - double-check your command');
    }

    return warnings;
  }

  private requiresElevation(pattern: CommandPattern, args: string[]): boolean {
    // Commands that typically require elevation
    const elevationCommands = ['rm', 'mv', 'cp'];
    const systemPaths = ['/etc', '/usr', '/bin', '/sbin', 'C:\\Windows', 'C:\\Program Files'];
    
    if (elevationCommands.includes(pattern.name)) {
      return args.some(arg => systemPaths.some(path => arg.includes(path)));
    }

    return false;
  }

  private createPassthroughTranslation(input: string): CommandTranslation {
    const parsed = this.parseCommand(input);
    
    return {
      command: parsed.command,
      args: parsed.args,
      options: this.getDefaultOptions(),
      confidence: 0.5,
      warnings: ['⚠️ Unknown command - executing as-is'],
      requiresElevation: false
    };
  }

  private getDefaultOptions(): CommandOptions {
    return {
      timeout: 30000,
      encoding: this.platformInfo?.capabilities.defaultEncoding || 'utf8',
      maxBuffer: 1024 * 1024 // 1MB
    };
  }

  // Public utility methods
  getAvailableCommands(): CommandPattern[] {
    return Array.from(this.commandPatterns.values());
  }

  getCommandsByCategory(category: CommandCategory): CommandPattern[] {
    return Array.from(this.commandPatterns.values())
      .filter(pattern => pattern.category === category);
  }

  getCommandHelp(commandName: string): CommandPattern | undefined {
    return this.commandPatterns.get(commandName);
  }
}

export const commandTranslator = new CommandTranslator();
