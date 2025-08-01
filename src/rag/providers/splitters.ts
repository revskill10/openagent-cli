/**
 * Text Splitters
 * 
 * Pluggable text splitters for different content types
 */

import { TextSplitter, Document, DocumentChunk } from '../base.js';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';

// Character-based splitter
export class CharacterTextSplitter implements TextSplitter {
  private chunkSize: number;
  private chunkOverlap: number;

  constructor(chunkSize: number = 1000, chunkOverlap: number = 200) {
    this.chunkSize = chunkSize;
    this.chunkOverlap = chunkOverlap;
  }

  async splitDocuments(docs: Document[]): Promise<DocumentChunk[]> {
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: this.chunkSize,
      chunkOverlap: this.chunkOverlap
    });

    const chunks: DocumentChunk[] = [];

    for (const doc of docs) {
      const splits = await splitter.splitText(doc.content);
      
      splits.forEach((split, index) => {
        chunks.push({
          ...doc,
          id: `${doc.id}#chunk_${index}`,
          content: split,
          chunkIndex: index,
          metadata: {
            ...doc.metadata,
            chunkIndex: index,
            totalChunks: splits.length
          }
        });
      });
    }

    return chunks;
  }
}

// Code-aware splitter
export class CodeAwareSplitter implements TextSplitter {
  private maxChunkSize: number;

  constructor(maxChunkSize: number = 1500) {
    this.maxChunkSize = maxChunkSize;
  }

  async splitDocuments(docs: Document[]): Promise<DocumentChunk[]> {
    const chunks: DocumentChunk[] = [];

    for (const doc of docs) {
      if (doc.metadata.sourceType === 'code') {
        const codeChunks = this.splitCodeDocument(doc);
        chunks.push(...codeChunks);
      } else {
        // Fall back to character splitting for non-code
        const fallbackSplitter = new CharacterTextSplitter(this.maxChunkSize, 100);
        const fallbackChunks = await fallbackSplitter.splitDocuments([doc]);
        chunks.push(...fallbackChunks);
      }
    }

    return chunks;
  }

  private splitCodeDocument(doc: Document): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    
    // If it's already a code entity (function, class), keep as single chunk
    if (doc.metadata.entityType && doc.metadata.entityType !== 'file') {
      chunks.push({
        ...doc,
        id: `${doc.id}#chunk_0`,
        chunkIndex: 0
      });
      return chunks;
    }

    // For whole files, split by logical boundaries
    const lines = doc.content.split('\n');
    let currentChunk = '';
    let chunkIndex = 0;
    let startLine = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Check if adding this line would exceed chunk size
      if (currentChunk.length + line.length > this.maxChunkSize && currentChunk.length > 0) {
        // Create chunk
        chunks.push({
          ...doc,
          id: `${doc.id}#chunk_${chunkIndex}`,
          content: currentChunk.trim(),
          chunkIndex,
          metadata: {
            ...doc.metadata,
            chunkIndex,
            startLine: startLine + 1,
            endLine: i,
            totalChunks: -1 // Will be updated later
          }
        });
        
        currentChunk = line + '\n';
        startLine = i;
        chunkIndex++;
      } else {
        currentChunk += line + '\n';
      }
    }

    // Add final chunk
    if (currentChunk.trim()) {
      chunks.push({
        ...doc,
        id: `${doc.id}#chunk_${chunkIndex}`,
        content: currentChunk.trim(),
        chunkIndex,
        metadata: {
          ...doc.metadata,
          chunkIndex,
          startLine: startLine + 1,
          endLine: lines.length,
          totalChunks: -1
        }
      });
    }

    // Update total chunks count
    chunks.forEach(chunk => {
      chunk.metadata.totalChunks = chunks.length;
    });

    return chunks;
  }
}

// Semantic splitter (splits by meaning/topics)
export class SemanticSplitter implements TextSplitter {
  private maxChunkSize: number;
  private minChunkSize: number;

  constructor(maxChunkSize: number = 1000, minChunkSize: number = 100) {
    this.maxChunkSize = maxChunkSize;
    this.minChunkSize = minChunkSize;
  }

  async splitDocuments(docs: Document[]): Promise<DocumentChunk[]> {
    const chunks: DocumentChunk[] = [];

    for (const doc of docs) {
      const semanticChunks = await this.splitBySentences(doc);
      chunks.push(...semanticChunks);
    }

    return chunks;
  }

  private async splitBySentences(doc: Document): Promise<DocumentChunk[]> {
    const chunks: DocumentChunk[] = [];
    
    // Simple sentence-based splitting
    const sentences = doc.content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    let currentChunk = '';
    let chunkIndex = 0;

    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();
      
      if (currentChunk.length + trimmedSentence.length > this.maxChunkSize && currentChunk.length >= this.minChunkSize) {
        chunks.push({
          ...doc,
          id: `${doc.id}#semantic_${chunkIndex}`,
          content: currentChunk.trim(),
          chunkIndex,
          metadata: {
            ...doc.metadata,
            chunkIndex,
            totalChunks: -1,
            splitterType: 'semantic'
          }
        });
        
        currentChunk = trimmedSentence + '. ';
        chunkIndex++;
      } else {
        currentChunk += trimmedSentence + '. ';
      }
    }

    // Add final chunk
    if (currentChunk.trim().length >= this.minChunkSize) {
      chunks.push({
        ...doc,
        id: `${doc.id}#semantic_${chunkIndex}`,
        content: currentChunk.trim(),
        chunkIndex,
        metadata: {
          ...doc.metadata,
          chunkIndex,
          totalChunks: -1,
          splitterType: 'semantic'
        }
      });
    }

    // Update total chunks count
    chunks.forEach(chunk => {
      chunk.metadata.totalChunks = chunks.length;
    });

    return chunks;
  }
}