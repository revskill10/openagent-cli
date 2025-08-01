#!/usr/bin/env node
/**
 * Code Chat Example
 * 
 * Real-world usage: Interactive AI assistant for codebase understanding
 * - Answers questions about code architecture
 * - Provides refactoring suggestions  
 * - Helps with debugging
 * - Explains code patterns
 */

import { GraphRAGEngine } from '../src/graphrag/core.js';
import { createCodeRAGTool } from '../src/rag/enhanced-rag-tool.js';
import { readFile } from 'fs/promises';
import * as readline from 'readline';

interface ChatContext {
  currentFile?: string;
  recentQuestions: string[];
  codebaseInsights: {
    mainPatterns: string[];
    complexity: 'low' | 'medium' | 'high';
    primaryLanguage: string;
  };
}

export class CodeAssistant {
  private graphrag: GraphRAGEngine;
  private context: ChatContext;
  private initialized = false;
  
  constructor(private codebasePath: string) {
    // Initialize with simplified RAG configuration
    const ragConfig = {
      loader: {
        load: async (source: string) => {
          // Simplified loader for demo
          try {
            const content = await readFile(source, 'utf-8');
            return [{
              id: source,
              content,
              metadata: { sourceType: 'file', filePath: source },
              source
            }];
          } catch {
            return [];
          }
        }
      },
      splitter: {
        splitDocuments: async (docs: any[]) => {
          // Simple splitting by functions/classes
          const chunks = [];
          for (const doc of docs) {
            const lines = doc.content.split('\n');
            let currentChunk = '';
            let startLine = 1;
            
            for (let i = 0; i < lines.length; i++) {
              currentChunk += lines[i] + '\n';
              
              // Split on function/class boundaries
              if (i > 0 && /^(export\s+)?(class|function|interface)\s/.test(lines[i + 1] || '')) {
                chunks.push({
                  ...doc,
                  id: `${doc.id}#${startLine}-${i + 1}`,
                  content: currentChunk.trim(),
                  metadata: { ...doc.metadata, startLine, endLine: i + 1 }
                });
                currentChunk = '';
                startLine = i + 2;
              }
            }
            
            if (currentChunk.trim()) {
              chunks.push({
                ...doc,
                id: `${doc.id}#${startLine}-${lines.length}`,
                content: currentChunk.trim(),
                metadata: { ...doc.metadata, startLine, endLine: lines.length }
              });
            }
          }
          return chunks;
        }
      },
      embeddings: {
        generateEmbeddings: async (texts: string[]) => {
          // Mock embeddings for demo
          return texts.map(() => Array.from({length: 384}, () => Math.random()));
        }
      },
      vectorStore: {
        addDocuments: async (docs: any[]) => {
          console.log(`Indexed ${docs.length} code chunks`);
        },
        similaritySearch: async (query: string, limit: number = 5) => {
          // Mock search results
          return Array.from({length: Math.min(limit, 3)}, (_, i) => ({
            id: `result_${i}`,
            content: `Code snippet ${i + 1} related to: ${query}`,
            similarity: 0.9 - (i * 0.1),
            metadata: { 
              filePath: `src/example${i + 1}.ts`,
              startLine: i * 10 + 1,
              endLine: i * 10 + 15
            }
          }));
        }
      },
      llm: {
        generate: async (prompt: any) => {
          return this.generateMockResponse(prompt);
        }
      }
    };
    
    this.graphrag = new GraphRAGEngine(ragConfig);
    this.context = {
      recentQuestions: [],
      codebaseInsights: {
        mainPatterns: ['MVC', 'Service Layer', 'Repository Pattern'],
        complexity: 'medium',
        primaryLanguage: 'TypeScript'
      }
    };
  }
  
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    console.log('🔍 Analyzing codebase...');
    
    // Index the codebase (simplified for demo)
    await this.graphrag.indexCodebase(this.codebasePath, {
      languages: ['typescript', 'javascript'],
      excludePatterns: ['node_modules/**', '.git/**'],
      parallelism: 2
    });
    
