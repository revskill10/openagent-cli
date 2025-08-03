// file-analyzer.ts - Intelligent file analysis and content optimization
import { readFile, stat } from 'fs/promises';
import { extname, basename } from 'path';
import { createHash } from 'crypto';

export interface FileMetadata {
  path: string;
  name: string;
  extension: string;
  size: number;
  lineCount: number;
  hash: string;
  type: FileType;
  encoding: string;
  lastModified: Date;
}

export interface FileChunk {
  id: string;
  content: string;
  startLine: number;
  endLine: number;
  type: ChunkType;
  metadata: {
    functionName?: string;
    className?: string;
    sectionTitle?: string;
    importance: number; // 0-1 score
  };
}

export interface FileOutline {
  path: string;
  structure: OutlineNode[];
  summary: string;
  keyEntities: string[];
}

export interface OutlineNode {
  name: string;
  type: 'function' | 'class' | 'interface' | 'section' | 'module';
  startLine: number;
  endLine: number;
  children?: OutlineNode[];
  description?: string;
}

export type FileType = 'code' | 'documentation' | 'data' | 'config' | 'binary' | 'unknown';
export type ChunkType = 'function' | 'class' | 'section' | 'paragraph' | 'block';

export class FileAnalyzer {
  private static readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  private static readonly LARGE_FILE_THRESHOLD = 1000; // lines
  
  private static readonly FILE_TYPE_PATTERNS = {
    code: ['.ts', '.js', '.tsx', '.jsx', '.py', '.java', '.cpp', '.c', '.cs', '.go', '.rs', '.php', '.rb'],
    documentation: ['.md', '.txt', '.rst', '.adoc', '.tex'],
    data: ['.json', '.xml', '.yaml', '.yml', '.csv', '.sql'],
    config: ['.config', '.conf', '.ini', '.env', '.toml'],
    binary: ['.png', '.jpg', '.jpeg', '.gif', '.pdf', '.zip', '.tar', '.gz']
  };

  async analyzeFile(filePath: string): Promise<FileMetadata> {
    const stats = await stat(filePath);
    const content = await this.readFileContent(filePath);
    
    const metadata: FileMetadata = {
      path: filePath,
      name: basename(filePath),
      extension: extname(filePath),
      size: stats.size,
      lineCount: content.split('\n').length,
      hash: this.calculateHash(content),
      type: this.detectFileType(filePath),
      encoding: 'utf-8', // Simplified for now
      lastModified: stats.mtime
    };

    return metadata;
  }

  async readFileContent(filePath: string): Promise<string> {
    const stats = await stat(filePath);
    
    if (stats.size > FileAnalyzer.MAX_FILE_SIZE) {
      throw new Error(`File too large: ${stats.size} bytes (max: ${FileAnalyzer.MAX_FILE_SIZE})`);
    }

    return await readFile(filePath, 'utf-8');
  }

  async createFileOutline(filePath: string, content?: string): Promise<FileOutline> {
    const fileContent = content || await this.readFileContent(filePath);
    const metadata = await this.analyzeFile(filePath);
    
    const structure = await this.parseStructure(fileContent, metadata.type, metadata.extension);
    const summary = this.generateSummary(fileContent, metadata);
    const keyEntities = this.extractKeyEntities(fileContent, metadata.type);

    return {
      path: filePath,
      structure,
      summary,
      keyEntities
    };
  }

  async chunkFile(filePath: string, context?: string): Promise<FileChunk[]> {
    const content = await this.readFileContent(filePath);
    const metadata = await this.analyzeFile(filePath);
    
    if (metadata.lineCount <= FileAnalyzer.LARGE_FILE_THRESHOLD) {
      // Small file - return as single chunk
      return [{
        id: `${metadata.hash}_full`,
        content,
        startLine: 1,
        endLine: metadata.lineCount,
        type: 'block',
        metadata: { importance: 1.0 }
      }];
    }

    // Large file - intelligent chunking
    return this.performSemanticChunking(content, metadata, context);
  }

  private detectFileType(filePath: string): FileType {
    const ext = extname(filePath).toLowerCase();
    
    for (const [type, extensions] of Object.entries(FileAnalyzer.FILE_TYPE_PATTERNS)) {
      if (extensions.includes(ext)) {
        return type as FileType;
      }
    }
    
    return 'unknown';
  }

  private calculateHash(content: string): string {
    return createHash('md5').update(content).digest('hex');
  }

  private async parseStructure(content: string, fileType: FileType, extension: string): Promise<OutlineNode[]> {
    switch (fileType) {
      case 'code':
        return this.parseCodeStructure(content, extension);
      case 'documentation':
        return this.parseDocumentationStructure(content);
      default:
        return this.parseGenericStructure(content);
    }
  }

