/**
 * Document Loaders
 * 
 * Pluggable document loaders for different sources
 */

import { DocumentLoader, Document } from '../base.js';
import { CheerioWebBaseLoader } from '@langchain/community/document_loaders/web/cheerio';
import { readFile } from 'fs/promises';
import { basename } from 'path';
// import * as globModule from 'glob'; // Not available in dependencies

// Web/URL loader
export class WebDocumentLoader implements DocumentLoader {
  canHandle(source: string): boolean {
    return source.startsWith('http://') || source.startsWith('https://');
  }

  async load(source: string): Promise<Document[]> {
    const loader = new CheerioWebBaseLoader(source);
    const docs = await loader.load();

    return docs.map((doc, index) => ({
      id: `${source}#${index}`,
      content: doc.pageContent,
      metadata: {
        ...doc.metadata,
        sourceType: 'web',
        url: source
      },
      source
    }));
  }
}

// File system loader
export class FileSystemLoader implements DocumentLoader {
  private supportedExtensions = new Set(['.txt', '.md', '.js', '.ts', '.py', '.go', '.rs', '.java', '.cpp', '.c', '.h']);

  canHandle(source: string): boolean {
    // Check if it's a file path or glob pattern
    return !source.startsWith('http://') && !source.startsWith('https://');
  }

  async load(source: string): Promise<Document[]> {
    const documents: Document[] = [];

    // Handle glob patterns - simplified for demo (use glob package in production)
    const files = source.includes('*') ? [] : [source]; // Skip glob patterns for now

    for (const filePath of files) {
      try {
        const content = await readFile(filePath, 'utf-8');
        const ext = filePath.substring(filePath.lastIndexOf('.'));

        if (this.supportedExtensions.has(ext)) {
          documents.push({
            id: filePath,
            content,
            metadata: {
              sourceType: 'file',
              filePath,
              fileName: basename(filePath),
              extension: ext
            },
            source: filePath
          });
        }
      } catch (error) {
        console.warn(`Failed to load file ${filePath}:`, error);
      }
    }

    return documents;
  }
}

// Code-specific loader with AST parsing
export class CodeDocumentLoader implements DocumentLoader {
  private codeExtensions = new Set(['.js', '.ts', '.jsx', '.tsx', '.py', '.go', '.rs', '.java', '.cpp', '.c', '.h']);

  canHandle(source: string): boolean {
    const ext = source.substring(source.lastIndexOf('.'));
    return this.codeExtensions.has(ext) && !source.startsWith('http');
  }

  async load(source: string): Promise<Document[]> {
    // Simplified file discovery - add 'glob' package to dependencies for production use
    const files = source.includes('*') ? [] : [source]; // Skip glob patterns for now
    const documents: Document[] = [];

    for (const filePath of files) {
      try {
        const content = await readFile(filePath, 'utf-8');
        const ext = filePath.substring(filePath.lastIndexOf('.'));

        // Parse code into entities (functions, classes, etc.)
        const entities = await this.parseCodeEntities(content, ext);

        // Create documents for whole file and individual entities
        documents.push({
          id: filePath,
          content,
          metadata: {
            sourceType: 'code',
            entityType: 'file',
            filePath,
            fileName: basename(filePath),
            extension: ext,
            lineCount: content.split('\n').length
          },
          source: filePath
        });

        // Add individual code entities
        entities.forEach((entity, index) => {
          documents.push({
            id: `${filePath}#${entity.name}`,
            content: entity.content,
            metadata: {
              sourceType: 'code',
              entityType: entity.type,
              filePath,
              entityName: entity.name,
              startLine: entity.startLine,
              endLine: entity.endLine,
              signature: entity.signature
            },
            source: filePath
          });
        });
      } catch (error) {
        console.warn(`Failed to load code file ${filePath}:`, error);
      }
    }

    return documents;
  }

  private async parseCodeEntities(content: string, extension: string): Promise<CodeEntity[]> {
    // Simplified code parsing - in a real implementation, use proper AST parsers
    const entities: CodeEntity[] = [];
    const lines = content.split('\n');

    let currentEntity: Partial<CodeEntity> | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Simple patterns for different languages
      if (extension === '.ts' || extension === '.js') {
        // Function declarations
        const funcMatch = line.match(/^(export\s+)?(async\s+)?function\s+(\w+)/);
        if (funcMatch) {
          if (currentEntity) {
            currentEntity.endLine = i - 1;
            entities.push(currentEntity as CodeEntity);
          }
          currentEntity = {
            name: funcMatch[3],
            type: 'function',
            startLine: i + 1,
            signature: line,
            content: ''
          };
        }

        // Class declarations
        const classMatch = line.match(/^(export\s+)?class\s+(\w+)/);
        if (classMatch) {
          if (currentEntity) {
            currentEntity.endLine = i - 1;
            entities.push(currentEntity as CodeEntity);
          }
          currentEntity = {
            name: classMatch[2],
            type: 'class',
            startLine: i + 1,
            signature: line,
            content: ''
          };
        }
      }

      // Add line to current entity
      if (currentEntity) {
        currentEntity.content += lines[i] + '\n';
      }

      // Simple brace counting for end detection
      if (line === '}' && currentEntity) {
        currentEntity.endLine = i + 1;
        entities.push(currentEntity as CodeEntity);
        currentEntity = null;
      }
    }

    return entities;
  }
}

interface CodeEntity {
  name: string;
  type: 'function' | 'class' | 'variable' | 'interface' | 'type';
  startLine: number;
  endLine: number;
  signature: string;
  content: string;
}

// Git repository loader
export class GitRepositoryLoader implements DocumentLoader {
  canHandle(source: string): boolean {
    return source.endsWith('.git') || source.includes('github.com') || source.includes('gitlab.com');
  }

  async load(source: string): Promise<Document[]> {
    // In a real implementation, this would clone the repo and process files
    throw new Error('Git repository loader not implemented. Use file system loader on cloned repos.');
  }
}