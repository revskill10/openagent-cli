/**
 * GraphRAG Core Engine
 * 
 * Core components for the GraphRAG engine using existing distributed abstractions
 */

import { createDistributedTask } from '../distributed_integration.js';
import { BaseRAGTool, RAGConfig, DocumentChunk, SearchResult } from '../rag/base.js';
import { resource, task } from '@bluelibs/runner';

// Core GraphRAG data structures
export interface CodeEntity {
  id: string;
  filePath: string;
  entityType: 'function' | 'class' | 'variable' | 'import' | 'interface' | 'type';
  name: string;
  signature?: string;
  content: string;
  startLine: number;
  endLine: number;
  embedding?: number[];
  hash: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CodeRelationship {
  id: string;
  sourceId: string;
  targetId: string;
  relationshipType: 'calls' | 'imports' | 'inherits' | 'uses' | 'exports';
  weight: number;
  createdAt: Date;
}

export interface FileMetadata {
  id: string;
  filePath: string;
  language: string;
  sizeBytes: number;
  lineCount: number;
  hash: string;
  lastModified: Date;
  indexedAt: Date;
}

export interface IndexingJob {
  id: string;
  jobType: 'full' | 'incremental' | 'file';
  status: 'pending' | 'running' | 'completed' | 'failed';
  targetPath: string;
  startedAt?: Date;
  completedAt?: Date;
  errorMessage?: string;
  metadata: Record<string, any>;
}

export interface IndexOptions {
  languages?: string[];
  includePatterns?: string[];
  excludePatterns?: string[];
  maxFileSize?: number;
  parallelism?: number;
}

export interface SearchOptions {
  limit?: number;
  threshold?: number;
  includeContent?: boolean;
  fileFilter?: string[];
}

// GraphRAG Engine using distributed tasks
export class GraphRAGEngine {
  private ragConfig: RAGConfig;
  private entities: Map<string, CodeEntity> = new Map();
  private relationships: Map<string, CodeRelationship> = new Map();
  private files: Map<string, FileMetadata> = new Map();
  
  // Distributed tasks for indexing operations
  private indexFileTask = createDistributedTask(
    'graphrag.indexFile',
    async (input: { filePath: string; options?: IndexOptions }, deps?: any) => {
      return await this.indexSingleFile(input.filePath, input.options);
    },
    { migratable: true }
  );

  private indexCodebaseTask = createDistributedTask(
    'graphrag.indexCodebase', 
    async (input: { rootPath: string; options?: IndexOptions }, deps?: any) => {
      return await this.indexCodebaseInternal(input.rootPath, input.options);
    },
    { migratable: true }
  );

  private semanticSearchTask = createDistributedTask(
    'graphrag.semanticSearch',
    async (input: { query: string; options?: SearchOptions }, deps?: any) => {
      return await this.performSemanticSearch(input.query, input.options);
    },
    { migratable: true }
  );

  constructor(ragConfig: RAGConfig) {
    this.ragConfig = ragConfig;
  }

  // Main indexing interface
  async indexCodebase(rootPath: string, options?: IndexOptions): Promise<IndexingJob> {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const job: IndexingJob = {
      id: jobId,
      jobType: 'full',
      status: 'pending',
      targetPath: rootPath,
      startedAt: new Date(),
      metadata: { options }
    };

    try {
      job.status = 'running';
      const result = await this.indexCodebaseTask.run({ rootPath, options }, {});
      
      job.status = 'completed';
      job.completedAt = new Date();
      job.metadata.result = result;
    } catch (error) {
      job.status = 'failed';
      job.errorMessage = error instanceof Error ? error.message : String(error);
      job.completedAt = new Date();
    }

    return job;
  }

  async indexFile(filePath: string): Promise<void> {
    await this.indexFileTask.run({ filePath }, {});
  }

  // Semantic search interface
  async searchSimilar(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    return await this.semanticSearchTask.run({ query, options }, {});
  }

