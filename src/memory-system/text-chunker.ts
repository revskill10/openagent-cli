// text-chunker.ts - Advanced text chunking system inspired by Chonkie library
import { createHash } from 'crypto';

export interface TextChunk {
  id: string;
  content: string;
  metadata: ChunkMetadata;
  embeddings?: number[];
  relationships: ChunkRelationship[];
}

export interface ChunkMetadata {
  source: string;
  startIndex: number;
  endIndex: number;
  chunkIndex: number;
  totalChunks: number;
  tokenCount: number;
  characterCount: number;
  language?: string;
  contentType: ContentType;
  importance: number;
  keywords: string[];
  entities: Entity[];
  createdAt: Date;
  lastAccessed: Date;
}

export interface ChunkRelationship {
  type: RelationshipType;
  targetChunkId: string;
  strength: number;
  context?: string;
}

export interface Entity {
  text: string;
  type: EntityType;
  confidence: number;
  startIndex: number;
  endIndex: number;
}

export interface ChunkingOptions {
  maxTokens: number;
  overlap: number;
  strategy: ChunkingStrategy;
  preserveStructure: boolean;
  extractEntities: boolean;
  calculateImportance: boolean;
  language?: string;
  customSeparators?: string[];
}

export interface ChunkingResult {
  chunks: TextChunk[];
  metadata: ChunkingResultMetadata;
  statistics: ChunkingStatistics;
}

export interface ChunkingResultMetadata {
  sourceId: string;
  strategy: ChunkingStrategy;
  totalTokens: number;
  averageChunkSize: number;
  processingTime: number;
  qualityScore: number;
}

export interface ChunkingStatistics {
  totalChunks: number;
  averageTokensPerChunk: number;
  minTokensPerChunk: number;
  maxTokensPerChunk: number;
  overlapPercentage: number;
  entitiesExtracted: number;
  relationshipsFound: number;
}

export type ContentType = 'code' | 'documentation' | 'natural_language' | 'structured_data' | 'mixed';
export type ChunkingStrategy = 'semantic' | 'fixed_size' | 'sentence' | 'paragraph' | 'structure_aware' | 'adaptive';
export type RelationshipType = 'sequential' | 'semantic_similarity' | 'entity_reference' | 'code_dependency' | 'hierarchical';
export type EntityType = 'person' | 'organization' | 'location' | 'function' | 'class' | 'variable' | 'file' | 'concept';

export class TextChunker {
  private tokenizer: SimpleTokenizer;
  private entityExtractor: EntityExtractor;
  private importanceCalculator: ImportanceCalculator;

  constructor() {
    this.tokenizer = new SimpleTokenizer();
    this.entityExtractor = new EntityExtractor();
    this.importanceCalculator = new ImportanceCalculator();
  }

  async chunkText(text: string, options: ChunkingOptions): Promise<ChunkingResult> {
    const startTime = Date.now();
    const sourceId = this.generateSourceId(text);

    // Detect content type if not specified
    const contentType = this.detectContentType(text);

    // Choose optimal strategy based on content type
    const strategy = this.optimizeStrategy(options.strategy, contentType);

    // Perform chunking based on strategy
    let chunks: TextChunk[];
    switch (strategy) {
      case 'semantic':
        chunks = await this.semanticChunking(text, options, sourceId);
        break;
      case 'structure_aware':
        chunks = await this.structureAwareChunking(text, options, sourceId);
        break;
      case 'adaptive':
        chunks = await this.adaptiveChunking(text, options, sourceId);
        break;
      case 'sentence':
        chunks = await this.sentenceChunking(text, options, sourceId);
        break;
      case 'paragraph':
        chunks = await this.paragraphChunking(text, options, sourceId);
        break;
      default:
        chunks = await this.fixedSizeChunking(text, options, sourceId);
    }

    // Extract entities if requested
    if (options.extractEntities) {
      chunks = await this.extractEntitiesFromChunks(chunks);
    }

    // Calculate importance scores if requested
    if (options.calculateImportance) {
      chunks = await this.calculateImportanceScores(chunks);
    }

    // Find relationships between chunks
    chunks = await this.findChunkRelationships(chunks);

    // Calculate statistics
    const statistics = this.calculateStatistics(chunks, text);
    const processingTime = Date.now() - startTime;

    return {
      chunks,
      metadata: {
        sourceId,
        strategy,
        totalTokens: this.tokenizer.countTokens(text),
        averageChunkSize: statistics.averageTokensPerChunk,
        processingTime,
        qualityScore: this.calculateQualityScore(chunks, statistics)
      },
      statistics
    };
  }

