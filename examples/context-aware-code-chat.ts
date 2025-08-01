#!/usr/bin/env node
/**
 * Context-Aware Code Chat System
 * 
 * Real-world example: AI assistant that understands your codebase and can:
 * - Answer questions about code architecture and patterns
 * - Suggest improvements and refactoring
 * - Help with debugging and implementation
 * - Generate code that follows project conventions
 * - Explain complex code relationships
 * 
 * This system indexes the codebase using GraphRAG and provides intelligent responses.
 */

import { GraphRAGEngine } from '../src/graphrag/core.js';
import { createCodeRAGTool } from '../src/rag/enhanced-rag-tool.js';
import { createDistributedTask } from '../src/distributed_integration.js';
import openAgent from '../src/api.js';
import { readFile, writeFile, readdir } from 'fs/promises';
import { join, relative, extname } from 'path';
import * as readline from 'readline';

interface CodeContext {
  currentFile?: string;
  workingDirectory: string;
  recentFiles: string[];
  activeDiscussion: {
    topic: string;
    relatedFiles: string[];
    keyEntities: string[];
  };
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  context?: {
    files: string[];
    entities: string[];
    searchResults: any[];
  };
}

interface CodebaseKnowledge {
  architecture: {
    mainPatterns: string[];
    frameworks: string[];
    conventions: {
      naming: string;
      structure: string;
      testing: string;
    };
  };
  hotspots: {
    file: string;
    reason: string;
    complexity: number;
  }[];
  relationships: {
    source: string;
    target: string;
    type: 'imports' | 'calls' | 'extends' | 'implements';
  }[];
}

class ContextualCodeAssistant {
  private graphrag: GraphRAGEngine;
  private codebaseKnowledge: CodebaseKnowledge | null = null;
  private chatHistory: ChatMessage[] = [];
  private context: CodeContext;
  
  constructor(private rootPath: string) {
    // Initialize with code-optimized RAG configuration
    const ragConfig = {
      loader: createCodeRAGTool({
        sources: [rootPath],
        options: {
          includeExtensions: ['.ts', '.js', '.tsx', '.jsx', '.py', '.go', '.rs', '.java'],
          excludePaths: ['node_modules', '.git', 'dist', 'build'],
          parseEntities: true
        }
      }).loader,
      splitter: {
        splitDocuments: async (docs: any[]) => {
          // Code-aware splitting that preserves function/class boundaries
          const chunks = [];
          for (const doc of docs) {
            if (doc.metadata.entityType && doc.metadata.entityType !== 'file') {
              // Individual entities (functions, classes) are already good chunks
              chunks.push(doc);
            } else {
              // Split large files into logical chunks
              const content = doc.content;
              const lines = content.split('\n');
              let currentChunk = '';
              let startLine = 1;
              
              for (let i = 0; i < lines.length; i++) {
                currentChunk += lines[i] + '\n';
                
                // Split on function/class boundaries or every 50 lines
                if (i > 0 && (i % 50 === 0 || /^(export\s+)?(class|function|interface|type)\s/.test(lines[i + 1] || ''))) {
                  chunks.push({
                    ...doc,
                    id: `${doc.id}#${startLine}-${i + 1}`,
                    content: currentChunk,
                    metadata: {
                      ...doc.metadata,
                      startLine,
                      endLine: i + 1,
                      chunkType: 'logical'
                    }
                  });
                  currentChunk = '';
                  startLine = i + 2;
                }
              }
              
              if (currentChunk.trim()) {
                chunks.push({
                  ...doc,
                  id: `${doc.id}#${startLine}-${lines.length}`,
                  content: currentChunk,
                  metadata: {
                    ...doc.metadata,
                    startLine,
                    endLine: lines.length,
                    chunkType: 'logical'
                  }
                });
              }
            }
          }
          return chunks;
        }
      },
      embeddings: {
        generateEmbeddings: async (texts: string[]) => {
          // In production, use OpenAI or other embedding service
          // For demo, return mock embeddings
          return texts.map(() => Array.from({length: 1536}, () => Math.random()));
        }
      },
      vectorStore: {
        addDocuments: async (docs: any[]) => {
          console.log(`Indexed ${docs.length} code chunks`);
        },
        similaritySearch: async (query: string, limit: number = 10) => {
          // Mock semantic search - in production, use real vector database
          return Array.from({length: Math.min(limit, 5)}, (_, i) => ({
            id: `mock_${i}`,
            content: `Mock search result ${i + 1} for query: ${query}`,
            similarity: 0.9 - (i * 0.1),
            metadata: { file: `src/example${i + 1}.ts`, entityType: 'function' }
          }));
        }
      },
      llm: {
        generate: async (prompt: any) => {
          // Integration with actual LLM would go here
          return this.generateMockResponse(prompt);
        }
      }
    };
    
    this.graphrag = new GraphRAGEngine(ragConfig);
    this.context = {
      workingDirectory: rootPath,
      recentFiles: [],
      activeDiscussion: {
        topic: '',
        relatedFiles: [],
        keyEntities: []
      }
    };
  }
  