  // Internal implementation methods
  private async indexCodebaseInternal(rootPath: string, options?: IndexOptions): Promise<{
    filesProcessed: number;
    entitiesExtracted: number;
    relationshipsCreated: number;
  }> {
    // For now, use a simple implementation without glob dependency
    // In production, add 'glob' to dependencies and uncomment the line below:
    // const glob = (await import('glob')).glob;
    
    // Define file patterns based on languages
    const languages = options?.languages || ['typescript', 'javascript', 'python', 'go', 'rust'];
    const patterns = this.getFilePatterns(languages);
    const excludePatterns = options?.excludePatterns || ['node_modules/**', '*.min.js', 'dist/**', '.git/**'];
    
    let filesProcessed = 0;
    let entitiesExtracted = 0;
    let relationshipsCreated = 0;

    // Simplified file discovery for demo - replace with glob in production
    const { readdir } = await import('fs/promises');
    try {
      const files = await readdir(rootPath);
      const tsFiles = files.filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'));
      
      for (const fileName of tsFiles.slice(0, 5)) { // Limit to 5 files for demo
        const filePath = `${rootPath}/${fileName}`;
        try {
          const result = await this.indexSingleFile(filePath, options);
          filesProcessed++;
          entitiesExtracted += result.entitiesExtracted;
          relationshipsCreated += result.relationshipsCreated;
        } catch (error) {
          console.warn(`Failed to index file ${filePath}:`, error);
        }
      }
    } catch (error) {
      console.warn(`Failed to read directory ${rootPath}:`, error);
    }

    return { filesProcessed, entitiesExtracted, relationshipsCreated };
  }

  private async indexSingleFile(filePath: string, options?: IndexOptions): Promise<{
    entitiesExtracted: number;
    relationshipsCreated: number;
  }> {
    const { readFile, stat } = await import('fs/promises');
    
    // Read file content and metadata
    const content = await readFile(filePath, 'utf-8');
    const stats = await stat(filePath);
    const hash = this.calculateHash(content);

    // Check if file has changed
    const existingFile = this.files.get(filePath);
    if (existingFile && existingFile.hash === hash) {
      return { entitiesExtracted: 0, relationshipsCreated: 0 };
    }

    // Extract code entities using the RAG loader
    const documents = await this.ragConfig.loader.load(filePath);
    const chunks = await this.ragConfig.splitter.splitDocuments(documents);

    // Generate embeddings
    const texts = chunks.map(c => c.content);
    const embeddings = await this.ragConfig.embeddings.generateEmbeddings(texts);

    // Store entities and relationships
    const entities: CodeEntity[] = [];
    const relationships: CodeRelationship[] = [];

    chunks.forEach((chunk, index) => {
      if (chunk.metadata.entityType && chunk.metadata.entityType !== 'file') {
        const entity: CodeEntity = {
          id: chunk.id,
          filePath,
          entityType: chunk.metadata.entityType,
          name: chunk.metadata.entityName || chunk.metadata.name || `entity_${index}`,
          signature: chunk.metadata.signature,
          content: chunk.content,
          startLine: chunk.metadata.startLine || 1,
          endLine: chunk.metadata.endLine || content.split('\n').length,
          embedding: embeddings[index],
          hash: this.calculateHash(chunk.content),
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        entities.push(entity);
        this.entities.set(entity.id, entity);
      }
    });

    // Extract relationships (simplified)
    const extractedRelationships = this.extractRelationships(entities, content);
    extractedRelationships.forEach(rel => {
      this.relationships.set(rel.id, rel);
      relationships.push(rel);
    });

    // Update file metadata
    const fileMetadata: FileMetadata = {
      id: filePath,
      filePath,
      language: this.detectLanguage(filePath),
      sizeBytes: stats.size,
      lineCount: content.split('\n').length,
      hash,
      lastModified: stats.mtime,
      indexedAt: new Date()
    };
    
    this.files.set(filePath, fileMetadata);

    // Store in vector database
    await this.ragConfig.vectorStore.addDocuments(chunks.map((chunk, i) => ({
      ...chunk,
      embedding: embeddings[i]
    })));

    return {
      entitiesExtracted: entities.length,
      relationshipsCreated: relationships.length
    };
  }

  private async performSemanticSearch(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const results = await this.ragConfig.vectorStore.similaritySearch(
      query,
      options?.limit || 10
    );

    // Filter by threshold
    const threshold = options?.threshold || 0.7;
    return results.filter(r => r.similarity >= threshold);
  }

  // Utility methods
  private getFilePatterns(languages: string[]): string[] {
    const patterns: string[] = [];
    
    for (const lang of languages) {
      switch (lang) {
        case 'typescript':
          patterns.push('**/*.ts', '**/*.tsx');
          break;
        case 'javascript':
          patterns.push('**/*.js', '**/*.jsx');
          break;
        case 'python':
          patterns.push('**/*.py');
          break;
        case 'go':
          patterns.push('**/*.go');
          break;
        case 'rust':
          patterns.push('**/*.rs');
          break;
        case 'java':
          patterns.push('**/*.java');
          break;
        case 'cpp':
          patterns.push('**/*.cpp', '**/*.cc', '**/*.cxx', '**/*.h', '**/*.hpp');
          break;
      }
    }
    
    return patterns;
  }

  private detectLanguage(filePath: string): string {
    const ext = filePath.substring(filePath.lastIndexOf('.'));
    
    switch (ext) {
      case '.ts':
      case '.tsx':
        return 'typescript';
      case '.js':
      case '.jsx':
        return 'javascript';
      case '.py':
        return 'python';
      case '.go':
        return 'go';
      case '.rs':
        return 'rust';
      case '.java':
        return 'java';
      case '.cpp':
      case '.cc':
      case '.cxx':
      case '.h':
      case '.hpp':
        return 'cpp';
      default:
        return 'unknown';
    }
  }

  private calculateHash(content: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private extractRelationships(entities: CodeEntity[], fileContent: string): CodeRelationship[] {
    const relationships: CodeRelationship[] = [];
    
    // Simple relationship extraction - in a real implementation, use AST parsing
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const source = entities[i];
        const target = entities[j];
        
        // Check if source calls target
        if (source.content.includes(target.name)) {
          relationships.push({
            id: `${source.id}_calls_${target.id}`,
            sourceId: source.id,
            targetId: target.id,
            relationshipType: 'calls',
            weight: 1.0,
            createdAt: new Date()
          });
        }
      }
    }
    
    return relationships;
  }