  private detectContentType(text: string): ContentType {
    // Code detection patterns
    const codePatterns = [
      /^(function|class|def|import|from|const|let|var)\s/m,
      /\{[\s\S]*\}/,
      /\/\*[\s\S]*\*\/|\/\/.*$/m,
      /^\s*#.*$/m,
      /<\/?[a-z][\s\S]*>/i
    ];

    // Documentation patterns
    const docPatterns = [
      /^#{1,6}\s/m, // Markdown headers
      /^\*\s/m,     // Bullet points
      /^\d+\.\s/m,  // Numbered lists
      /\[.*\]\(.*\)/, // Markdown links
    ];

    // Structured data patterns
    const structuredPatterns = [
      /^\s*[\{\[]/, // JSON-like
      /^\s*\w+:\s*/, // YAML-like
      /^\s*<\?xml/, // XML
    ];

    if (codePatterns.some(pattern => pattern.test(text))) {
      return 'code';
    }

    if (structuredPatterns.some(pattern => pattern.test(text))) {
      return 'structured_data';
    }

    if (docPatterns.some(pattern => pattern.test(text))) {
      return 'documentation';
    }

    // Check for mixed content
    const hasCode = codePatterns.some(pattern => pattern.test(text));
    const hasDoc = docPatterns.some(pattern => pattern.test(text));
    
    if (hasCode && hasDoc) {
      return 'mixed';
    }

    return 'natural_language';
  }

  private optimizeStrategy(requestedStrategy: ChunkingStrategy, contentType: ContentType): ChunkingStrategy {
    // Override strategy based on content type for better results
    switch (contentType) {
      case 'code':
        return requestedStrategy === 'semantic' ? 'structure_aware' : requestedStrategy;
      case 'documentation':
        return requestedStrategy === 'fixed_size' ? 'paragraph' : requestedStrategy;
      case 'structured_data':
        return 'structure_aware';
      case 'mixed':
        return 'adaptive';
      default:
        return requestedStrategy;
    }
  }

  private async semanticChunking(text: string, options: ChunkingOptions, sourceId: string): Promise<TextChunk[]> {
    // Simplified semantic chunking - in production, would use embeddings
    const sentences = this.splitIntoSentences(text);
    const chunks: TextChunk[] = [];
    let currentChunk = '';
    let currentTokens = 0;
    let chunkIndex = 0;
    let startIndex = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const sentenceTokens = this.tokenizer.countTokens(sentence);

      if (currentTokens + sentenceTokens > options.maxTokens && currentChunk) {
        // Create chunk
        chunks.push(await this.createChunk(
          currentChunk.trim(),
          sourceId,
          startIndex,
          startIndex + currentChunk.length,
          chunkIndex++,
          options
        ));

        // Start new chunk with overlap
        const overlapSentences = this.getOverlapSentences(sentences, i, options.overlap);
        currentChunk = overlapSentences.join(' ') + ' ' + sentence;
        currentTokens = this.tokenizer.countTokens(currentChunk);
        startIndex = text.indexOf(sentence) - overlapSentences.join(' ').length - 1;
      } else {
        currentChunk += (currentChunk ? ' ' : '') + sentence;
        currentTokens += sentenceTokens;
        if (chunks.length === 0) {
          startIndex = text.indexOf(sentence);
        }
      }
    }

    // Add final chunk
    if (currentChunk) {
      chunks.push(await this.createChunk(
        currentChunk.trim(),
        sourceId,
        startIndex,
        startIndex + currentChunk.length,
        chunkIndex,
        options
      ));
    }

    return chunks;
  }

  private async structureAwareChunking(text: string, options: ChunkingOptions, sourceId: string): Promise<TextChunk[]> {
    const chunks: TextChunk[] = [];
    let chunkIndex = 0;

    // For code, split by functions/classes
    if (this.detectContentType(text) === 'code') {
      const codeBlocks = this.extractCodeBlocks(text);
      
      for (const block of codeBlocks) {
        if (this.tokenizer.countTokens(block.content) <= options.maxTokens) {
          chunks.push(await this.createChunk(
            block.content,
            sourceId,
            block.startIndex,
            block.endIndex,
            chunkIndex++,
            options
          ));
        } else {
          // Split large blocks using fixed size
          const subChunks = await this.fixedSizeChunking(block.content, options, sourceId);
          chunks.push(...subChunks);
          chunkIndex += subChunks.length;
        }
      }
    } else {
      // For other content, fall back to paragraph chunking
      return this.paragraphChunking(text, options, sourceId);
    }

    return chunks;
  }

  private async adaptiveChunking(text: string, options: ChunkingOptions, sourceId: string): Promise<TextChunk[]> {
    // Adaptive strategy that switches based on local content characteristics
    const chunks: TextChunk[] = [];
    const sections = this.splitIntoSections(text);
    let chunkIndex = 0;

    for (const section of sections) {
      const sectionType = this.detectContentType(section.content);
      let sectionChunks: TextChunk[];

      switch (sectionType) {
        case 'code':
          sectionChunks = await this.structureAwareChunking(section.content, options, sourceId);
          break;
        case 'documentation':
          sectionChunks = await this.paragraphChunking(section.content, options, sourceId);
          break;
        default:
          sectionChunks = await this.semanticChunking(section.content, options, sourceId);
      }

      // Adjust chunk indices
      sectionChunks.forEach(chunk => {
        chunk.metadata.chunkIndex = chunkIndex++;
        chunk.metadata.startIndex += section.startIndex;
        chunk.metadata.endIndex += section.startIndex;
      });

      chunks.push(...sectionChunks);
    }

    return chunks;
  }

  private async sentenceChunking(text: string, options: ChunkingOptions, sourceId: string): Promise<TextChunk[]> {
    const sentences = this.splitIntoSentences(text);
    const chunks: TextChunk[] = [];
    let chunkIndex = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const startIndex = text.indexOf(sentence, i > 0 ? chunks[i-1]?.metadata.endIndex || 0 : 0);
      
      chunks.push(await this.createChunk(
        sentence,
        sourceId,
        startIndex,
        startIndex + sentence.length,
        chunkIndex++,
        options
      ));
    }

    return chunks;
  }