  // Initialize the assistant by indexing the codebase
  async initialize(): Promise<void> {
    console.log('🔍 Indexing codebase...');
    
    // Index the entire codebase
    const indexJob = await this.graphrag.indexCodebase(this.rootPath, {
      languages: ['typescript', 'javascript', 'python', 'go', 'rust', 'java'],
      excludePatterns: ['node_modules/**', '.git/**', 'dist/**', 'build/**'],
      parallelism: 4
    });
    
    console.log(`✅ Indexing completed: ${indexJob.status}`);
    
    // Build architectural understanding
    await this.analyzeArchitecture();
    
    console.log('🧠 Ready to assist with your codebase!');
  }
  
  // Analyze codebase architecture and patterns
  private async analyzeArchitecture(): Promise<void> {
    try {
      // Discover main patterns and frameworks
      const packageJsonPath = join(this.rootPath, 'package.json');
      let frameworks: string[] = [];
      let conventions = {
        naming: 'camelCase',
        structure: 'feature-based',
        testing: 'unknown'
      };
      
      try {
        const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'));
        const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
        
        frameworks = Object.keys(deps).filter(dep => 
          ['react', 'vue', 'angular', 'express', 'fastify', 'nestjs', 'next'].some(framework => 
            dep.includes(framework)
          )
        );
        
        if (deps['jest'] || deps['vitest']) conventions.testing = 'jest/vitest';
        if (deps['mocha']) conventions.testing = 'mocha';
        if (deps['cypress'] || deps['playwright']) conventions.testing += ' + e2e';
        
      } catch (e) {
        // No package.json or failed to parse
      }
      
      // Analyze file structure patterns
      const files = await this.discoverFiles();
      const mainPatterns = this.detectPatterns(files);
      
      // Find complexity hotspots
      const hotspots = await this.findComplexityHotspots(files);
      
      this.codebaseKnowledge = {
        architecture: {
          mainPatterns,
          frameworks,
          conventions
        },
        hotspots,
        relationships: [] // Would be populated by actual relationship analysis
      };
      
    } catch (error) {
      console.warn('Failed to analyze architecture:', error);
    }
  }
  
  private async discoverFiles(): Promise<string[]> {
    const files: string[] = [];
    
    const scanDir = async (dir: string): Promise<void> => {
      try {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          if (entry.isDirectory() && !['node_modules', '.git', 'dist'].includes(entry.name)) {
            await scanDir(fullPath);
          } else if (entry.isFile() && ['.ts', '.js', '.tsx', '.jsx', '.py'].includes(extname(entry.name))) {
            files.push(fullPath);
          }
        }
      } catch (error) {
        // Skip directories we can't read
      }
    };
    
