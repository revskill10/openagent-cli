/**
 * GraphRAG MCP Tools
 * 
 * MCP server tools for GraphRAG functionality
 */

import { GraphRAGEngine } from './core.js';
import { createRAGTool, RAGToolPresets } from '../rag/enhanced-rag-tool.js';

// MCP Tool definitions for GraphRAG
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
  handler: (params: any, context?: any) => Promise<any>;
}

export class GraphRAGMCPTools {
  private engine: GraphRAGEngine;
  private tools: Map<string, MCPTool> = new Map();

  constructor(engine: GraphRAGEngine) {
    this.engine = engine;
    this.initializeTools();
  }

  private initializeTools(): void {
    // Semantic search tool
    this.tools.set('semantic_search', {
      name: 'semantic_search',
      description: 'Search codebase semantically using natural language queries',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Natural language query to search for'
          },
          fileFilter: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional list of file paths to limit search to'
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results to return',
            default: 10
          },
          threshold: {
            type: 'number',
            description: 'Minimum similarity threshold (0-1)',
            default: 0.7
          }
        },
        required: ['query']
      },
      handler: async (params) => {
        const results = await this.engine.searchSimilar(params.query, {
          limit: params.limit || 10,
          threshold: params.threshold || 0.7,
          fileFilter: params.fileFilter
        });

        return {
          results: results.map(r => ({
            content: r.chunk.content,
            filePath: r.chunk.metadata.filePath,
            similarity: r.similarity,
            entityType: r.chunk.metadata.entityType,
            startLine: r.chunk.metadata.startLine,
            endLine: r.chunk.metadata.endLine
          })),
          totalFound: results.length
        };
      }
    });

    // Index codebase tool
    this.tools.set('index_codebase', {
      name: 'index_codebase',
      description: 'Index a codebase for semantic search and analysis',
      inputSchema: {
        type: 'object',
        properties: {
          rootPath: {
            type: 'string',
            description: 'Root path of the codebase to index'
          },
          languages: {
            type: 'array',
            items: { type: 'string' },
            description: 'Programming languages to include',
            default: ['typescript', 'javascript', 'python']
          },
          excludePatterns: {
            type: 'array',
            items: { type: 'string' },
            description: 'Glob patterns to exclude',
            default: ['node_modules/**', '*.min.js', 'dist/**', '.git/**']
          },
          maxFileSize: {
            type: 'number',
            description: 'Maximum file size in bytes',
            default: 1048576
          }
        },
        required: ['rootPath']
      },
      handler: async (params) => {
        const job = await this.engine.indexCodebase(params.rootPath, {
          languages: params.languages,
          excludePatterns: params.excludePatterns,
          maxFileSize: params.maxFileSize
        });

        return {
          jobId: job.id,
          status: job.status,
          targetPath: job.targetPath,
          startedAt: job.startedAt,
          metadata: job.metadata
        };
      }
    });

    // Get function call graph
    this.tools.set('get_call_graph', {
      name: 'get_call_graph',
      description: 'Get the call graph for a specific function',
      inputSchema: {
        type: 'object',
        properties: {
          functionName: {
            type: 'string',
            description: 'Name of the function to analyze'
          },
          filePath: {
            type: 'string',
            description: 'Optional file path to limit search'
          },
          depth: {
            type: 'number',
            description: 'Maximum depth of call graph traversal',
            default: 3
          }
        },
        required: ['functionName']
      },
      handler: async (params) => {
        // Find function entities
        const functions = await this.engine.searchByType('function', params.functionName);
        
        if (functions.length === 0) {
          return { error: `Function '${params.functionName}' not found` };
        }

        // Get the most relevant function
        let targetFunction = functions[0];
        if (params.filePath) {
          const fileMatch = functions.find(f => f.filePath === params.filePath);
          if (fileMatch) targetFunction = fileMatch;
        }

        // Get related entities (simplified call graph)
        const related = await this.engine.findRelated(targetFunction.id, ['calls']);

        return {
          function: {
            name: targetFunction.name,
            filePath: targetFunction.filePath,
            startLine: targetFunction.startLine,
            signature: targetFunction.signature
          },
          callsTo: related.map(r => ({
            name: r.name,
            filePath: r.filePath, 
            entityType: r.entityType,
            startLine: r.startLine
          })),
          totalCalls: related.length
        };
      }
    });

    // Analyze code patterns
    this.tools.set('analyze_code_pattern', {
      name: 'analyze_code_pattern',
      description: 'Analyze code patterns and suggest improvements',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Path to the file to analyze'
          },
          patternType: {
            type: 'string',
            description: 'Type of pattern to analyze',
            enum: ['functions', 'classes', 'imports', 'complexity'],
            default: 'functions'
          }
        },
        required: ['filePath']
      },
      handler: async (params) => {
        const fileContext = await this.engine.getFileContext(params.filePath);
        
        const analysis = {
          file: {
            path: fileContext.file.filePath,
            language: fileContext.file.language,
            lineCount: fileContext.file.lineCount,
            sizeBytes: fileContext.file.sizeBytes
          },
          entities: fileContext.entities.map(e => ({
            name: e.name,
            type: e.entityType,
            startLine: e.startLine,
            endLine: e.endLine,
            linesOfCode: e.endLine - e.startLine + 1
          })),
          relationships: fileContext.relationships.map(r => ({
            type: r.relationshipType,
            sourceEntity: fileContext.entities.find(e => e.id === r.sourceId)?.name,
            targetEntity: fileContext.entities.find(e => e.id === r.targetId)?.name
          })),
          metrics: {
            totalEntities: fileContext.entities.length,
            totalRelationships: fileContext.relationships.length,
            averageEntitySize: fileContext.entities.length > 0 
              ? fileContext.entities.reduce((sum, e) => sum + (e.endLine - e.startLine), 0) / fileContext.entities.length
              : 0
          }
        };

        return analysis;
      }
    });

    // Get file context
    this.tools.set('get_file_context', {
      name: 'get_file_context',
      description: 'Get comprehensive context information for a file',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Path to the file'
          },
          includeRelated: {
            type: 'boolean',
            description: 'Include related files and dependencies',
            default: true
          }
        },
        required: ['filePath']
      },
      handler: async (params) => {
        const context = await this.engine.getFileContext(params.filePath);
        
        let relatedFiles: string[] = [];
        if (params.includeRelated) {
          // Find files that import from or are imported by this file
          const importRelationships = context.relationships.filter(r => 
            r.relationshipType === 'imports' || r.relationshipType === 'exports'
          );
          
          const relatedEntityIds = new Set([
            ...importRelationships.map(r => r.sourceId),
            ...importRelationships.map(r => r.targetId)
          ]);
          
          // Get unique file paths from related entities
          relatedFiles = Array.from(new Set(
            context.entities
              .filter(e => relatedEntityIds.has(e.id))
              .map(e => e.filePath)
          )).filter(path => path !== params.filePath);
        }

        return {
          file: context.file,
          entities: context.entities.map(e => ({
            id: e.id,
            name: e.name,
            type: e.entityType,
            signature: e.signature,
            startLine: e.startLine,
            endLine: e.endLine
          })),
          relationships: context.relationships,
          relatedFiles,
          summary: {
            totalEntities: context.entities.length,
            entityTypes: [...new Set(context.entities.map(e => e.entityType))],
            totalRelationships: context.relationships.length
          }
        };
      }
    });

    // Create RAG tool
    this.tools.set('create_rag_tool', {
      name: 'create_rag_tool',
      description: 'Create a specialized RAG tool for querying specific content',
      inputSchema: {
        type: 'object',
        properties: {
          preset: {
            type: 'string',
            enum: ['webDocs', 'codeRepo', 'localFiles', 'mock'],
            description: 'Predefined RAG tool configuration'
          },
          sources: {
            type: 'array',
            items: { type: 'string' },
            description: 'Sources to index (URLs, file paths, etc.)'
          },
          customConfig: {
            type: 'object',
            description: 'Custom RAG tool configuration'
          }
        },
        required: ['preset', 'sources']
      },
      handler: async (params) => {
        const toolConfig = RAGToolPresets[params.preset as keyof typeof RAGToolPresets]();
        const tool = createRAGTool(toolConfig);
        
        // Add documents
        await tool.addDocuments(params.sources);
        
        return {
          toolName: tool.name,
          description: tool.description,
          sourcesAdded: params.sources.length,
          ready: true
        };
      }
    });
  }

  // Get all available tools
  getTools(): MCPTool[] {
    return Array.from(this.tools.values());
  }

  // Get a specific tool
  getTool(name: string): MCPTool | undefined {
    return this.tools.get(name);
  }

  // Execute a tool
  async executeTool(name: string, params: any, context?: any): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }

    try {
      return await tool.handler(params, context);
    } catch (error) {
      throw new Error(`Tool execution failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Get tool schema for MCP protocol
  getToolSchemas(): Array<{
    name: string;
    description: string;
    inputSchema: any;
  }> {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }));
  }
}