  private async paragraphChunking(text: string, options: ChunkingOptions, sourceId: string): Promise<TextChunk[]> {
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
    const chunks: TextChunk[] = [];
    let chunkIndex = 0;
    let currentPosition = 0;

    for (const paragraph of paragraphs) {
      const startIndex = text.indexOf(paragraph, currentPosition);
      const endIndex = startIndex + paragraph.length;
      
      if (this.tokenizer.countTokens(paragraph) <= options.maxTokens) {
        chunks.push(await this.createChunk(
          paragraph.trim(),
          sourceId,
          startIndex,
          endIndex,
          chunkIndex++,
          options
        ));
      } else {
        // Split large paragraphs
        const subChunks = await this.fixedSizeChunking(paragraph, options, sourceId);
        subChunks.forEach(chunk => {
          chunk.metadata.chunkIndex = chunkIndex++;
          chunk.metadata.startIndex += startIndex;
          chunk.metadata.endIndex += startIndex;
        });
        chunks.push(...subChunks);
      }
      
      currentPosition = endIndex;
    }

    return chunks;
  }

  private async fixedSizeChunking(text: string, options: ChunkingOptions, sourceId: string): Promise<TextChunk[]> {
    const chunks: TextChunk[] = [];
    const tokens = this.tokenizer.tokenize(text);
    let chunkIndex = 0;

    for (let i = 0; i < tokens.length; i += options.maxTokens - options.overlap) {
      const chunkTokens = tokens.slice(i, i + options.maxTokens);
      const chunkText = this.tokenizer.detokenize(chunkTokens);
      
      const startIndex = this.findTextPosition(text, chunkText, i > 0 ? chunks[chunks.length - 1]?.metadata.endIndex || 0 : 0);
      const endIndex = startIndex + chunkText.length;

      chunks.push(await this.createChunk(
        chunkText,
        sourceId,
        startIndex,
        endIndex,
        chunkIndex++,
        options
      ));
    }

    return chunks;
  }

  private async createChunk(
    content: string,
    sourceId: string,
    startIndex: number,
    endIndex: number,
    chunkIndex: number,
    options: ChunkingOptions
  ): Promise<TextChunk> {
    const id = this.generateChunkId(sourceId, chunkIndex);
    const tokenCount = this.tokenizer.countTokens(content);
    const keywords = this.extractKeywords(content);

    return {
      id,
      content,
      metadata: {
        source: sourceId,
        startIndex,
        endIndex,
        chunkIndex,
        totalChunks: 0, // Will be updated later
        tokenCount,
        characterCount: content.length,
        language: options.language,
        contentType: this.detectContentType(content),
        importance: 0.5, // Default, will be calculated later
        keywords,
        entities: [],
        createdAt: new Date(),
        lastAccessed: new Date()
      },
      relationships: []
    };
  }

