// intelligent-file-reader.ts - Main intelligent file reading system
import { fileAnalyzer, FileMetadata, FileOutline, FileChunk } from './file-analyzer.js';
import { fileCache } from './file-cache.js';
import { stat } from 'fs/promises';

export interface ReadOptions {
  maxTokens?: number;
  context?: string;
  includeOutline?: boolean;
  includeSummary?: boolean;
  forceRefresh?: boolean;
  relevanceThreshold?: number;
}

export interface ReadResult {
  content: string;
  metadata: FileMetadata;
  outline?: FileOutline;
  summary?: string;
  chunks?: FileChunk[];
  tokenCount: number;
  truncated: boolean;
  strategy: 'full' | 'chunked' | 'summarized';
}

export class IntelligentFileReader {
  private static readonly DEFAULT_MAX_TOKENS = 4000;
  private static readonly TOKENS_PER_CHAR = 0.25; // Rough estimate
  
  constructor() {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    await fileCache.initialize();
  }

  async readFile(filePath: string, options: ReadOptions = {}): Promise<ReadResult> {
    const {
      maxTokens = IntelligentFileReader.DEFAULT_MAX_TOKENS,
      context,
      includeOutline = true,
      includeSummary = true,
      forceRefresh = false,
      relevanceThreshold = 0.3
    } = options;

    // Get or create metadata
    let metadata = forceRefresh ? null : await fileCache.getMetadata(filePath);
    if (!metadata) {
      metadata = await fileAnalyzer.analyzeFile(filePath);
      await fileCache.setMetadata(filePath, metadata);
    }

    // Check if file has been modified
    const stats = await stat(filePath);
    if (stats.mtime > metadata.lastModified) {
      await fileCache.invalidateFile(filePath);
      metadata = await fileAnalyzer.analyzeFile(filePath);
      await fileCache.setMetadata(filePath, metadata);
    }

    // Determine reading strategy based on file size and token limit
    const estimatedTokens = metadata.size * IntelligentFileReader.TOKENS_PER_CHAR;
    
    if (estimatedTokens <= maxTokens) {
      return this.readFullFile(filePath, metadata, options);
    } else if (metadata.lineCount > 1000) {
      return this.readChunkedFile(filePath, metadata, options);
    } else {
      return this.readSummarizedFile(filePath, metadata, options);
    }
  }

  private async readFullFile(filePath: string, metadata: FileMetadata, options: ReadOptions): Promise<ReadResult> {
    const content = await fileAnalyzer.readFileContent(filePath);
    
    let outline: FileOutline | undefined;
    let summary: string | undefined;

    if (options.includeOutline) {
      outline = await fileCache.getOutline(filePath);
      if (!outline) {
        outline = await fileAnalyzer.createFileOutline(filePath, content);
        await fileCache.setOutline(filePath, outline);
      }
    }

    if (options.includeSummary) {
      summary = await fileCache.getSummary(filePath);
      if (!summary) {
        summary = this.generateSummary(content, metadata);
        await fileCache.setSummary(filePath, summary);
      }
    }

    return {
      content,
      metadata,
      outline,
      summary,
      tokenCount: Math.ceil(content.length * IntelligentFileReader.TOKENS_PER_CHAR),
      truncated: false,
      strategy: 'full'
    };
  }

  private async readChunkedFile(filePath: string, metadata: FileMetadata, options: ReadOptions): Promise<ReadResult> {
    // Get cached chunks or create new ones
    let chunks = await fileCache.getChunks(filePath, options.context);
    if (!chunks) {
      chunks = await fileAnalyzer.chunkFile(filePath, options.context);
      await fileCache.setChunks(filePath, chunks, options.context);
    }

    // Filter chunks by relevance if context is provided
    if (options.context && options.relevanceThreshold) {
      chunks = chunks.filter(chunk => chunk.metadata.importance >= options.relevanceThreshold!);
    }

    // Select top chunks that fit within token limit
    const selectedChunks = this.selectChunksWithinTokenLimit(chunks, options.maxTokens || IntelligentFileReader.DEFAULT_MAX_TOKENS);
    
    const content = selectedChunks.map(chunk => 
      `// ${chunk.type}: ${chunk.metadata.functionName || chunk.metadata.className || chunk.metadata.sectionTitle || 'Unknown'}\n` +
      `// Lines ${chunk.startLine}-${chunk.endLine}\n` +
      chunk.content
    ).join('\n\n');

    let outline: FileOutline | undefined;
    let summary: string | undefined;

    if (options.includeOutline) {
      outline = await fileCache.getOutline(filePath);
      if (!outline) {
        outline = await fileAnalyzer.createFileOutline(filePath);
        await fileCache.setOutline(filePath, outline);
      }
    }

    if (options.includeSummary) {
      summary = await fileCache.getSummary(filePath);
      if (!summary) {
        const fullContent = await fileAnalyzer.readFileContent(filePath);
        summary = this.generateSummary(fullContent, metadata);
        await fileCache.setSummary(filePath, summary);
      }
    }

    return {
      content,
      metadata,
      outline,
      summary,
      chunks: selectedChunks,
      tokenCount: Math.ceil(content.length * IntelligentFileReader.TOKENS_PER_CHAR),
      truncated: selectedChunks.length < chunks.length,
      strategy: 'chunked'
    };
  }

