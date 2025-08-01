/**
 * Base RAG Tool Architecture
 * 
 * Pluggable architecture for different RAG implementations
 */

import { StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

// Base interfaces for pluggable components
export interface DocumentLoader {
  load(source: string): Promise<Document[]>;
  canHandle(source: string): boolean;
}

export interface TextSplitter {
  splitDocuments(docs: Document[]): Promise<DocumentChunk[]>;
}

export interface EmbeddingProvider {
  generateEmbeddings(texts: string[]): Promise<number[][]>;
  getDimensions(): number;
}

export interface VectorStore {
  addDocuments(chunks: DocumentChunk[]): Promise<void>;
  similaritySearch(query: string, k?: number): Promise<SearchResult[]>;
  delete?(ids: string[]): Promise<void>;
}

export interface LLMProvider {
  generate(prompt: string, context: string[]): Promise<string>;
}

// Core data structures
export interface Document {
  id: string;
  content: string;
  metadata: Record<string, any>;
  source: string;
}

export interface DocumentChunk extends Document {
  chunkIndex: number;
  embedding?: number[];
}

export interface SearchResult {
  chunk: DocumentChunk;
  similarity: number;
}

export interface RAGConfig {
  loader: DocumentLoader;
  splitter: TextSplitter;
  embeddings: EmbeddingProvider;
  vectorStore: VectorStore;
  llm: LLMProvider;
  chunkSize?: number;
  chunkOverlap?: number;
  searchLimit?: number;
  similarityThreshold?: number;
}

// Base RAG Tool
export abstract class BaseRAGTool extends StructuredTool {
  name = 'rag_tool';
  description = 'Retrieval Augmented Generation tool for querying documents';
  schema = z.object({
    query: z.string().describe('The query to search for'),
    sources: z.array(z.string()).optional().describe('Specific sources to search in'),
    limit: z.number().optional().describe('Maximum number of results to return')
  });

  protected config: RAGConfig;
  private initialized = false;

  constructor(config: RAGConfig) {
    super();
    this.config = config;
  }

  async _call(input: { query: string; sources?: string[]; limit?: number }): Promise<string> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Perform similarity search
      const searchResults = await this.config.vectorStore.similaritySearch(
        input.query,
        input.limit || this.config.searchLimit || 5
      );

      // Filter by similarity threshold
      const threshold = this.config.similarityThreshold || 0.7;
      const relevantResults = searchResults.filter(r => r.similarity >= threshold);

      if (relevantResults.length === 0) {
        return "No relevant information found for your query.";
      }

      // Extract context from relevant chunks
      const context = relevantResults.map(r => r.chunk.content);

      // Generate response using LLM
      const response = await this.config.llm.generate(input.query, context);

      return response;
    } catch (error) {
      console.error('RAG Tool error:', error);
      throw error;
    }
  }

  protected async initialize(): Promise<void> {
    // Override in subclasses for specific initialization
    this.initialized = true;
  }

  // Methods for managing the RAG system
  async addDocuments(sources: string[]): Promise<void> {
    const allChunks: DocumentChunk[] = [];

    for (const source of sources) {
      if (!this.config.loader.canHandle(source)) {
        console.warn(`Loader cannot handle source: ${source}`);
        continue;
      }

      // Load documents
      const docs = await this.config.loader.load(source);

      // Split into chunks
      const chunks = await this.config.splitter.splitDocuments(docs);

      // Generate embeddings
      const texts = chunks.map(c => c.content);
      const embeddings = await this.config.embeddings.generateEmbeddings(texts);

      // Add embeddings to chunks
      const embeddedChunks = chunks.map((chunk, i) => ({
        ...chunk,
        embedding: embeddings[i]
      }));

      allChunks.push(...embeddedChunks);
    }

    // Store in vector database
    await this.config.vectorStore.addDocuments(allChunks);
  }

  async removeDocuments(sources: string[]): Promise<void> {
    if (this.config.vectorStore.delete) {
      // Implementation depends on how IDs are tracked
      // This is a simplified version
      console.warn('Document removal not fully implemented');
    }
  }
}

// Registry for RAG tool providers
export class RAGToolRegistry {
  private static loaders = new Map<string, () => DocumentLoader>();
  private static splitters = new Map<string, () => TextSplitter>();
  private static embeddings = new Map<string, () => EmbeddingProvider>();
  private static vectorStores = new Map<string, () => VectorStore>();
  private static llms = new Map<string, () => LLMProvider>();

  static registerLoader(name: string, factory: () => DocumentLoader): void {
    this.loaders.set(name, factory);
  }

  static registerSplitter(name: string, factory: () => TextSplitter): void {
    this.splitters.set(name, factory);
  }

  static registerEmbedding(name: string, factory: () => EmbeddingProvider): void {
    this.embeddings.set(name, factory);
  }

  static registerVectorStore(name: string, factory: () => VectorStore): void {
    this.vectorStores.set(name, factory);
  }

  static registerLLM(name: string, factory: () => LLMProvider): void {
    this.llms.set(name, factory);
  }

  static createLoader(name: string): DocumentLoader {
    const factory = this.loaders.get(name);
    if (!factory) throw new Error(`Unknown loader: ${name}`);
    return factory();
  }

  static createSplitter(name: string): TextSplitter {
    const factory = this.splitters.get(name);
    if (!factory) throw new Error(`Unknown splitter: ${name}`);
    return factory();
  }

  static createEmbedding(name: string): EmbeddingProvider {
    const factory = this.embeddings.get(name);
    if (!factory) throw new Error(`Unknown embedding provider: ${name}`);
    return factory();
  }

  static createVectorStore(name: string): VectorStore {
    const factory = this.vectorStores.get(name);
    if (!factory) throw new Error(`Unknown vector store: ${name}`);
    return factory();
  }

  static createLLM(name: string): LLMProvider {
    const factory = this.llms.get(name);
    if (!factory) throw new Error(`Unknown LLM provider: ${name}`);
    return factory();
  }

  static getAvailableProviders(): {
    loaders: string[];
    splitters: string[];
    embeddings: string[];
    vectorStores: string[];
    llms: string[];
  } {
    return {
      loaders: Array.from(this.loaders.keys()),
      splitters: Array.from(this.splitters.keys()),
      embeddings: Array.from(this.embeddings.keys()),
      vectorStores: Array.from(this.vectorStores.keys()),
      llms: Array.from(this.llms.keys())
    };
  }
}