    await scanDir(this.rootPath);
    return files;
  }
  
  private detectPatterns(files: string[]): string[] {
    const patterns: string[] = [];
    
    // Detect common architectural patterns
    if (files.some(f => f.includes('/controllers/') || f.includes('/api/'))) {
      patterns.push('MVC/API Architecture');
    }
    if (files.some(f => f.includes('/components/') && f.includes('/hooks/'))) {
      patterns.push('React Component Architecture');
    }
    if (files.some(f => f.includes('/services/') && f.includes('/models/'))) {
      patterns.push('Service Layer Pattern');
    }
    if (files.some(f => f.includes('/utils/') || f.includes('/helpers/'))) {
      patterns.push('Utility/Helper Pattern');
    }
    if (files.some(f => f.includes('.test.') || f.includes('.spec.'))) {
      patterns.push('Test-Driven Development');
    }
    
    return patterns;
  }
  
  private async findComplexityHotspots(files: string[]): Promise<Array<{file: string, reason: string, complexity: number}>> {
    const hotspots = [];
    
    for (const file of files.slice(0, 20)) { // Analyze first 20 files for demo
      try {
        const content = await readFile(file, 'utf-8');
        const lines = content.split('\n');
        
        // Simple complexity analysis
        let complexity = 1;
        let longFunctions = 0;
        
        for (const line of lines) {
          if (/\b(if|while|for|switch|catch)\b/.test(line)) complexity++;
          if (/function.*{[\s\S]{200,}/.test(line)) longFunctions++;
        }
        
        if (complexity > 20 || lines.length > 500 || longFunctions > 0) {
          hotspots.push({
            file: relative(this.rootPath, file),
            reason: `High complexity (${complexity}) or large file (${lines.length} lines)`,
            complexity
          });
        }
      } catch (error) {
        // Skip files we can't read
      }
    }
    
    return hotspots.sort((a, b) => b.complexity - a.complexity);
  }
  
  // Main chat interface
  async chat(userMessage: string): Promise<string> {
    console.log(`\n👤 ${userMessage}`);
    
    // Update context based on user message
    await this.updateContext(userMessage);
    
    // Perform semantic search for relevant code
    const searchResults = await this.searchRelevantCode(userMessage);
    
    // Generate contextual response
    const response = await this.generateResponse(userMessage, searchResults);
    
    // Save to chat history
    this.chatHistory.push(
      { role: 'user', content: userMessage, timestamp: new Date() },
      { 
        role: 'assistant', 
        content: response, 
        timestamp: new Date(),
        context: {
          files: searchResults.map(r => r.metadata?.file || 'unknown'),
          entities: searchResults.map(r => r.metadata?.entityType || 'unknown'),
          searchResults
        }
      }
    );
    
    console.log(`\n🤖 ${response}`);
    return response;
  }
  
  private async updateContext(userMessage: string): Promise<void> {
    // Extract file mentions
    const fileMatches = userMessage.match(/[\w\/.-]+\.(ts|js|tsx|jsx|py|go|rs|java)/g);
    if (fileMatches) {
      this.context.recentFiles = [...new Set([...fileMatches, ...this.context.recentFiles])].slice(0, 10);
    }
    
    // Update discussion topic
    if (userMessage.toLowerCase().includes('refactor')) {
      this.context.activeDiscussion.topic = 'refactoring';
    } else if (userMessage.toLowerCase().includes('bug') || userMessage.toLowerCase().includes('error')) {
      this.context.activeDiscussion.topic = 'debugging';
    } else if (userMessage.toLowerCase().includes('implement') || userMessage.toLowerCase().includes('create')) {
      this.context.activeDiscussion.topic = 'implementation';
    } else if (userMessage.toLowerCase().includes('architecture') || userMessage.toLowerCase().includes('design')) {
      this.context.activeDiscussion.topic = 'architecture';
    }
  }
  
  private async searchRelevantCode(query: string): Promise<any[]> {
    // Use GraphRAG for semantic search
    const results = await this.graphrag.searchSimilar(query, {
      limit: 15,
      threshold: 0.7,
      includeContent: true
    });
    
    // Also search by entity type if query suggests it
    let typeResults: any[] = [];
    if (query.toLowerCase().includes('function')) {
      typeResults = await this.graphrag.searchByType('function', query);
    } else if (query.toLowerCase().includes('class')) {
      typeResults = await this.graphrag.searchByType('class', query);
    } else if (query.toLowerCase().includes('interface')) {
      typeResults = await this.graphrag.searchByType('interface', query);
    }
    
    // Combine and deduplicate results
    const allResults = [...results, ...typeResults];
    const unique = allResults.filter((result, index, self) => 
      index === self.findIndex(r => r.id === result.id)
    );
    
    return unique.slice(0, 10);
  }
  
  private async generateResponse(userMessage: string, searchResults: any[]): Promise<string> {
    const contextInfo = this.buildContextInfo(searchResults);
    
    // Generate different types of responses based on the query
    if (userMessage.toLowerCase().includes('how') && userMessage.toLowerCase().includes('work')) {
      return this.explainCodeWorking(searchResults, userMessage);
    } else if (userMessage.toLowerCase().includes('refactor') || userMessage.toLowerCase().includes('improve')) {
      return this.suggestRefactoring(searchResults, userMessage);
    } else if (userMessage.toLowerCase().includes('bug') || userMessage.toLowerCase().includes('error')) {
      return this.helpDebug(searchResults, userMessage);
    } else if (userMessage.toLowerCase().includes('implement') || userMessage.toLowerCase().includes('create')) {
      return this.helpImplement(searchResults, userMessage);
    } else if (userMessage.toLowerCase().includes('architecture') || userMessage.toLowerCase().includes('overview')) {
      return this.explainArchitecture(userMessage);
    } else {
      return this.provideGeneralAssistance(searchResults, userMessage);
    }
  }
  
  private buildContextInfo(searchResults: any[]): string {
    const files = [...new Set(searchResults.map(r => r.metadata?.file).filter(Boolean))];
    const entities = searchResults.filter(r => r.metadata?.entityType && r.metadata?.entityType !== 'file');
    
    return `
Context from codebase:
- ${files.length} relevant files found
- ${entities.length} relevant code entities
- Current patterns: ${this.codebaseKnowledge?.architecture.mainPatterns.join(', ') || 'unknown'}
- Frameworks: ${this.codebaseKnowledge?.architecture.frameworks.join(', ') || 'none detected'}
`;
  }
  
  private explainCodeWorking(searchResults: any[], query: string): string {
    const relevantCode = searchResults.slice(0, 3);
    
    let explanation = "Based on your codebase, here's how this works:\n\n";
    
    for (const result of relevantCode) {
      explanation += `**${result.metadata?.file || 'File'}**:\n`;
      explanation += `${result.content.substring(0, 200)}...\n\n`;
      
      if (result.metadata?.entityType === 'function') {
        explanation += "This function handles the core logic by:\n";
        explanation += "1. Processing the input parameters\n";
        explanation += "2. Applying business logic based on your patterns\n";
        explanation += "3. Returning the result\n\n";
      } else if (result.metadata?.entityType === 'class') {
        explanation += "This class encapsulates:\n";
        explanation += "1. State management and data handling\n";
        explanation += "2. Methods for core operations\n";
        explanation += "3. Integration with other system components\n\n";
      }
    }
    
    explanation += `**Architecture Context**: Your codebase follows ${this.codebaseKnowledge?.architecture.mainPatterns.join(' and ') || 'standard'} patterns, which means this code integrates with the overall system through well-defined interfaces and follows established conventions.`;
    
    return explanation;
  }
  
  private suggestRefactoring(searchResults: any[], query: string): string {
    const complexFiles = this.codebaseKnowledge?.hotspots.slice(0, 3) || [];
    
    let suggestions = "Here are refactoring suggestions based on your codebase analysis:\n\n";
    
    suggestions += "**Priority Areas**:\n";
    for (const hotspot of complexFiles) {
      suggestions += `1. **${hotspot.file}**: ${hotspot.reason}\n`;
      suggestions += `   - Extract smaller functions to reduce complexity\n`;
      suggestions += `   - Consider splitting into multiple modules\n`;
      suggestions += `   - Add comprehensive tests before refactoring\n\n`;
    }
    
    suggestions += "**Code Improvements**:\n";
    for (const result of searchResults.slice(0, 2)) {
      suggestions += `- **${result.metadata?.file}**: Consider applying the ${this.codebaseKnowledge?.architecture.conventions.naming} naming convention and following your established patterns\n`;
    }
    
    suggestions += "\n**Recommended Steps**:\n";
    suggestions += "1. Write comprehensive tests for the target areas\n";
    suggestions += "2. Extract utility functions first\n";
    suggestions += "3. Apply consistent patterns used elsewhere in your codebase\n";
    suggestions += "4. Verify all tests pass after each refactoring step\n";
    
    return suggestions;
  }
  
  private helpDebug(searchResults: any[], query: string): string {
    let debugging = "Let me help debug this issue. Based on your codebase:\n\n";
    
    debugging += "**Common Issues in Your Architecture**:\n";
    debugging += `- Check error handling patterns (your codebase uses ${this.codebaseKnowledge?.architecture.conventions.testing} for testing)\n`;
    debugging += "- Verify async/await usage in promise chains\n";
    debugging += "- Look for null/undefined reference issues\n\n";
    
    debugging += "**Relevant Code Sections**:\n";
    for (const result of searchResults.slice(0, 3)) {
      debugging += `**${result.metadata?.file}**:\n`;
      debugging += `${result.content.substring(0, 150)}...\n`;
      debugging += "Check this section for:\n";
      debugging += "- Input validation\n";
      debugging += "- Error boundaries\n";
      debugging += "- Type consistency\n\n";
    }
    
    debugging += "**Debugging Strategy**:\n";
    debugging += "1. Add logging at key points to trace execution\n";
    debugging += "2. Use your established error handling patterns\n";
    debugging += "3. Write a failing test case to reproduce the issue\n";
    debugging += "4. Use debugger or console.log to inspect state\n";
    
    return debugging;
  }
  
  private helpImplement(searchResults: any[], query: string): string {
    let implementation = "Here's how to implement this following your codebase patterns:\n\n";
    
    implementation += "**Code Structure**:\n";
    implementation += `Following your ${this.codebaseKnowledge?.architecture.mainPatterns.join(' and ') || 'standard'} architecture:\n\n`;
    
    // Generate example code based on patterns
    implementation += "```typescript\n";
    if (this.codebaseKnowledge?.architecture.frameworks.includes('react')) {
      implementation += "// Following your React patterns\n";
      implementation += "import React from 'react';\n";
      implementation += "import { useEffect, useState } from 'react';\n\n";
      implementation += "export const NewComponent: React.FC<Props> = ({ ...props }) => {\n";
      implementation += "  // Implementation following your component patterns\n";
      implementation += "};\n";
    } else {
      implementation += "// Following your application patterns\n";
      implementation += "export class NewFeature {\n";
      implementation += "  constructor(private dependencies: Dependencies) {}\n\n";
      implementation += "  public async execute(): Promise<Result> {\n";
      implementation += "    // Implementation following your service patterns\n";
      implementation += "  }\n";
      implementation += "}\n";
    }
    implementation += "```\n\n";
    
    implementation += "**Integration Points**:\n";
    for (const result of searchResults.slice(0, 2)) {
      implementation += `- Connect with **${result.metadata?.file}** for similar functionality\n`;
    }
    
    implementation += "\n**Testing Strategy**:\n";
    implementation += `- Use ${this.codebaseKnowledge?.architecture.conventions.testing} following your existing test patterns\n`;
    implementation += "- Write unit tests for core logic\n";
    implementation += "- Add integration tests for external dependencies\n";
    
    return implementation;
  }
  
  private explainArchitecture(query: string): string {
    if (!this.codebaseKnowledge) {
      return "Architecture analysis is still in progress. Please try again in a moment.";
    }
    
    let explanation = "## 🏗️ Codebase Architecture Overview\n\n";
    
    explanation += "**Core Patterns**:\n";
    for (const pattern of this.codebaseKnowledge.architecture.mainPatterns) {
      explanation += `- ${pattern}\n`;
    }
    
    explanation += "\n**Technology Stack**:\n";
    for (const framework of this.codebaseKnowledge.architecture.frameworks) {
      explanation += `- ${framework}\n`;
    }
    
    explanation += "\n**Code Conventions**:\n";
    explanation += `- Naming: ${this.codebaseKnowledge.architecture.conventions.naming}\n`;
    explanation += `- Structure: ${this.codebaseKnowledge.architecture.conventions.structure}\n`;
    explanation += `- Testing: ${this.codebaseKnowledge.architecture.conventions.testing}\n`;
    
    explanation += "\n**Complexity Hotspots**:\n";
    for (const hotspot of this.codebaseKnowledge.hotspots.slice(0, 5)) {
      explanation += `- **${hotspot.file}**: ${hotspot.reason}\n`;
    }
    
    explanation += "\n**Recommendations**:\n";
    explanation += "- Focus refactoring efforts on the complexity hotspots\n";
    explanation += "- Maintain consistency with established patterns\n";
    explanation += "- Consider breaking down large files for better maintainability\n";
    
    return explanation;
  }
  
  private provideGeneralAssistance(searchResults: any[], query: string): string {
    let response = "I found some relevant information in your codebase:\n\n";
    
    for (const result of searchResults.slice(0, 5)) {
      response += `**${result.metadata?.file || 'Code'}** (${result.metadata?.entityType || 'content'}):\n`;
      response += `${result.content.substring(0, 200)}...\n\n`;
    }
    
    response += "**How I can help further**:\n";
    response += "- 'How does [feature] work?' - I'll explain the code flow\n";
    response += "- 'Refactor [file/function]' - I'll suggest improvements\n";
    response += "- 'Debug [issue]' - I'll help troubleshoot\n";
    response += "- 'Implement [feature]' - I'll provide code following your patterns\n";
    response += "- 'Architecture overview' - I'll explain your codebase structure\n";
    
    return response;
  }
  
  private generateMockResponse(prompt: any): string {
    // This would integrate with actual LLM in production
    return "Generated response based on codebase context and patterns.";
  }
  
  // Interactive CLI interface
  async startInteractiveSession(): Promise<void> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    console.log('\n🤖 Context-Aware Code Assistant');
    console.log('Ask me anything about your codebase!');
    console.log('Commands: /exit, /context, /files, /architecture\n');
    
    const askQuestion = () => {
      rl.question('👤 You: ', async (input) => {
        if (input.toLowerCase() === '/exit') {
          console.log('👋 Goodbye!');
          rl.close();
          return;
        }
        
        if (input.toLowerCase() === '/context') {
          console.log('Current context:', JSON.stringify(this.context, null, 2));
          askQuestion();
          return;
        }
        
        if (input.toLowerCase() === '/files') {
          console.log('Recent files:', this.context.recentFiles);
          askQuestion();
          return;
        }
        
        if (input.toLowerCase() === '/architecture') {
          console.log(this.explainArchitecture('architecture'));
          askQuestion();
          return;
        }
        
        try {
          await this.chat(input);
        } catch (error) {
          console.error('❌ Error:', error);
        }
        
        askQuestion();
      });
    };
    
    askQuestion();
  }
  
  // Save chat session for future reference
  async saveChatSession(filename: string): Promise<void> {
    const session = {
      timestamp: new Date().toISOString(),
      codebase: this.rootPath,
      context: this.context,
      knowledge: this.codebaseKnowledge,
      messages: this.chatHistory
    };
    
    await writeFile(filename, JSON.stringify(session, null, 2));
    console.log(`💾 Chat session saved to ${filename}`);
  }
}

// CLI interface
if (process.argv[2] === 'start') {
  const codebasePath = process.argv[3] || process.cwd();
  const assistant = new ContextualCodeAssistant(codebasePath);
  
  console.log('🚀 Initializing Context-Aware Code Assistant...');
  assistant.initialize().then(() => {
    assistant.startInteractiveSession();
  }).catch(error => {
    console.error('❌ Failed to initialize:', error);
    process.exit(1);
  });
}

// Example usage programmatically
export async function createCodeAssistant(codebasePath: string): Promise<ContextualCodeAssistant> {
  const assistant = new ContextualCodeAssistant(codebasePath);
  await assistant.initialize();
  return assistant;
}

// Export for use in other applications
export { ContextualCodeAssistant };