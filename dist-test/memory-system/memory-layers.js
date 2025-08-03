// memory-layers.ts - Multi-layer memory system with persistent storage
import { promises as fs } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { KnowledgeGraph } from './knowledge-graph.js';
export class MemorySystem {
    layers = new Map();
    entries = new Map();
    layerContents = new Map();
    consolidationRules = [];
    storageDir;
    knowledgeGraph;
    constructor(storageDir = '.memory') {
        this.storageDir = storageDir;
        this.knowledgeGraph = new KnowledgeGraph();
        this.initializeDefaultLayers();
        this.initializeConsolidationRules();
    }
    async initialize() {
        // Ensure storage directory exists
        await this.ensureStorageDir();
        // Load persistent layers from disk
        await this.loadPersistentLayers();
        // Start background consolidation process
        this.startConsolidationProcess();
    }
    async store(content, type, metadata = {}, targetLayer) {
        const id = this.generateEntryId(content, type);
        // Determine target layer
        const layer = targetLayer || this.selectOptimalLayer(type, metadata.importance || 0.5);
        const entry = {
            id,
            content,
            layer,
            metadata: {
                type,
                importance: metadata.importance || 0.5,
                accessCount: 0,
                createdAt: new Date(),
                lastAccessed: new Date(),
                expiresAt: this.calculateExpirationDate(layer),
                tags: metadata.tags || [],
                source: metadata.source || 'unknown',
                context: metadata.context || {}
            }
        };
        // Store in memory
        this.entries.set(id, entry);
        // Add to layer
        const layerContents = this.layerContents.get(layer) || new Set();
        layerContents.add(id);
        this.layerContents.set(layer, layerContents);
        // Persist if layer requires it
        const layerConfig = this.layers.get(layer);
        if (layerConfig && layerConfig.storage !== 'memory') {
            await this.persistEntry(entry);
        }
        // Add to knowledge graph if applicable
        if (type === 'chunk' || type === 'node' || type === 'edge') {
            await this.addToKnowledgeGraph(entry);
        }
        // Check layer capacity and evict if necessary
        await this.enforceLayerCapacity(layer);
        return id;
    }
    async retrieve(query) {
        const startTime = Date.now();
        const searchLayers = query.layers || Array.from(this.layers.keys());
        const results = [];
        for (const layerName of searchLayers) {
            const layerEntries = await this.searchLayer(layerName, query);
            results.push(...layerEntries);
        }
        // Remove duplicates and sort by relevance
        const uniqueResults = this.deduplicateResults(results);
        const sortedResults = this.sortByRelevance(uniqueResults, query);
        const limitedResults = sortedResults.slice(0, query.maxResults || 50);
        // Update access counts
        for (const entry of limitedResults) {
            entry.metadata.lastAccessed = new Date();
            entry.metadata.accessCount++;
        }
        return {
            entries: limitedResults,
            metadata: {
                queryTime: Date.now() - startTime,
                layersSearched: searchLayers,
                totalResults: limitedResults.length,
                relevanceScore: this.calculateAverageRelevance(limitedResults, query)
            }
        };
    }
    async consolidate() {
        console.log('Starting memory consolidation...');
        for (const rule of this.consolidationRules) {
            try {
                const allEntries = Array.from(this.entries.values());
                if (rule.condition(allEntries)) {
                    console.log(`Applying consolidation rule: ${rule.name}`);
                    const consolidatedEntries = await rule.action(allEntries);
                    // Update entries
                    for (const entry of consolidatedEntries) {
                        this.entries.set(entry.id, entry);
                    }
                }
            }
            catch (error) {
                console.error(`Error applying consolidation rule ${rule.name}:`, error);
            }
        }
        // Clean up expired entries
        await this.cleanupExpiredEntries();
        console.log('Memory consolidation completed');
    }
    async getMemoryStatistics() {
        const stats = {
            totalEntries: this.entries.size,
            layerStats: new Map(),
            typeDistribution: new Map(),
            averageImportance: 0,
            memoryUsage: 0,
            knowledgeGraphStats: this.knowledgeGraph.getStatistics()
        };
        let totalImportance = 0;
        let memoryUsage = 0;
        // Calculate layer statistics
        for (const [layerName, layer] of this.layers.entries()) {
            const layerEntries = this.layerContents.get(layerName) || new Set();
            const layerEntriesArray = Array.from(layerEntries).map(id => this.entries.get(id)).filter(Boolean);
            stats.layerStats.set(layerName, {
                entryCount: layerEntries.size,
                capacity: layer.capacity,
                utilizationPercentage: (layerEntries.size / layer.capacity) * 100,
                averageImportance: layerEntriesArray.reduce((sum, e) => sum + e.metadata.importance, 0) / layerEntriesArray.length || 0,
                oldestEntry: layerEntriesArray.reduce((oldest, e) => !oldest || e.metadata.createdAt < oldest.metadata.createdAt ? e : oldest, null)?.metadata.createdAt,
                newestEntry: layerEntriesArray.reduce((newest, e) => !newest || e.metadata.createdAt > newest.metadata.createdAt ? e : newest, null)?.metadata.createdAt
            });
        }
        // Calculate type distribution and other stats
        for (const entry of this.entries.values()) {
            const currentCount = stats.typeDistribution.get(entry.metadata.type) || 0;
            stats.typeDistribution.set(entry.metadata.type, currentCount + 1);
            totalImportance += entry.metadata.importance;
            memoryUsage += this.estimateEntrySize(entry);
        }
        stats.averageImportance = this.entries.size > 0 ? totalImportance / this.entries.size : 0;
        stats.memoryUsage = memoryUsage;
        return stats;
    }
    initializeDefaultLayers() {
        // Working memory - very short term, high capacity
        this.layers.set('working', {
            name: 'Working Memory',
            type: 'working',
            capacity: 1000,
            ttl: 5 * 60 * 1000, // 5 minutes
            priority: 1,
            storage: 'memory'
        });
        // Short-term memory - current session
        this.layers.set('short_term', {
            name: 'Short-term Memory',
            type: 'short_term',
            capacity: 5000,
            ttl: 60 * 60 * 1000, // 1 hour
            priority: 2,
            storage: 'memory'
        });
        // Medium-term memory - project context
        this.layers.set('medium_term', {
            name: 'Medium-term Memory',
            type: 'medium_term',
            capacity: 10000,
            ttl: 24 * 60 * 60 * 1000, // 24 hours
            priority: 3,
            storage: 'file'
        });
        // Long-term memory - accumulated knowledge
        this.layers.set('long_term', {
            name: 'Long-term Memory',
            type: 'long_term',
            capacity: 50000,
            ttl: 30 * 24 * 60 * 60 * 1000, // 30 days
            priority: 4,
            storage: 'file'
        });
        // Episodic memory - specific events and experiences
        this.layers.set('episodic', {
            name: 'Episodic Memory',
            type: 'episodic',
            capacity: 20000,
            ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
            priority: 3,
            storage: 'file'
        });
        // Semantic memory - general knowledge and patterns
        this.layers.set('semantic', {
            name: 'Semantic Memory',
            type: 'semantic',
            capacity: 100000,
            ttl: 90 * 24 * 60 * 60 * 1000, // 90 days
            priority: 5,
            storage: 'file'
        });
        // Initialize layer contents
        for (const layerName of this.layers.keys()) {
            this.layerContents.set(layerName, new Set());
        }
    }
    initializeConsolidationRules() {
        // Promote important short-term memories to medium-term
        this.consolidationRules.push({
            name: 'promote_important_memories',
            condition: (entries) => {
                return entries.some(e => e.layer === 'short_term' &&
                    e.metadata.importance > 0.8 &&
                    e.metadata.accessCount > 3);
            },
            action: async (entries) => {
                const toPromote = entries.filter(e => e.layer === 'short_term' &&
                    e.metadata.importance > 0.8 &&
                    e.metadata.accessCount > 3);
                for (const entry of toPromote) {
                    entry.layer = 'medium_term';
                    entry.metadata.expiresAt = this.calculateExpirationDate('medium_term');
                    // Move between layer contents
                    this.layerContents.get('short_term')?.delete(entry.id);
                    this.layerContents.get('medium_term')?.add(entry.id);
                }
                return entries;
            },
            priority: 8,
            frequency: 10 * 60 * 1000 // Every 10 minutes
        });
        // Consolidate similar memories
        this.consolidationRules.push({
            name: 'consolidate_similar_memories',
            condition: (entries) => {
                return entries.length > 100; // Only run when we have enough entries
            },
            action: async (entries) => {
                const groups = this.groupSimilarEntries(entries);
                const consolidated = [];
                for (const group of groups) {
                    if (group.length > 1) {
                        const consolidatedEntry = await this.consolidateEntryGroup(group);
                        consolidated.push(consolidatedEntry);
                        // Remove original entries
                        for (const entry of group) {
                            this.entries.delete(entry.id);
                            this.layerContents.get(entry.layer)?.delete(entry.id);
                        }
                    }
                    else {
                        consolidated.push(group[0]);
                    }
                }
                return consolidated;
            },
            priority: 5,
            frequency: 60 * 60 * 1000 // Every hour
        });
        // Archive old medium-term memories to long-term
        this.consolidationRules.push({
            name: 'archive_old_memories',
            condition: (entries) => {
                const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
                return entries.some(e => e.layer === 'medium_term' &&
                    e.metadata.createdAt < oneDayAgo &&
                    e.metadata.importance > 0.6);
            },
            action: async (entries) => {
                const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
                const toArchive = entries.filter(e => e.layer === 'medium_term' &&
                    e.metadata.createdAt < oneDayAgo &&
                    e.metadata.importance > 0.6);
                for (const entry of toArchive) {
                    entry.layer = 'long_term';
                    entry.metadata.expiresAt = this.calculateExpirationDate('long_term');
                    // Move between layer contents
                    this.layerContents.get('medium_term')?.delete(entry.id);
                    this.layerContents.get('long_term')?.add(entry.id);
                }
                return entries;
            },
            priority: 6,
            frequency: 60 * 60 * 1000 // Every hour
        });
    }
    selectOptimalLayer(type, importance) {
        // Route different types to appropriate layers
        if (type === 'context' || importance < 0.3) {
            return 'working';
        }
        else if (type === 'error' || type === 'solution' || importance > 0.8) {
            return 'medium_term';
        }
        else if (type === 'pattern' || type === 'workflow') {
            return 'semantic';
        }
        else if (importance > 0.6) {
            return 'short_term';
        }
        else {
            return 'working';
        }
    }
    calculateExpirationDate(layerName) {
        const layer = this.layers.get(layerName);
        if (!layer || layer.ttl === 0)
            return undefined;
        return new Date(Date.now() + layer.ttl);
    }
    async searchLayer(layerName, query) {
        const layerEntries = this.layerContents.get(layerName) || new Set();
        const results = [];
        for (const entryId of layerEntries) {
            const entry = this.entries.get(entryId);
            if (!entry)
                continue;
            // Check if entry matches query criteria
            if (this.matchesQuery(entry, query)) {
                results.push(entry);
            }
        }
        return results;
    }
    matchesQuery(entry, query) {
        // Type filter
        if (query.types && !query.types.includes(entry.metadata.type)) {
            return false;
        }
        // Time range filter
        if (query.timeRange) {
            if (entry.metadata.createdAt < query.timeRange.start ||
                entry.metadata.createdAt > query.timeRange.end) {
                return false;
            }
        }
        // Importance filter
        if (query.importance) {
            if (entry.metadata.importance < query.importance.min ||
                entry.metadata.importance > query.importance.max) {
                return false;
            }
        }
        // Expiration filter
        if (!query.includeExpired && entry.metadata.expiresAt &&
            entry.metadata.expiresAt < new Date()) {
            return false;
        }
        // Text search
        if (query.query) {
            const searchText = query.query.toLowerCase();
            const entryText = JSON.stringify(entry.content).toLowerCase();
            const tagsText = entry.metadata.tags.join(' ').toLowerCase();
            if (!entryText.includes(searchText) && !tagsText.includes(searchText)) {
                return false;
            }
        }
        return true;
    }
    deduplicateResults(results) {
        const seen = new Set();
        return results.filter(entry => {
            if (seen.has(entry.id)) {
                return false;
            }
            seen.add(entry.id);
            return true;
        });
    }
    sortByRelevance(results, query) {
        return results.sort((a, b) => {
            const scoreA = this.calculateRelevanceScore(a, query);
            const scoreB = this.calculateRelevanceScore(b, query);
            return scoreB - scoreA;
        });
    }
    calculateRelevanceScore(entry, query) {
        let score = entry.metadata.importance;
        // Boost score for recent access
        const daysSinceAccess = (Date.now() - entry.metadata.lastAccessed.getTime()) / (24 * 60 * 60 * 1000);
        score += Math.max(0, 0.5 - daysSinceAccess * 0.1);
        // Boost score for frequent access
        score += Math.min(0.3, entry.metadata.accessCount * 0.01);
        // Text relevance
        if (query.query) {
            const textRelevance = this.calculateTextRelevance(entry, query.query);
            score += textRelevance * 0.4;
        }
        return Math.max(0, Math.min(1, score));
    }
    calculateTextRelevance(entry, queryText) {
        const entryText = JSON.stringify(entry.content).toLowerCase();
        const queryWords = queryText.toLowerCase().split(/\s+/);
        let matches = 0;
        for (const word of queryWords) {
            if (entryText.includes(word)) {
                matches++;
            }
        }
        return queryWords.length > 0 ? matches / queryWords.length : 0;
    }
    calculateAverageRelevance(results, query) {
        if (results.length === 0)
            return 0;
        const totalRelevance = results.reduce((sum, entry) => sum + this.calculateRelevanceScore(entry, query), 0);
        return totalRelevance / results.length;
    }
    async enforceLayerCapacity(layerName) {
        const layer = this.layers.get(layerName);
        const layerEntries = this.layerContents.get(layerName);
        if (!layer || !layerEntries || layerEntries.size <= layer.capacity) {
            return;
        }
        // Get entries sorted by importance and access time
        const entries = Array.from(layerEntries)
            .map(id => this.entries.get(id))
            .filter(Boolean)
            .sort((a, b) => {
            // Sort by importance (descending) then by last access (ascending)
            const importanceDiff = b.metadata.importance - a.metadata.importance;
            if (Math.abs(importanceDiff) > 0.1)
                return importanceDiff;
            return a.metadata.lastAccessed.getTime() - b.metadata.lastAccessed.getTime();
        });
        // Remove least important/oldest entries
        const toRemove = entries.slice(layer.capacity);
        for (const entry of toRemove) {
            this.entries.delete(entry.id);
            layerEntries.delete(entry.id);
            // Remove from persistent storage if applicable
            if (layer.storage !== 'memory') {
                await this.removePersistedEntry(entry.id);
            }
        }
    }
    async cleanupExpiredEntries() {
        const now = new Date();
        const expiredEntries = [];
        for (const entry of this.entries.values()) {
            if (entry.metadata.expiresAt && entry.metadata.expiresAt < now) {
                expiredEntries.push(entry);
            }
        }
        for (const entry of expiredEntries) {
            this.entries.delete(entry.id);
            this.layerContents.get(entry.layer)?.delete(entry.id);
            const layer = this.layers.get(entry.layer);
            if (layer && layer.storage !== 'memory') {
                await this.removePersistedEntry(entry.id);
            }
        }
        console.log(`Cleaned up ${expiredEntries.length} expired entries`);
    }
    groupSimilarEntries(entries) {
        // Simple grouping by content similarity
        const groups = [];
        const processed = new Set();
        for (const entry of entries) {
            if (processed.has(entry.id))
                continue;
            const group = [entry];
            processed.add(entry.id);
            for (const other of entries) {
                if (processed.has(other.id) || entry.id === other.id)
                    continue;
                if (this.areEntriesSimilar(entry, other)) {
                    group.push(other);
                    processed.add(other.id);
                }
            }
            groups.push(group);
        }
        return groups;
    }
    areEntriesSimilar(entry1, entry2) {
        // Check type similarity
        if (entry1.metadata.type !== entry2.metadata.type)
            return false;
        // Check tag similarity
        const tags1 = new Set(entry1.metadata.tags);
        const tags2 = new Set(entry2.metadata.tags);
        const tagIntersection = new Set([...tags1].filter(tag => tags2.has(tag)));
        const tagSimilarity = tagIntersection.size / Math.max(tags1.size, tags2.size, 1);
        // Check content similarity (simplified)
        const content1 = JSON.stringify(entry1.content).toLowerCase();
        const content2 = JSON.stringify(entry2.content).toLowerCase();
        const contentSimilarity = this.calculateStringSimilarity(content1, content2);
        return tagSimilarity > 0.5 || contentSimilarity > 0.7;
    }
    calculateStringSimilarity(str1, str2) {
        const words1 = new Set(str1.split(/\s+/));
        const words2 = new Set(str2.split(/\s+/));
        const intersection = new Set([...words1].filter(word => words2.has(word)));
        const union = new Set([...words1, ...words2]);
        return union.size > 0 ? intersection.size / union.size : 0;
    }
    async consolidateEntryGroup(group) {
        // Create a consolidated entry from the group
        const mostImportant = group.reduce((prev, current) => current.metadata.importance > prev.metadata.importance ? current : prev);
        const consolidatedContent = {
            primary: mostImportant.content,
            alternatives: group.filter(e => e.id !== mostImportant.id).map(e => e.content),
            consolidatedFrom: group.map(e => e.id)
        };
        const consolidatedEntry = {
            id: this.generateEntryId(consolidatedContent, mostImportant.metadata.type),
            content: consolidatedContent,
            layer: mostImportant.layer,
            metadata: {
                ...mostImportant.metadata,
                importance: Math.max(...group.map(e => e.metadata.importance)),
                accessCount: group.reduce((sum, e) => sum + e.metadata.accessCount, 0),
                tags: [...new Set(group.flatMap(e => e.metadata.tags))],
                context: {
                    ...mostImportant.metadata.context,
                    consolidatedCount: group.length,
                    consolidatedAt: new Date()
                }
            }
        };
        return consolidatedEntry;
    }
    async addToKnowledgeGraph(entry) {
        if (entry.metadata.type === 'chunk') {
            const chunks = Array.isArray(entry.content) ? entry.content : [entry.content];
            await this.knowledgeGraph.buildFromChunks(chunks);
        }
        else if (entry.metadata.type === 'node') {
            await this.knowledgeGraph.addNode(entry.content);
        }
        else if (entry.metadata.type === 'edge') {
            await this.knowledgeGraph.addEdge(entry.content);
        }
    }
    async ensureStorageDir() {
        try {
            await fs.mkdir(this.storageDir, { recursive: true });
        }
        catch (error) {
            console.error('Failed to create storage directory:', error);
        }
    }
    async loadPersistentLayers() {
        for (const [layerName, layer] of this.layers.entries()) {
            if (layer.storage === 'file') {
                try {
                    const layerFile = join(this.storageDir, `${layerName}.json`);
                    const data = await fs.readFile(layerFile, 'utf-8');
                    const layerData = JSON.parse(data);
                    for (const entryData of layerData.entries) {
                        // Restore dates
                        entryData.metadata.createdAt = new Date(entryData.metadata.createdAt);
                        entryData.metadata.lastAccessed = new Date(entryData.metadata.lastAccessed);
                        if (entryData.metadata.expiresAt) {
                            entryData.metadata.expiresAt = new Date(entryData.metadata.expiresAt);
                        }
                        this.entries.set(entryData.id, entryData);
                        this.layerContents.get(layerName)?.add(entryData.id);
                    }
                    console.log(`Loaded ${layerData.entries.length} entries from ${layerName} layer`);
                }
                catch (error) {
                    // Layer file doesn't exist or is corrupted, start fresh
                    console.log(`No existing data found for ${layerName} layer`);
                }
            }
        }
    }
    async persistEntry(entry) {
        // For now, we'll persist entire layers periodically
        // In a production system, you might want individual entry persistence
    }
    async removePersistedEntry(entryId) {
        // Implementation would remove individual entries from persistent storage
    }
    async savePersistentLayers() {
        for (const [layerName, layer] of this.layers.entries()) {
            if (layer.storage === 'file') {
                try {
                    const layerEntries = this.layerContents.get(layerName) || new Set();
                    const entries = Array.from(layerEntries)
                        .map(id => this.entries.get(id))
                        .filter(Boolean);
                    const layerData = {
                        layer: layerName,
                        savedAt: new Date(),
                        entries
                    };
                    const layerFile = join(this.storageDir, `${layerName}.json`);
                    await fs.writeFile(layerFile, JSON.stringify(layerData, null, 2));
                    console.log(`Saved ${entries.length} entries to ${layerName} layer`);
                }
                catch (error) {
                    console.error(`Failed to save ${layerName} layer:`, error);
                }
            }
        }
    }
    startConsolidationProcess() {
        // Run consolidation rules periodically
        for (const rule of this.consolidationRules) {
            setInterval(async () => {
                try {
                    await this.consolidate();
                }
                catch (error) {
                    console.error('Consolidation error:', error);
                }
            }, rule.frequency);
        }
        // Save persistent layers periodically
        setInterval(async () => {
            try {
                await this.savePersistentLayers();
            }
            catch (error) {
                console.error('Failed to save persistent layers:', error);
            }
        }, 5 * 60 * 1000); // Every 5 minutes
    }
    estimateEntrySize(entry) {
        return JSON.stringify(entry).length * 2; // Rough estimate in bytes
    }
    generateEntryId(content, type) {
        const contentStr = JSON.stringify(content);
        const hash = createHash('md5').update(`${type}:${contentStr}`).digest('hex').slice(0, 12);
        return `mem_${hash}`;
    }
    // Public utility methods
    async shutdown() {
        await this.savePersistentLayers();
        console.log('Memory system shutdown complete');
    }
    getKnowledgeGraph() {
        return this.knowledgeGraph;
    }
    getLayerInfo(layerName) {
        return this.layers.get(layerName);
    }
    getAllLayers() {
        return Array.from(this.layers.values());
    }
}
export const memorySystem = new MemorySystem();
