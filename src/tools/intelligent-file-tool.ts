// intelligent-file-tool.ts - Tool integration for intelligent file reading
import { ToolFunction } from './function-executor.js';
import { intelligentFileReader, ReadOptions } from '../intelligent-file-reader/intelligent-file-reader.js';
import { resolve } from 'path';

export interface IntelligentReadFileArgs {
  path: string;
  maxTokens?: number;
  context?: string;
  includeOutline?: boolean;
  includeSummary?: boolean;
  forceRefresh?: boolean;
  relevanceThreshold?: number;
}

export interface FileOutlineArgs {
  path: string;
  forceRefresh?: boolean;
}

export interface WarmCacheArgs {
  paths: string[];
}

// Intelligent file reading tool
export const intelligentReadFile: ToolFunction = async (args: IntelligentReadFileArgs) => {
  try {
    const {
      path,
      maxTokens = 4000,
      context,
      includeOutline = true,
      includeSummary = true,
      forceRefresh = false,
      relevanceThreshold = 0.3
    } = args;

    // Resolve path relative to current working directory
    const resolvedPath = resolve(path);

    const options: ReadOptions = {
      maxTokens,
      context,
      includeOutline,
      includeSummary,
      forceRefresh,
      relevanceThreshold
    };

    const result = await intelligentFileReader.readFile(resolvedPath, options);

    // Format the response for better readability
    const response = {
      success: true,
      file: {
        path: result.metadata.path,
        name: result.metadata.name,
        type: result.metadata.type,
        size: `${result.metadata.lineCount} lines, ${(result.metadata.size / 1024).toFixed(1)}KB`,
        lastModified: result.metadata.lastModified.toISOString()
      },
      content: result.content,
      strategy: result.strategy,
      tokenCount: result.tokenCount,
      truncated: result.truncated,
      outline: result.outline ? {
        summary: result.outline.summary,
        keyEntities: result.outline.keyEntities,
        structure: result.outline.structure.map(node => ({
          name: node.name,
          type: node.type,
          lines: `${node.startLine}-${node.endLine}`,
          children: node.children?.length || 0
        }))
      } : undefined,
      summary: result.summary,
      chunks: result.chunks ? {
        total: result.chunks.length,
        selected: result.chunks.map(chunk => ({
          type: chunk.type,
          name: chunk.metadata.functionName || chunk.metadata.className || chunk.metadata.sectionTitle,
          lines: `${chunk.startLine}-${chunk.endLine}`,
          importance: chunk.metadata.importance
        }))
      } : undefined
    };

    return response;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

// File outline tool
export const getFileOutline: ToolFunction = async (args: FileOutlineArgs) => {
  try {
    const { path, forceRefresh = false } = args;
    const resolvedPath = resolve(path);

    const outline = await intelligentFileReader.getFileOutline(resolvedPath, forceRefresh);

    return {
      success: true,
      outline: {
        path: outline.path,
        summary: outline.summary,
        keyEntities: outline.keyEntities,
        structure: outline.structure.map(node => ({
          name: node.name,
          type: node.type,
          startLine: node.startLine,
          endLine: node.endLine,
          description: node.description,
          children: node.children?.map(child => ({
            name: child.name,
            type: child.type,
            startLine: child.startLine,
            endLine: child.endLine
          })) || []
        }))
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

// Cache warming tool
export const warmFileCache: ToolFunction = async (args: WarmCacheArgs) => {
  try {
    const { paths } = args;
    const resolvedPaths = paths.map(path => resolve(path));

    await intelligentFileReader.warmCache(resolvedPaths);

    return {
      success: true,
      message: `Cache warmed for ${paths.length} files`,
      paths: resolvedPaths
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

// Cache stats tool
export const getFileCacheStats: ToolFunction = async () => {
  try {
    const stats = await intelligentFileReader.getCacheStats();

    return {
      success: true,
      stats: {
        totalEntries: stats.totalEntries,
        totalSize: `${(stats.totalSize / 1024).toFixed(1)}KB`,
        hitRate: `${(stats.hitRate * 100).toFixed(1)}%`,
        missRate: `${(stats.missRate * 100).toFixed(1)}%`,
        evictionCount: stats.evictionCount
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

// Clear cache tool
export const clearFileCache: ToolFunction = async () => {
  try {
    await intelligentFileReader.clearCache();

    return {
      success: true,
      message: 'File cache cleared successfully'
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

// Tool definitions for registration
export const intelligentFileTools = [
  {
    name: 'intelligent_read_file',
    description: 'Intelligently read a file with token optimization, context awareness, and semantic chunking. Automatically handles large files by summarizing or chunking content.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file to read'
        },
        maxTokens: {
          type: 'number',
          description: 'Maximum tokens to return (default: 4000)',
          default: 4000
        },
        context: {
          type: 'string',
          description: 'Context or query to help determine relevant sections'
        },
        includeOutline: {
          type: 'boolean',
          description: 'Include file structure outline (default: true)',
          default: true
        },
        includeSummary: {
          type: 'boolean',
          description: 'Include file summary (default: true)',
          default: true
        },
        forceRefresh: {
          type: 'boolean',
          description: 'Force refresh of cached data (default: false)',
          default: false
        },
        relevanceThreshold: {
          type: 'number',
          description: 'Minimum relevance score for chunks (0-1, default: 0.3)',
          default: 0.3
        }
      },
      required: ['path']
    },
    fn: intelligentReadFile
  },
  {
    name: 'get_file_outline',
    description: 'Get the structural outline of a file showing functions, classes, sections, etc.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file'
        },
        forceRefresh: {
          type: 'boolean',
          description: 'Force refresh of cached outline (default: false)',
          default: false
        }
      },
      required: ['path']
    },
    fn: getFileOutline
  },
  {
    name: 'warm_file_cache',
    description: 'Pre-load file metadata and outlines into cache for faster access',
    inputSchema: {
      type: 'object',
      properties: {
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of file paths to warm in cache'
        }
      },
      required: ['paths']
    },
    fn: warmFileCache
  },
  {
    name: 'get_file_cache_stats',
    description: 'Get statistics about the file cache performance',
    inputSchema: {
      type: 'object',
      properties: {}
    },
    fn: getFileCacheStats
  },
  {
    name: 'clear_file_cache',
    description: 'Clear all cached file data',
    inputSchema: {
      type: 'object',
      properties: {}
    },
    fn: clearFileCache
  }
];