  private parseCodeStructure(content: string, extension: string): OutlineNode[] {
    const lines = content.split('\n');
    const nodes: OutlineNode[] = [];
    
    // TypeScript/JavaScript parsing
    if (['.ts', '.js', '.tsx', '.jsx'].includes(extension)) {
      return this.parseTypeScriptStructure(lines);
    }
    
    // Python parsing
    if (extension === '.py') {
      return this.parsePythonStructure(lines);
    }
    
    // Generic code parsing
    return this.parseGenericCodeStructure(lines);
  }

  private parseTypeScriptStructure(lines: string[]): OutlineNode[] {
    const nodes: OutlineNode[] = [];
    const classRegex = /^\s*(export\s+)?(abstract\s+)?class\s+(\w+)/;
    const functionRegex = /^\s*(export\s+)?(async\s+)?function\s+(\w+)/;
    const interfaceRegex = /^\s*(export\s+)?interface\s+(\w+)/;
    const methodRegex = /^\s*(public|private|protected)?\s*(async\s+)?(\w+)\s*\(/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (classRegex.test(line)) {
        const match = line.match(classRegex);
        if (match) {
          const endLine = this.findBlockEnd(lines, i);
          nodes.push({
            name: match[3],
            type: 'class',
            startLine: i + 1,
            endLine: endLine + 1,
            children: this.parseClassMethods(lines.slice(i, endLine + 1), i)
          });
        }
      } else if (functionRegex.test(line)) {
        const match = line.match(functionRegex);
        if (match) {
          const endLine = this.findBlockEnd(lines, i);
          nodes.push({
            name: match[3],
            type: 'function',
            startLine: i + 1,
            endLine: endLine + 1
          });
        }
      } else if (interfaceRegex.test(line)) {
        const match = line.match(interfaceRegex);
        if (match) {
          const endLine = this.findBlockEnd(lines, i);
          nodes.push({
            name: match[2],
            type: 'interface',
            startLine: i + 1,
            endLine: endLine + 1
          });
        }
      }
    }

    return nodes;
  }

  private parsePythonStructure(lines: string[]): OutlineNode[] {
    const nodes: OutlineNode[] = [];
    const classRegex = /^\s*class\s+(\w+)/;
    const functionRegex = /^\s*def\s+(\w+)/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (classRegex.test(line)) {
        const match = line.match(classRegex);
        if (match) {
          const endLine = this.findPythonBlockEnd(lines, i);
          nodes.push({
            name: match[1],
            type: 'class',
            startLine: i + 1,
            endLine: endLine + 1,
            children: this.parsePythonMethods(lines.slice(i, endLine + 1), i)
          });
        }
      } else if (functionRegex.test(line)) {
        const match = line.match(functionRegex);
        if (match) {
          const endLine = this.findPythonBlockEnd(lines, i);
          nodes.push({
            name: match[1],
            type: 'function',
            startLine: i + 1,
            endLine: endLine + 1
          });
        }
      }
    }

