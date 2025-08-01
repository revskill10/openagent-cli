/**
 * Enhanced RAG Tool
 * 
 * A more flexible RAG tool using the pluggable architecture
 */

import { BaseRAGTool, RAGConfig } from './base.js';
import { RAGToolRegistry } from './base.js';

// Register default providers
import { WebDocumentLoader, FileSystemLoader, CodeDocumentLoader } from './providers/loaders.js';
import { CharacterTextSplitter, CodeAwareSplitter, SemanticSplitter } from './providers/splitters.js';
import { OpenAIEmbeddingProvider, MockEmbeddingProvider } from './providers/embeddings.js';
import { InMemoryVectorStore } from './providers/vector-stores.js';
import { OpenAILLMProvider, AnthropicLLMProvider, MockLLMProvider } from './providers/llms.js';

// Register all providers
RAGToolRegistry.registerLoader('web', () => new WebDocumentLoader());
RAGToolRegistry.registerLoader('filesystem', () => new FileSystemLoader());
RAGToolRegistry.registerLoader('code', () => new CodeDocumentLoader());

RAGToolRegistry.registerSplitter('character', () => new CharacterTextSplitter());
RAGToolRegistry.registerSplitter('code-aware', () => new CodeAwareSplitter());
RAGToolRegistry.registerSplitter('semantic', () => new SemanticSplitter());

RAGToolRegistry.registerEmbedding('openai', () => new OpenAIEmbeddingProvider());
RAGToolRegistry.registerEmbedding('mock', () => new MockEmbeddingProvider());

RAGToolRegistry.registerVectorStore('memory', () => new InMemoryVectorStore());

RAGToolRegistry.registerLLM('openai', () => new OpenAILLMProvider());
RAGToolRegistry.registerLLM('anthropic', () => new AnthropicLLMProvider());
RAGToolRegistry.registerLLM('mock', () => new MockLLMProvider());

// Enhanced RAG Tool implementation
export class EnhancedRAGTool extends BaseRAGTool {
  name = 'enhanced_rag';
  description = 'Enhanced RAG tool with pluggable components for different data sources and providers';

  constructor(config: RAGConfig) {
    super(config);
  }

  protected async initialize(): Promise<void> {
    // Any specific initialization logic
    await super.initialize();
  }
}

// Factory function for creating RAG tools with different configurations
export interface RAGToolConfig {
  name?: string;
  description?: string;
  loader: {
    type: string;
    options?: any;
  };
  splitter: {
    type: string;
    options?: any;
  };
  embeddings: {
    type: string;
    options?: any;
  };
  vectorStore: {
    type: string;
    options?: any;
  };
  llm: {
    type: string;
    options?: any;
  };
  searchOptions?: {
    limit?: number;
    threshold?: number;
  };
}

export function createRAGTool(toolConfig: RAGToolConfig): EnhancedRAGTool {
  const config: RAGConfig = {
    loader: RAGToolRegistry.createLoader(toolConfig.loader.type),
    splitter: RAGToolRegistry.createSplitter(toolConfig.splitter.type),
    embeddings: RAGToolRegistry.createEmbedding(toolConfig.embeddings.type),
    vectorStore: RAGToolRegistry.createVectorStore(toolConfig.vectorStore.type),
    llm: RAGToolRegistry.createLLM(toolConfig.llm.type),
    searchLimit: toolConfig.searchOptions?.limit || 5,
    similarityThreshold: toolConfig.searchOptions?.threshold || 0.7
  };

  const tool = new EnhancedRAGTool(config);
  
  if (toolConfig.name) {
    tool.name = toolConfig.name;
  }
  
  if (toolConfig.description) {
    tool.description = toolConfig.description;
  }

  return tool;
}

// Predefined RAG tool configurations
export const RAGToolPresets = {
  // Web documentation RAG
  webDocs: (): RAGToolConfig => ({
    name: 'web_docs_rag',
    description: 'RAG tool for web documentation and articles',
    loader: { type: 'web' },
    splitter: { type: 'character', options: { chunkSize: 1000, chunkOverlap: 200 } },
    embeddings: { type: 'openai' },
    vectorStore: { type: 'memory' },
    llm: { type: 'openai' },
    searchOptions: { limit: 5, threshold: 0.75 }
  }),

  // Code repository RAG
  codeRepo: (): RAGToolConfig => ({
    name: 'code_repo_rag',
    description: 'RAG tool for code repositories and programming documentation',
    loader: { type: 'code' },
    splitter: { type: 'code-aware' },
    embeddings: { type: 'openai' },
    vectorStore: { type: 'memory' },
    llm: { type: 'openai' },
    searchOptions: { limit: 8, threshold: 0.7 }
  }),

  // Local files RAG
  localFiles: (): RAGToolConfig => ({
    name: 'local_files_rag', 
    description: 'RAG tool for local files and documents',
    loader: { type: 'filesystem' },
    splitter: { type: 'semantic' },
    embeddings: { type: 'openai' },
    vectorStore: { type: 'memory' },
    llm: { type: 'openai' },
    searchOptions: { limit: 6, threshold: 0.8 }
  }),

  // Mock/testing RAG
  mock: (): RAGToolConfig => ({
    name: 'mock_rag',
    description: 'Mock RAG tool for testing without external API calls',
    loader: { type: 'filesystem' },
    splitter: { type: 'character' },
    embeddings: { type: 'mock' },
    vectorStore: { type: 'memory' },
    llm: { type: 'mock' },
    searchOptions: { limit: 3, threshold: 0.5 }
  }),

  // Anthropic-powered RAG
  anthropic: (): RAGToolConfig => ({
    name: 'anthropic_rag',
    description: 'RAG tool powered by Anthropic Claude',
    loader: { type: 'web' },
    splitter: { type: 'character' },
    embeddings: { type: 'openai' }, // Still use OpenAI for embeddings
    vectorStore: { type: 'memory' },
    llm: { type: 'anthropic' },
    searchOptions: { limit: 5, threshold: 0.75 }
  })
};

// Helper function to create common RAG tools
export const createWebRAGTool = (url?: string) => {
  const tool = createRAGTool(RAGToolPresets.webDocs());
  if (url) {
    // Pre-populate with the URL
    tool.addDocuments([url]).catch(console.error);
  }
  return tool;
};

export const createCodeRAGTool = (repoPath?: string) => {
  const tool = createRAGTool(RAGToolPresets.codeRepo());
  if (repoPath) {
    // Pre-populate with the repository
    tool.addDocuments([`${repoPath}/**/*.ts`, `${repoPath}/**/*.js`]).catch(console.error);
  }
  return tool;
};

export const createLocalRAGTool = (docPath?: string) => {
  const tool = createRAGTool(RAGToolPresets.localFiles());
  if (docPath) {
    // Pre-populate with local documents
    tool.addDocuments([docPath]).catch(console.error);
  }
  return tool;
};

export const createMockRAGTool = () => {
  return createRAGTool(RAGToolPresets.mock());
};