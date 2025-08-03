// file-cache.ts - Intelligent file caching system with persistence
import { readFile, writeFile, mkdir, access } from 'fs/promises';
import { join, dirname } from 'path';
import { FileMetadata, FileOutline, FileChunk } from './file-analyzer.js';

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  hash: string;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
}

export interface FileCacheStats {
  totalEntries: number;
  totalSize: number;
  hitRate: number;
  missRate: number;
  evictionCount: number;
}

export class FileCache {
  private cache = new Map<string, CacheEntry<any>>();
  private cacheDir: string;
  private maxSize: number;
  private defaultTTL: number;
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0
  };

  constructor(options: {
    cacheDir?: string;
    maxSize?: number;
    defaultTTL?: number;
  } = {}) {
    this.cacheDir = options.cacheDir || '.cache/file-reader';
    this.maxSize = options.maxSize || 1000;
    this.defaultTTL = options.defaultTTL || 24 * 60 * 60 * 1000; // 24 hours
  }

  async initialize(): Promise<void> {
    try {
      await mkdir(this.cacheDir, { recursive: true });
      await this.loadPersistedCache();
    } catch (error) {
      console.warn('Failed to initialize file cache:', error);
    }
  }

  async getMetadata(filePath: string): Promise<FileMetadata | null> {
    return this.get<FileMetadata>(`metadata:${filePath}`);
  }

  async setMetadata(filePath: string, metadata: FileMetadata, ttl?: number): Promise<void> {
    await this.set(`metadata:${filePath}`, metadata, ttl);
  }

  async getOutline(filePath: string): Promise<FileOutline | null> {
    return this.get<FileOutline>(`outline:${filePath}`);
  }

  async setOutline(filePath: string, outline: FileOutline, ttl?: number): Promise<void> {
    await this.set(`outline:${filePath}`, outline, ttl);
  }

  async getChunks(filePath: string, context?: string): Promise<FileChunk[] | null> {
    const key = context ? `chunks:${filePath}:${this.hashString(context)}` : `chunks:${filePath}`;
    return this.get<FileChunk[]>(key);
  }

  async setChunks(filePath: string, chunks: FileChunk[], context?: string, ttl?: number): Promise<void> {
    const key = context ? `chunks:${filePath}:${this.hashString(context)}` : `chunks:${filePath}`;
    await this.set(key, chunks, ttl);
  }

  async getSummary(filePath: string): Promise<string | null> {
    return this.get<string>(`summary:${filePath}`);
  }

  async setSummary(filePath: string, summary: string, ttl?: number): Promise<void> {
    await this.set(`summary:${filePath}`, summary, ttl);
  }

  private async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    // Update access stats
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    this.stats.hits++;

    return entry.data as T;
  }

  private async set<T>(key: string, data: T, ttl?: number): Promise<void> {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      hash: this.hashString(JSON.stringify(data)),
      ttl: ttl || this.defaultTTL,
      accessCount: 0,
      lastAccessed: Date.now()
    };

    // Check if cache is full
    if (this.cache.size >= this.maxSize) {
      await this.evictLeastUsed();
    }

    this.cache.set(key, entry);
    
    // Persist to disk for important entries
    if (this.shouldPersist(key)) {
      await this.persistEntry(key, entry);
    }
  }

  private async evictLeastUsed(): Promise<void> {
    let leastUsedKey = '';
    let leastUsedScore = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      // Score based on access count and recency
      const score = entry.accessCount / (Date.now() - entry.lastAccessed + 1);
      
      if (score < leastUsedScore) {
        leastUsedScore = score;
        leastUsedKey = key;
      }
    }

    if (leastUsedKey) {
      this.cache.delete(leastUsedKey);
      this.stats.evictions++;
    }
  }

  private shouldPersist(key: string): boolean {
    // Persist metadata and outlines, but not chunks (too large)
    return key.startsWith('metadata:') || key.startsWith('outline:');
  }

  private async persistEntry(key: string, entry: CacheEntry<any>): Promise<void> {
    try {
      const filePath = join(this.cacheDir, `${this.hashString(key)}.json`);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, JSON.stringify({ key, entry }));
    } catch (error) {
      console.warn('Failed to persist cache entry:', error);
    }
  }

  private async loadPersistedCache(): Promise<void> {
    try {
      const { readdir } = await import('fs/promises');
      const files = await readdir(this.cacheDir);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const filePath = join(this.cacheDir, file);
            const content = await readFile(filePath, 'utf-8');
            const { key, entry } = JSON.parse(content);
            
            // Check if still valid
            if (Date.now() - entry.timestamp <= entry.ttl) {
              this.cache.set(key, entry);
            }
          } catch (error) {
            console.warn(`Failed to load cache file ${file}:`, error);
          }
        }
      }
    } catch (error) {
      // Cache directory doesn't exist yet, that's fine
    }
  }

  async invalidateFile(filePath: string): Promise<void> {
    const keysToDelete: string[] = [];
    
    for (const key of this.cache.keys()) {
      if (key.includes(filePath)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
  }

  async clear(): Promise<void> {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0, evictions: 0 };
  }

  getStats(): FileCacheStats {
    const totalRequests = this.stats.hits + this.stats.misses;
    
    return {
      totalEntries: this.cache.size,
      totalSize: this.calculateCacheSize(),
      hitRate: totalRequests > 0 ? this.stats.hits / totalRequests : 0,
      missRate: totalRequests > 0 ? this.stats.misses / totalRequests : 0,
      evictionCount: this.stats.evictions
    };
  }

  private calculateCacheSize(): number {
    let size = 0;
    for (const entry of this.cache.values()) {
      size += JSON.stringify(entry.data).length;
    }
    return size;
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  // Cache warming methods
  async warmCache(filePaths: string[]): Promise<void> {
    const { fileAnalyzer } = await import('./file-analyzer.js');
    
    for (const filePath of filePaths) {
      try {
        // Pre-load metadata and outline
        const metadata = await fileAnalyzer.analyzeFile(filePath);
        await this.setMetadata(filePath, metadata);
        
        const outline = await fileAnalyzer.createFileOutline(filePath);
        await this.setOutline(filePath, outline);
      } catch (error) {
        console.warn(`Failed to warm cache for ${filePath}:`, error);
      }
    }
  }

  // Cleanup expired entries
  async cleanup(): Promise<number> {
    const now = Date.now();
    const keysToDelete: string[] = [];
    
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }

    return keysToDelete.length;
  }

  // Export cache for debugging
  exportCache(): Record<string, any> {
    const exported: Record<string, any> = {};
    
    for (const [key, entry] of this.cache.entries()) {
      exported[key] = {
        timestamp: entry.timestamp,
        hash: entry.hash,
        ttl: entry.ttl,
        accessCount: entry.accessCount,
        lastAccessed: entry.lastAccessed,
        dataSize: JSON.stringify(entry.data).length
      };
    }

    return exported;
  }
}

export const fileCache = new FileCache();