  private splitIntoSentences(text: string): string[] {
    // Simple sentence splitting - in production, use more sophisticated NLP
    return text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  }

  private splitIntoSections(text: string): Array<{ content: string; startIndex: number; endIndex: number }> {
    // Split by headers, code blocks, or other structural elements
    const sections: Array<{ content: string; startIndex: number; endIndex: number }> = [];
    const lines = text.split('\n');
    let currentSection = '';
    let sectionStart = 0;
    let currentIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Check for section boundaries (headers, code blocks, etc.)
      if (this.isSectionBoundary(line) && currentSection.trim()) {
        sections.push({
          content: currentSection.trim(),
          startIndex: sectionStart,
          endIndex: currentIndex
        });
        currentSection = line + '\n';
        sectionStart = currentIndex;
      } else {
        currentSection += line + '\n';
      }
      
      currentIndex += line.length + 1;
    }

    // Add final section
    if (currentSection.trim()) {
      sections.push({
        content: currentSection.trim(),
        startIndex: sectionStart,
        endIndex: currentIndex
      });
    }

    return sections;
  }

  private isSectionBoundary(line: string): boolean {
    return /^#{1,6}\s/.test(line) || // Markdown headers
           /^```/.test(line) ||      // Code blocks
           /^class\s|^function\s|^def\s/.test(line); // Code definitions
  }

  private extractCodeBlocks(text: string): Array<{ content: string; startIndex: number; endIndex: number }> {
    const blocks: Array<{ content: string; startIndex: number; endIndex: number }> = [];
    
    // Extract functions, classes, etc.
    const patterns = [
      /(?:^|\n)((?:function|class|def|const|let|var)\s+[^{]*\{[^}]*\})/gm,
      /(?:^|\n)((?:interface|type)\s+[^{]*\{[^}]*\})/gm
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const startIndex = match.index + (match[0].startsWith('\n') ? 1 : 0);
        blocks.push({
          content: match[1],
          startIndex,
          endIndex: startIndex + match[1].length
        });
      }
    }

    // If no blocks found, treat entire text as one block
    if (blocks.length === 0) {
      blocks.push({
        content: text,
        startIndex: 0,
        endIndex: text.length
      });
    }

    return blocks;
  }

  private getOverlapSentences(sentences: string[], currentIndex: number, overlapTokens: number): string[] {
    const overlap: string[] = [];
    let tokens = 0;
    
    for (let i = currentIndex - 1; i >= 0 && tokens < overlapTokens; i--) {
      const sentence = sentences[i];
      const sentenceTokens = this.tokenizer.countTokens(sentence);
      
      if (tokens + sentenceTokens <= overlapTokens) {
        overlap.unshift(sentence);
        tokens += sentenceTokens;
      } else {
        break;
      }
    }
    
    return overlap;
  }

  private extractKeywords(text: string): string[] {
    // Simple keyword extraction - in production, use TF-IDF or more advanced methods
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3);
    
    const frequency = new Map<string, number>();
    words.forEach(word => {
      frequency.set(word, (frequency.get(word) || 0) + 1);
    });
    
    return Array.from(frequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }

  private async extractEntitiesFromChunks(chunks: TextChunk[]): Promise<TextChunk[]> {
    for (const chunk of chunks) {
      chunk.metadata.entities = await this.entityExtractor.extract(chunk.content);
    }
    return chunks;
  }

  private async calculateImportanceScores(chunks: TextChunk[]): Promise<TextChunk[]> {
    for (const chunk of chunks) {
      chunk.metadata.importance = await this.importanceCalculator.calculate(chunk);
    }
    return chunks;
  }

  private async findChunkRelationships(chunks: TextChunk[]): Promise<TextChunk[]> {
    // Find relationships between chunks
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      // Sequential relationships
      if (i > 0) {
        chunk.relationships.push({
          type: 'sequential',
          targetChunkId: chunks[i - 1].id,
          strength: 0.8
        });
      }
      
      if (i < chunks.length - 1) {
        chunk.relationships.push({
          type: 'sequential',
          targetChunkId: chunks[i + 1].id,
          strength: 0.8
        });
      }
      
      // Semantic similarity (simplified)
      for (let j = i + 1; j < chunks.length; j++) {
        const otherChunk = chunks[j];
        const similarity = this.calculateSimilarity(chunk, otherChunk);
        
        if (similarity > 0.5) {
          chunk.relationships.push({
            type: 'semantic_similarity',
            targetChunkId: otherChunk.id,
            strength: similarity
          });
        }
      }
    }
    
    return chunks;
  }

  private calculateSimilarity(chunk1: TextChunk, chunk2: TextChunk): number {
    // Simple keyword-based similarity
    const keywords1 = new Set(chunk1.metadata.keywords);
    const keywords2 = new Set(chunk2.metadata.keywords);
    
    const intersection = new Set([...keywords1].filter(k => keywords2.has(k)));
    const union = new Set([...keywords1, ...keywords2]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  private calculateStatistics(chunks: TextChunk[], originalText: string): ChunkingStatistics {
    const tokenCounts = chunks.map(chunk => chunk.metadata.tokenCount);
    const totalEntities = chunks.reduce((sum, chunk) => sum + chunk.metadata.entities.length, 0);
    const totalRelationships = chunks.reduce((sum, chunk) => sum + chunk.relationships.length, 0);
    
    return {
      totalChunks: chunks.length,
      averageTokensPerChunk: tokenCounts.reduce((sum, count) => sum + count, 0) / chunks.length,
      minTokensPerChunk: Math.min(...tokenCounts),
      maxTokensPerChunk: Math.max(...tokenCounts),
      overlapPercentage: 0, // Would calculate based on actual overlap
      entitiesExtracted: totalEntities,
      relationshipsFound: totalRelationships
    };
  }

  private calculateQualityScore(chunks: TextChunk[], statistics: ChunkingStatistics): number {
    let score = 0.5; // Base score
    
    // Reward consistent chunk sizes
    const variance = this.calculateVariance(chunks.map(c => c.metadata.tokenCount));
    score += Math.max(0, 0.3 - variance / 1000);
    
    // Reward entity extraction
    score += Math.min(0.2, statistics.entitiesExtracted / chunks.length * 0.1);
    
    // Reward relationship discovery
    score += Math.min(0.2, statistics.relationshipsFound / chunks.length * 0.05);
    
    return Math.max(0, Math.min(1, score));
  }

  private calculateVariance(numbers: number[]): number {
    const mean = numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
    const squaredDiffs = numbers.map(n => Math.pow(n - mean, 2));
    return squaredDiffs.reduce((sum, diff) => sum + diff, 0) / numbers.length;
  }

  private findTextPosition(text: string, searchText: string, startFrom: number): number {
    const index = text.indexOf(searchText, startFrom);
    return index >= 0 ? index : startFrom;
  }

  private generateSourceId(text: string): string {
    return createHash('md5').update(text).digest('hex').slice(0, 16);
  }

  private generateChunkId(sourceId: string, chunkIndex: number): string {
    return `${sourceId}_chunk_${chunkIndex}`;
  }
}

// Simple tokenizer implementation
class SimpleTokenizer {
  tokenize(text: string): string[] {
    return text.split(/\s+/).filter(token => token.length > 0);
  }

  detokenize(tokens: string[]): string {
    return tokens.join(' ');
  }

  countTokens(text: string): number {
    return this.tokenize(text).length;
  }
}

// Simple entity extractor
class EntityExtractor {
  async extract(text: string): Promise<Entity[]> {
    const entities: Entity[] = [];
    
    // Simple patterns for common entities
    const patterns = [
      { type: 'function' as EntityType, pattern: /\b(function|def)\s+(\w+)/g },
      { type: 'class' as EntityType, pattern: /\b(class)\s+(\w+)/g },
      { type: 'variable' as EntityType, pattern: /\b(const|let|var)\s+(\w+)/g },
      { type: 'file' as EntityType, pattern: /\b(\w+\.\w+)\b/g }
    ];
    
    for (const { type, pattern } of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        entities.push({
          text: match[2] || match[1],
          type,
          confidence: 0.8,
          startIndex: match.index,
          endIndex: match.index + match[0].length
        });
      }
    }
    
    return entities;
  }
}

// Simple importance calculator
class ImportanceCalculator {
  async calculate(chunk: TextChunk): Promise<number> {
    let importance = 0.5; // Base importance
    
    // Boost importance for code definitions
    if (chunk.metadata.entities.some(e => e.type === 'function' || e.type === 'class')) {
      importance += 0.3;
    }
    
    // Boost importance for chunks with many keywords
    importance += Math.min(0.2, chunk.metadata.keywords.length * 0.02);
    
    // Boost importance for longer chunks (more content)
    importance += Math.min(0.2, chunk.metadata.tokenCount / 1000);
    
    return Math.max(0, Math.min(1, importance));
  }
}

export const textChunker = new TextChunker();