  // Query methods
  async searchByType(entityType: string, query?: string): Promise<CodeEntity[]> {
    const entities = Array.from(this.entities.values())
      .filter(e => e.entityType === entityType);
    
    if (query) {
      // Filter by query match
      return entities.filter(e => 
        e.name.toLowerCase().includes(query.toLowerCase()) ||
        e.content.toLowerCase().includes(query.toLowerCase())
      );
    }
    
    return entities;
  }

  async findRelated(entityId: string, relationshipTypes?: string[]): Promise<CodeEntity[]> {
    const relationships = Array.from(this.relationships.values())
      .filter(r => r.sourceId === entityId || r.targetId === entityId);
    
    if (relationshipTypes) {
      relationships.filter(r => relationshipTypes.includes(r.relationshipType));
    }
    
    const relatedIds = relationships.map(r => 
      r.sourceId === entityId ? r.targetId : r.sourceId
    );
    
    return relatedIds.map(id => this.entities.get(id)).filter(Boolean) as CodeEntity[];
  }

  async getFileContext(filePath: string): Promise<{
    file: FileMetadata;
    entities: CodeEntity[];
    relationships: CodeRelationship[];
  }> {
    const file = this.files.get(filePath);
    if (!file) {
      throw new Error(`File not found: ${filePath}`);
    }
    
    const entities = Array.from(this.entities.values())
      .filter(e => e.filePath === filePath);
    
    const entityIds = new Set(entities.map(e => e.id));
    const relationships = Array.from(this.relationships.values())
      .filter(r => entityIds.has(r.sourceId) || entityIds.has(r.targetId));
    
    return { file, entities, relationships };
  }
}

// BlueLibs resource for GraphRAG engine
export const graphragEngine = resource({
  id: 'graphrag.engine',
  dependencies: {},
  init: async () => {
    // This would be configured based on the config.json settings
    throw new Error('GraphRAG engine initialization not implemented. Use GraphRAGEngine class directly.');
  }
});