  private async readSummarizedFile(filePath: string, metadata: FileMetadata, options: ReadOptions): Promise<ReadResult> {
    let summary = await fileCache.getSummary(filePath);
    if (!summary) {
      const content = await fileAnalyzer.readFileContent(filePath);
      summary = this.generateDetailedSummary(content, metadata);
      await fileCache.setSummary(filePath, summary);
    }

    let outline: FileOutline | undefined;
    if (options.includeOutline) {
      outline = await fileCache.getOutline(filePath);
      if (!outline) {
        outline = await fileAnalyzer.createFileOutline(filePath);
        await fileCache.setOutline(filePath, outline);
      }
    }

    // Include key sections if they fit
    const chunks = await fileAnalyzer.chunkFile(filePath, options.context);
    const importantChunks = chunks
      .filter(chunk => chunk.metadata.importance > 0.7)
      .slice(0, 3); // Top 3 most important chunks

    const keyContent = importantChunks.map(chunk => 
      `// Key ${chunk.type}: ${chunk.metadata.functionName || chunk.metadata.className || 'Important Section'}\n` +
      chunk.content.substring(0, 500) + (chunk.content.length > 500 ? '...' : '')
    ).join('\n\n');

    const content = `${summary}\n\n// Key Sections:\n${keyContent}`;

    return {
      content,
      metadata,
      outline,
      summary,
      chunks: importantChunks,
      tokenCount: Math.ceil(content.length * IntelligentFileReader.TOKENS_PER_CHAR),
      truncated: true,
      strategy: 'summarized'
    };
  }

  private selectChunksWithinTokenLimit(chunks: FileChunk[], maxTokens: number): FileChunk[] {
    const selected: FileChunk[] = [];
    let currentTokens = 0;

    // Sort by importance (highest first)
    const sortedChunks = [...chunks].sort((a, b) => b.metadata.importance - a.metadata.importance);

    for (const chunk of sortedChunks) {
      const chunkTokens = Math.ceil(chunk.content.length * IntelligentFileReader.TOKENS_PER_CHAR);
      
      if (currentTokens + chunkTokens <= maxTokens) {
        selected.push(chunk);
        currentTokens += chunkTokens;
      } else {
        break;
      }
    }

    // Sort selected chunks by line number for coherent reading
    return selected.sort((a, b) => a.startLine - b.startLine);
  }

  private generateSummary(content: string, metadata: FileMetadata): string {
    const lines = content.split('\n');
    const firstLines = lines.slice(0, 5).join('\n');
    const lastLines = lines.slice(-3).join('\n');
    
    return `File: ${metadata.name} (${metadata.type})\n` +
           `Size: ${metadata.lineCount} lines, ${(metadata.size / 1024).toFixed(1)}KB\n` +
           `First lines:\n${firstLines}\n...\n` +
           `Last lines:\n${lastLines}`;
  }

  private generateDetailedSummary(content: string, metadata: FileMetadata): string {
    const lines = content.split('\n');
    const summary = [`File: ${metadata.name} (${metadata.type})`];
    summary.push(`Size: ${metadata.lineCount} lines, ${(metadata.size / 1024).toFixed(1)}KB`);
    
    // Extract key information based on file type
    if (metadata.type === 'code') {
      const imports = lines.filter(line => line.trim().startsWith('import') || line.trim().startsWith('from'));
      const exports = lines.filter(line => line.includes('export'));
      const classes = lines.filter(line => line.includes('class '));
      const functions = lines.filter(line => line.includes('function ') || line.includes('def '));
      
      if (imports.length > 0) {
        summary.push(`\nImports (${imports.length}):`);
        summary.push(imports.slice(0, 5).join('\n'));
      }
      
      if (classes.length > 0) {
        summary.push(`\nClasses (${classes.length}):`);
        summary.push(classes.slice(0, 3).join('\n'));
      }
      
      if (functions.length > 0) {
        summary.push(`\nFunctions (${functions.length}):`);
        summary.push(functions.slice(0, 5).join('\n'));
      }
    } else if (metadata.type === 'documentation') {
      const headers = lines.filter(line => line.trim().startsWith('#'));
      if (headers.length > 0) {
        summary.push(`\nHeaders (${headers.length}):`);
        summary.push(headers.slice(0, 10).join('\n'));
      }
    }

    // Add first and last few lines
    summary.push('\nFirst lines:');
    summary.push(lines.slice(0, 3).join('\n'));
    summary.push('\nLast lines:');
    summary.push(lines.slice(-3).join('\n'));

    return summary.join('\n');
  }

  async getFileOutline(filePath: string, forceRefresh = false): Promise<FileOutline> {
    if (!forceRefresh) {
      const cached = await fileCache.getOutline(filePath);
      if (cached) return cached;
    }

    const outline = await fileAnalyzer.createFileOutline(filePath);
    await fileCache.setOutline(filePath, outline);
    return outline;
  }

  async warmCache(filePaths: string[]): Promise<void> {
    await fileCache.warmCache(filePaths);
  }

  async getCacheStats() {
    return fileCache.getStats();
  }

  async clearCache(): Promise<void> {
    await fileCache.clear();
  }
}

export const intelligentFileReader = new IntelligentFileReader();