    return nodes;
  }

  private parseDocumentationStructure(content: string): OutlineNode[] {
    const lines = content.split('\n');
    const nodes: OutlineNode[] = [];
    const headerRegex = /^(#{1,6})\s+(.+)$/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(headerRegex);
      
      if (match) {
        const level = match[1].length;
        const title = match[2];
        const endLine = this.findSectionEnd(lines, i, level);
        
        nodes.push({
          name: title,
          type: 'section',
          startLine: i + 1,
          endLine: endLine + 1
        });
      }
    }

    return nodes;
  }

  private parseGenericStructure(content: string): OutlineNode[] {
    // Basic structure parsing for unknown file types
    const lines = content.split('\n');
    const chunks: OutlineNode[] = [];
    const chunkSize = 50; // lines per chunk
    
    for (let i = 0; i < lines.length; i += chunkSize) {
      const endLine = Math.min(i + chunkSize - 1, lines.length - 1);
      chunks.push({
        name: `Section ${Math.floor(i / chunkSize) + 1}`,
        type: 'section',
        startLine: i + 1,
        endLine: endLine + 1
      });
    }

    return chunks;
  }

  private parseGenericCodeStructure(lines: string[]): OutlineNode[] {
    // Generic code structure parsing
    const nodes: OutlineNode[] = [];
    const functionRegex = /^\s*\w+\s+\w+\s*\(/; // Basic function pattern
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (functionRegex.test(line)) {
        const endLine = this.findBlockEnd(lines, i);
        nodes.push({
          name: `Function at line ${i + 1}`,
          type: 'function',
          startLine: i + 1,
          endLine: endLine + 1
        });
      }
    }

    return nodes;
  }

  private parseClassMethods(lines: string[], offset: number): OutlineNode[] {
    const methods: OutlineNode[] = [];
    const methodRegex = /^\s*(public|private|protected)?\s*(async\s+)?(\w+)\s*\(/;

    for (let i = 1; i < lines.length; i++) { // Skip class declaration
      const line = lines[i];
      const match = line.match(methodRegex);
      
      if (match) {
        const endLine = this.findBlockEnd(lines, i);
        methods.push({
          name: match[3],
          type: 'function',
          startLine: offset + i + 1,
          endLine: offset + endLine + 1
        });
      }
    }

    return methods;
  }

  private parsePythonMethods(lines: string[], offset: number): OutlineNode[] {
    const methods: OutlineNode[] = [];
    const methodRegex = /^\s+def\s+(\w+)/;

    for (let i = 1; i < lines.length; i++) { // Skip class declaration
      const line = lines[i];
      const match = line.match(methodRegex);
      
      if (match) {
        const endLine = this.findPythonBlockEnd(lines, i);
        methods.push({
          name: match[1],
          type: 'function',
          startLine: offset + i + 1,
          endLine: offset + endLine + 1
        });
      }
    }

    return methods;
  }

  private findBlockEnd(lines: string[], startIndex: number): number {
    let braceCount = 0;
    let foundOpenBrace = false;

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      
      for (const char of line) {
        if (char === '{') {
          braceCount++;
          foundOpenBrace = true;
        } else if (char === '}') {
          braceCount--;
          if (foundOpenBrace && braceCount === 0) {
            return i;
          }
        }
      }
    }

    return lines.length - 1;
  }

  private findPythonBlockEnd(lines: string[], startIndex: number): number {
    const startIndentation = this.getIndentation(lines[startIndex]);
    
    for (let i = startIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      
      if (line.trim() === '') continue; // Skip empty lines
      
      const currentIndentation = this.getIndentation(line);
      if (currentIndentation <= startIndentation) {
        return i - 1;
      }
    }

    return lines.length - 1;
  }

  private findSectionEnd(lines: string[], startIndex: number, headerLevel: number): number {
    for (let i = startIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      
      if (match && match[1].length <= headerLevel) {
        return i - 1;
      }
    }

    return lines.length - 1;
  }

  private getIndentation(line: string): number {
    const match = line.match(/^(\s*)/);
    return match ? match[1].length : 0;
  }

  private generateSummary(content: string, metadata: FileMetadata): string {
    const lines = content.split('\n');
    const firstLines = lines.slice(0, 10).join('\n');
    
    return `${metadata.type} file with ${metadata.lineCount} lines. ` +
           `Contains ${this.countFunctions(content)} functions/methods. ` +
           `File size: ${(metadata.size / 1024).toFixed(1)}KB.`;
  }

  private extractKeyEntities(content: string, fileType: FileType): string[] {
    const entities: string[] = [];
    
    if (fileType === 'code') {
      // Extract class names, function names, etc.
      const classMatches = content.match(/class\s+(\w+)/g);
      const functionMatches = content.match(/function\s+(\w+)/g);
      
      if (classMatches) {
        entities.push(...classMatches.map(m => m.split(' ')[1]));
      }
      if (functionMatches) {
        entities.push(...functionMatches.map(m => m.split(' ')[1]));
      }
    }

    return [...new Set(entities)]; // Remove duplicates
  }

  private countFunctions(content: string): number {
    const functionPatterns = [
      /function\s+\w+/g,
      /\w+\s*\(/g,
      /def\s+\w+/g,
      /^\s*\w+\s*:/gm
    ];

    let count = 0;
    for (const pattern of functionPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        count += matches.length;
        break; // Use first matching pattern
      }
    }

    return count;
  }

  private async performSemanticChunking(content: string, metadata: FileMetadata, context?: string): Promise<FileChunk[]> {
    const outline = await this.createFileOutline(metadata.path, content);
    const chunks: FileChunk[] = [];

    // Create chunks based on structure
    for (const node of outline.structure) {
      const chunkContent = this.extractLines(content, node.startLine, node.endLine);
      const importance = this.calculateImportance(chunkContent, context);

      chunks.push({
        id: `${metadata.hash}_${node.name}_${node.startLine}`,
        content: chunkContent,
        startLine: node.startLine,
        endLine: node.endLine,
        type: node.type as ChunkType,
        metadata: {
          functionName: node.type === 'function' ? node.name : undefined,
          className: node.type === 'class' ? node.name : undefined,
          sectionTitle: node.type === 'section' ? node.name : undefined,
          importance
        }
      });
    }

    // Sort by importance if context is provided
    if (context) {
      chunks.sort((a, b) => b.metadata.importance - a.metadata.importance);
    }

    return chunks;
  }

  private extractLines(content: string, startLine: number, endLine: number): string {
    const lines = content.split('\n');
    return lines.slice(startLine - 1, endLine).join('\n');
  }

  private calculateImportance(content: string, context?: string): number {
    let importance = 0.5; // Base importance

    if (!context) return importance;

    // Simple relevance scoring based on keyword matching
    const contextWords = context.toLowerCase().split(/\s+/);
    const contentLower = content.toLowerCase();

    for (const word of contextWords) {
      if (word.length > 3 && contentLower.includes(word)) {
        importance += 0.1;
      }
    }

    return Math.min(importance, 1.0);
  }
}

export const fileAnalyzer = new FileAnalyzer();