    this.initialized = true;
    console.log('✅ Codebase analysis complete');
  }
  
  async ask(question: string): Promise<string> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    console.log(`\n👤 ${question}`);
    
    // Update context
    this.context.recentQuestions.unshift(question);
    this.context.recentQuestions = this.context.recentQuestions.slice(0, 5);
    
    // Search for relevant code
    const searchResults = await this.graphrag.searchSimilar(question, {
      limit: 5,
      threshold: 0.7
    });
    
    // Generate contextual response
    const response = await this.generateResponse(question, searchResults);
    
    console.log(`🤖 ${response}`);
    return response;
  }
  
  private async generateResponse(question: string, searchResults: any[]): Promise<string> {
    const lowerQuestion = question.toLowerCase();
    
    if (lowerQuestion.includes('how') && lowerQuestion.includes('work')) {
      return this.explainCodeWorking(searchResults, question);
    } else if (lowerQuestion.includes('refactor') || lowerQuestion.includes('improve')) {
      return this.suggestRefactoring(searchResults, question);
    } else if (lowerQuestion.includes('bug') || lowerQuestion.includes('error') || lowerQuestion.includes('debug')) {
      return this.helpDebug(searchResults, question);
    } else if (lowerQuestion.includes('implement') || lowerQuestion.includes('create') || lowerQuestion.includes('add')) {
      return this.helpImplement(searchResults, question);
    } else if (lowerQuestion.includes('architecture') || lowerQuestion.includes('overview') || lowerQuestion.includes('structure')) {
      return this.explainArchitecture();
    } else {
      return this.provideGeneralAssistance(searchResults, question);
    }
  }
  
  private explainCodeWorking(searchResults: any[], question: string): string {
    return `Based on your codebase analysis, here's how this works:

**Code Flow:**
${searchResults.slice(0, 2).map((result, i) => 
  `${i + 1}. **${result.metadata?.filePath || 'File'}** (lines ${result.metadata?.startLine}-${result.metadata?.endLine}):
   ${result.content.substring(0, 100)}...`
).join('\n')}

**Architecture Context:**
Your codebase follows ${this.context.codebaseInsights.mainPatterns.join(' and ')} patterns. This means the code integrates through well-defined interfaces and follows established conventions.

**Key Points:**
- Primary language: ${this.context.codebaseInsights.primaryLanguage}
- Complexity level: ${this.context.codebaseInsights.complexity}
- The implementation follows your project's standard patterns`;
  }
  
  private suggestRefactoring(searchResults: any[], question: string): string {
    return `Here are refactoring suggestions based on your codebase:

**Improvement Opportunities:**
1. **Extract Common Patterns**: I found similar code patterns that could be consolidated
2. **Reduce Complexity**: Some functions could be broken down into smaller, focused methods
3. **Follow Conventions**: Ensure consistency with your ${this.context.codebaseInsights.primaryLanguage} patterns

**Specific Suggestions:**
${searchResults.slice(0, 2).map((result, i) => 
  `- **${result.metadata?.filePath}**: Consider extracting reusable utilities and following your established naming conventions`
).join('\n')}

**Recommended Steps:**
1. Write comprehensive tests for the target code
2. Extract utility functions first
3. Apply consistent patterns used elsewhere in your codebase
4. Verify all tests pass after each refactoring step`;
  }
  
  private helpDebug(searchResults: any[], question: string): string {
    return `Let me help debug this issue based on your codebase:

**Common Issues in ${this.context.codebaseInsights.primaryLanguage} Codebases:**
- Async/await usage in promise chains
- Null/undefined reference issues  
- Type consistency problems
- Error handling patterns

**Relevant Code Sections:**
${searchResults.slice(0, 2).map((result, i) => 
  `**${result.metadata?.filePath}** (line ${result.metadata?.startLine}):
  Check this section for potential issues with error handling and type safety`
).join('\n')}

**Debugging Strategy:**
1. Add logging at key points to trace execution
2. Use your established error handling patterns
3. Check for type consistency and null safety
4. Verify async operations are properly awaited

**Next Steps:**
Run your existing tests and add specific test cases to reproduce the issue.`;
  }
  
  private helpImplement(searchResults: any[], question: string): string {
    return `Here's how to implement this following your codebase patterns:

**Implementation Approach:**
Following your ${this.context.codebaseInsights.mainPatterns.join(' and ')} architecture:

\`\`\`typescript
// Example implementation following your patterns
export class NewFeature {
  constructor(private dependencies: Dependencies) {}
  
  async execute(input: Input): Promise<Result> {
    // Implementation following your service patterns
    return result;
  }
}
\`\`\`

**Integration Points:**
${searchResults.slice(0, 2).map(result => 
  `- Connect with **${result.metadata?.filePath}** for similar functionality`
).join('\n')}

**Testing Strategy:**
- Follow your existing test patterns
- Write unit tests for core logic
- Add integration tests for external dependencies

**Implementation Steps:**
1. Create interface following your conventions
2. Implement core logic with proper error handling
3. Add comprehensive tests
4. Integrate with existing patterns`;
  }
  
  private explainArchitecture(): string {
    return `## 🏗️ Codebase Architecture Overview

**Core Patterns:**
${this.context.codebaseInsights.mainPatterns.map(pattern => `- ${pattern}`).join('\n')}

**Technology Stack:**
- Primary Language: ${this.context.codebaseInsights.primaryLanguage}
- Complexity Level: ${this.context.codebaseInsights.complexity}

**Code Organization:**
Your codebase follows established patterns for maintainability and scalability.

**Key Characteristics:**
- Well-structured modules and clear separation of concerns
- Consistent naming conventions and coding standards
- Proper error handling and logging patterns

**Recommendations:**
- Continue following established patterns for consistency
- Consider refactoring high-complexity areas when needed
- Maintain good test coverage for new features`;
  }
  
  private provideGeneralAssistance(searchResults: any[], question: string): string {
    return `I found relevant information in your codebase:

**Related Code:**
${searchResults.slice(0, 3).map((result, i) => 
  `${i + 1}. **${result.metadata?.filePath || 'File'}**: ${result.content.substring(0, 80)}...`
).join('\n')}

**How I can help further:**
- "How does [feature] work?" - I'll explain the code flow
- "Refactor [file/function]" - I'll suggest improvements  
- "Debug [issue]" - I'll help troubleshoot
- "Implement [feature]" - I'll provide code following your patterns
- "Architecture overview" - I'll explain your codebase structure

**Context:** Your codebase uses ${this.context.codebaseInsights.primaryLanguage} with ${this.context.codebaseInsights.mainPatterns.join(', ')} patterns.`;
  }
  
  private generateMockResponse(prompt: any): string {
    return "AI-generated response based on codebase context and patterns.";
  }
  
  async startInteractiveSession(): Promise<void> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    console.log('\n🤖 Code Assistant Ready!');
    console.log('Ask me anything about your codebase. Type /exit to quit.\n');
    
    const askQuestion = () => {
      rl.question('👤 You: ', async (input) => {
        if (input.toLowerCase() === '/exit') {
          console.log('👋 Goodbye!');
          rl.close();
          return;
        }
        
        try {
          await this.ask(input);
        } catch (error) {
          console.error('❌ Error:', error);
        }
        
        askQuestion();
      });
    };
    
    askQuestion();
  }
}

// CLI interface
if (process.argv[2] === 'start') {
  const codebasePath = process.argv[3] || process.cwd();
  const assistant = new CodeAssistant(codebasePath);
  
  assistant.startInteractiveSession().catch(error => {
    console.error('❌ Failed to start:', error);
    process.exit(1);
  });
}

export { CodeAssistant };