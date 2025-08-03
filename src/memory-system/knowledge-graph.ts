// knowledge-graph.ts - Graph-based knowledge representation system
import { createHash } from 'crypto';
import { TextChunk } from './text-chunker.js';

export interface KnowledgeNode {
  id: string;
  type: NodeType;
  content: string;
  metadata: NodeMetadata;
  embeddings?: number[];
  properties: Record<string, any>;
}

export interface KnowledgeEdge {
  id: string;
  sourceId: string;
  targetId: string;
  type: EdgeType;
  weight: number;
  metadata: EdgeMetadata;
  properties: Record<string, any>;
}

export interface NodeMetadata {
  label: string;
  category: string;
  importance: number;
  confidence: number;
  createdAt: Date;
  lastAccessed: Date;
  accessCount: number;
  sourceChunks: string[];
  tags: string[];
}

export interface EdgeMetadata {
  label: string;
  confidence: number;
  createdAt: Date;
  lastUpdated: Date;
  evidence: string[];
  context: string;
}

export interface GraphQuery {
  nodeTypes?: NodeType[];
  edgeTypes?: EdgeType[];
  keywords?: string[];
  timeRange?: { start: Date; end: Date };
  importanceThreshold?: number;
  maxDepth?: number;
  maxResults?: number;
}

export interface GraphQueryResult {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  paths: GraphPath[];
  metadata: QueryMetadata;
}

export interface GraphPath {
  nodes: string[];
  edges: string[];
  score: number;
  length: number;
}

export interface QueryMetadata {
  queryTime: number;
  totalNodes: number;
  totalEdges: number;
  relevanceScore: number;
}

export interface GraphStatistics {
  nodeCount: number;
  edgeCount: number;
  nodeTypeDistribution: Record<NodeType, number>;
  edgeTypeDistribution: Record<EdgeType, number>;
  averageDegree: number;
  clusteringCoefficient: number;
  connectedComponents: number;
}

export type NodeType = 
  | 'concept'
  | 'entity'
  | 'function'
  | 'class'
  | 'variable'
  | 'file'
  | 'module'
  | 'command'
  | 'pattern'
  | 'workflow'
  | 'error'
  | 'solution';

export type EdgeType = 
  | 'contains'
  | 'references'
  | 'depends_on'
  | 'similar_to'
  | 'part_of'
  | 'implements'
  | 'extends'
  | 'calls'
  | 'defines'
  | 'uses'
  | 'related_to'
  | 'causes'
  | 'solves';

export class KnowledgeGraph {
  private nodes = new Map<string, KnowledgeNode>();
  private edges = new Map<string, KnowledgeEdge>();
  private nodesByType = new Map<NodeType, Set<string>>();
  private edgesByType = new Map<EdgeType, Set<string>>();
  private adjacencyList = new Map<string, Set<string>>();
  private reverseAdjacencyList = new Map<string, Set<string>>();

  constructor() {
    this.initializeIndexes();
  }

  async addNode(node: Omit<KnowledgeNode, 'id'>): Promise<string> {
    const id = this.generateNodeId(node.content, node.type);
    
    // Check if node already exists
    const existingNode = this.findSimilarNode(node);
    if (existingNode) {
      // Merge with existing node
      return this.mergeNodes(existingNode.id, node);
    }

    const knowledgeNode: KnowledgeNode = {
      id,
      ...node,
      metadata: {
        ...node.metadata,
        createdAt: new Date(),
        lastAccessed: new Date(),
        accessCount: 0
      }
    };

    this.nodes.set(id, knowledgeNode);
    this.indexNode(knowledgeNode);
    
    return id;
  }

  async addEdge(edge: Omit<KnowledgeEdge, 'id'>): Promise<string> {
    const id = this.generateEdgeId(edge.sourceId, edge.targetId, edge.type);
    
    // Check if edge already exists
    const existingEdge = this.edges.get(id);
    if (existingEdge) {
      // Update weight and metadata
      existingEdge.weight = Math.max(existingEdge.weight, edge.weight);
      existingEdge.metadata.lastUpdated = new Date();
      existingEdge.metadata.evidence.push(...(edge.metadata.evidence || []));
      return id;
    }

    const knowledgeEdge: KnowledgeEdge = {
      id,
      ...edge,
      metadata: {
        ...edge.metadata,
        createdAt: new Date(),
        lastUpdated: new Date(),
        evidence: edge.metadata.evidence || []
      }
    };

    this.edges.set(id, knowledgeEdge);
    this.indexEdge(knowledgeEdge);
    this.updateAdjacencyLists(knowledgeEdge);
    
    return id;
  }

  async buildFromChunks(chunks: TextChunk[]): Promise<void> {
    // Extract nodes from chunks
    const nodePromises = chunks.map(chunk => this.extractNodesFromChunk(chunk));
    const chunkNodes = await Promise.all(nodePromises);
    
    // Add all nodes
    const nodeIds: string[] = [];
    for (const nodes of chunkNodes) {
      for (const node of nodes) {
        const nodeId = await this.addNode(node);
        nodeIds.push(nodeId);
      }
    }

    // Extract and add edges
    await this.extractEdgesFromChunks(chunks, nodeIds);
    
    // Build cross-chunk relationships
    await this.buildChunkRelationships(chunks);
  }

  async query(query: GraphQuery): Promise<GraphQueryResult> {
    const startTime = Date.now();
    let candidateNodes = new Set<string>();

    // Filter by node types
    if (query.nodeTypes) {
      for (const nodeType of query.nodeTypes) {
        const typeNodes = this.nodesByType.get(nodeType) || new Set();
        if (candidateNodes.size === 0) {
          candidateNodes = new Set(typeNodes);
        } else {
          candidateNodes = new Set([...candidateNodes].filter(id => typeNodes.has(id)));
        }
      }
    } else {
      candidateNodes = new Set(this.nodes.keys());
    }

    // Filter by keywords
    if (query.keywords) {
      candidateNodes = new Set([...candidateNodes].filter(nodeId => {
        const node = this.nodes.get(nodeId)!;
        return query.keywords!.some(keyword => 
          node.content.toLowerCase().includes(keyword.toLowerCase()) ||
          node.metadata.tags.some(tag => tag.toLowerCase().includes(keyword.toLowerCase()))
        );
      }));
    }

    // Filter by importance threshold
    if (query.importanceThreshold) {
      candidateNodes = new Set([...candidateNodes].filter(nodeId => {
        const node = this.nodes.get(nodeId)!;
        return node.metadata.importance >= query.importanceThreshold!;
      }));
    }

    // Filter by time range
    if (query.timeRange) {
      candidateNodes = new Set([...candidateNodes].filter(nodeId => {
        const node = this.nodes.get(nodeId)!;
        return node.metadata.createdAt >= query.timeRange!.start &&
               node.metadata.createdAt <= query.timeRange!.end;
      }));
    }

    // Get relevant nodes and edges
    const resultNodes = [...candidateNodes]
      .slice(0, query.maxResults || 100)
      .map(id => this.nodes.get(id)!)
      .filter(Boolean);

    const resultEdges = this.getEdgesForNodes(resultNodes.map(n => n.id), query.edgeTypes);
    
    // Find paths between nodes
    const paths = this.findPaths(resultNodes, query.maxDepth || 3);

    // Update access counts
    resultNodes.forEach(node => {
      node.metadata.lastAccessed = new Date();
      node.metadata.accessCount++;
    });

    return {
      nodes: resultNodes,
      edges: resultEdges,
      paths,
      metadata: {
        queryTime: Date.now() - startTime,
        totalNodes: resultNodes.length,
        totalEdges: resultEdges.length,
        relevanceScore: this.calculateRelevanceScore(resultNodes, query)
      }
    };
  }

  async findSimilarNodes(nodeId: string, threshold = 0.7): Promise<KnowledgeNode[]> {
    const targetNode = this.nodes.get(nodeId);
    if (!targetNode) return [];

    const similar: Array<{ node: KnowledgeNode; similarity: number }> = [];

    for (const [id, node] of this.nodes.entries()) {
      if (id === nodeId) continue;
      
      const similarity = this.calculateNodeSimilarity(targetNode, node);
      if (similarity >= threshold) {
        similar.push({ node, similarity });
      }
    }

    return similar
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 10)
      .map(item => item.node);
  }

  async getNodeNeighbors(nodeId: string, depth = 1): Promise<KnowledgeNode[]> {
    const visited = new Set<string>();
    const queue: Array<{ id: string; currentDepth: number }> = [{ id: nodeId, currentDepth: 0 }];
    const neighbors: KnowledgeNode[] = [];

    while (queue.length > 0) {
      const { id, currentDepth } = queue.shift()!;
      
      if (visited.has(id) || currentDepth > depth) continue;
      visited.add(id);

      if (currentDepth > 0) {
        const node = this.nodes.get(id);
        if (node) neighbors.push(node);
      }

      if (currentDepth < depth) {
        const adjacentIds = this.adjacencyList.get(id) || new Set();
        for (const adjacentId of adjacentIds) {
          if (!visited.has(adjacentId)) {
            queue.push({ id: adjacentId, currentDepth: currentDepth + 1 });
          }
        }
      }
    }

    return neighbors;
  }

  getStatistics(): GraphStatistics {
    const nodeTypeDistribution: Record<NodeType, number> = {} as any;
    const edgeTypeDistribution: Record<EdgeType, number> = {} as any;

    // Count node types
    for (const [type, nodeSet] of this.nodesByType.entries()) {
      nodeTypeDistribution[type] = nodeSet.size;
    }

    // Count edge types
    for (const [type, edgeSet] of this.edgesByType.entries()) {
      edgeTypeDistribution[type] = edgeSet.size;
    }

    // Calculate average degree
    const totalDegree = Array.from(this.adjacencyList.values())
      .reduce((sum, neighbors) => sum + neighbors.size, 0);
    const averageDegree = this.nodes.size > 0 ? totalDegree / this.nodes.size : 0;

    // Calculate clustering coefficient (simplified)
    const clusteringCoefficient = this.calculateClusteringCoefficient();

    // Count connected components
    const connectedComponents = this.countConnectedComponents();

    return {
      nodeCount: this.nodes.size,
      edgeCount: this.edges.size,
      nodeTypeDistribution,
      edgeTypeDistribution,
      averageDegree,
      clusteringCoefficient,
      connectedComponents
    };
  }

  private async extractNodesFromChunk(chunk: TextChunk): Promise<Array<Omit<KnowledgeNode, 'id'>>> {
    const nodes: Array<Omit<KnowledgeNode, 'id'>> = [];

    // Extract entities as nodes
    for (const entity of chunk.metadata.entities) {
      nodes.push({
        type: this.mapEntityTypeToNodeType(entity.type),
        content: entity.text,
        metadata: {
          label: entity.text,
          category: entity.type,
          importance: chunk.metadata.importance,
          confidence: entity.confidence,
          createdAt: new Date(),
          lastAccessed: new Date(),
          accessCount: 0,
          sourceChunks: [chunk.id],
          tags: chunk.metadata.keywords
        },
        properties: {
          entityType: entity.type,
          chunkId: chunk.id,
          startIndex: entity.startIndex,
          endIndex: entity.endIndex
        }
      });
    }

    // Extract concepts from keywords
    for (const keyword of chunk.metadata.keywords) {
      nodes.push({
        type: 'concept',
        content: keyword,
        metadata: {
          label: keyword,
          category: 'keyword',
          importance: chunk.metadata.importance * 0.7,
          confidence: 0.6,
          createdAt: new Date(),
          lastAccessed: new Date(),
          accessCount: 0,
          sourceChunks: [chunk.id],
          tags: [keyword]
        },
        properties: {
          chunkId: chunk.id,
          frequency: 1
        }
      });
    }

    return nodes;
  }

  private async extractEdgesFromChunks(chunks: TextChunk[], nodeIds: string[]): Promise<void> {
    for (const chunk of chunks) {
      // Find nodes that belong to this chunk
      const chunkNodes = nodeIds.filter(nodeId => {
        const node = this.nodes.get(nodeId);
        return node?.properties.chunkId === chunk.id;
      });

      // Create edges between entities in the same chunk
      for (let i = 0; i < chunkNodes.length; i++) {
        for (let j = i + 1; j < chunkNodes.length; j++) {
          const sourceNode = this.nodes.get(chunkNodes[i])!;
          const targetNode = this.nodes.get(chunkNodes[j])!;

          await this.addEdge({
            sourceId: sourceNode.id,
            targetId: targetNode.id,
            type: 'related_to',
            weight: 0.5,
            metadata: {
              label: 'co-occurrence',
              confidence: 0.6,
              createdAt: new Date(),
              lastUpdated: new Date(),
              evidence: [chunk.id],
              context: chunk.content.substring(0, 100)
            },
            properties: {
              chunkId: chunk.id,
              cooccurrence: true
            }
          });
        }
      }
    }
  }

  private async buildChunkRelationships(chunks: TextChunk[]): Promise<void> {
    // Build relationships based on chunk relationships
    for (const chunk of chunks) {
      for (const relationship of chunk.relationships) {
        const sourceChunkNodes = this.getNodesForChunk(chunk.id);
        const targetChunkNodes = this.getNodesForChunk(relationship.targetChunkId);

        for (const sourceNodeId of sourceChunkNodes) {
          for (const targetNodeId of targetChunkNodes) {
            await this.addEdge({
              sourceId: sourceNodeId,
              targetId: targetNodeId,
              type: this.mapRelationshipTypeToEdgeType(relationship.type),
              weight: relationship.strength,
              metadata: {
                label: relationship.type,
                confidence: relationship.strength,
                createdAt: new Date(),
                lastUpdated: new Date(),
                evidence: [chunk.id, relationship.targetChunkId],
                context: relationship.context || ''
              },
              properties: {
                chunkRelationship: true,
                relationshipType: relationship.type
              }
            });
          }
        }
      }
    }
  }

  private findSimilarNode(node: Omit<KnowledgeNode, 'id'>): KnowledgeNode | null {
    for (const existingNode of this.nodes.values()) {
      if (existingNode.type === node.type && 
          existingNode.content.toLowerCase() === node.content.toLowerCase()) {
        return existingNode;
      }
    }
    return null;
  }

  private mergeNodes(existingId: string, newNode: Omit<KnowledgeNode, 'id'>): string {
    const existing = this.nodes.get(existingId)!;
    
    // Merge metadata
    existing.metadata.importance = Math.max(existing.metadata.importance, newNode.metadata.importance);
    existing.metadata.confidence = Math.max(existing.metadata.confidence, newNode.metadata.confidence);
    existing.metadata.sourceChunks.push(...newNode.metadata.sourceChunks);
    existing.metadata.tags = [...new Set([...existing.metadata.tags, ...newNode.metadata.tags])];
    
    // Merge properties
    Object.assign(existing.properties, newNode.properties);
    
    return existingId;
  }

  private initializeIndexes(): void {
    // Initialize type indexes
    const nodeTypes: NodeType[] = ['concept', 'entity', 'function', 'class', 'variable', 'file', 'module', 'command', 'pattern', 'workflow', 'error', 'solution'];
    const edgeTypes: EdgeType[] = ['contains', 'references', 'depends_on', 'similar_to', 'part_of', 'implements', 'extends', 'calls', 'defines', 'uses', 'related_to', 'causes', 'solves'];
    
    nodeTypes.forEach(type => this.nodesByType.set(type, new Set()));
    edgeTypes.forEach(type => this.edgesByType.set(type, new Set()));
  }

  private indexNode(node: KnowledgeNode): void {
    const typeSet = this.nodesByType.get(node.type) || new Set();
    typeSet.add(node.id);
    this.nodesByType.set(node.type, typeSet);
    
    // Initialize adjacency lists
    if (!this.adjacencyList.has(node.id)) {
      this.adjacencyList.set(node.id, new Set());
    }
    if (!this.reverseAdjacencyList.has(node.id)) {
      this.reverseAdjacencyList.set(node.id, new Set());
    }
  }

  private indexEdge(edge: KnowledgeEdge): void {
    const typeSet = this.edgesByType.get(edge.type) || new Set();
    typeSet.add(edge.id);
    this.edgesByType.set(edge.type, typeSet);
  }

  private updateAdjacencyLists(edge: KnowledgeEdge): void {
    // Forward adjacency
    const sourceAdjacent = this.adjacencyList.get(edge.sourceId) || new Set();
    sourceAdjacent.add(edge.targetId);
    this.adjacencyList.set(edge.sourceId, sourceAdjacent);
    
    // Reverse adjacency
    const targetAdjacent = this.reverseAdjacencyList.get(edge.targetId) || new Set();
    targetAdjacent.add(edge.sourceId);
    this.reverseAdjacencyList.set(edge.targetId, targetAdjacent);
  }

  private getEdgesForNodes(nodeIds: string[], edgeTypes?: EdgeType[]): KnowledgeEdge[] {
    const edges: KnowledgeEdge[] = [];
    const nodeIdSet = new Set(nodeIds);

    for (const edge of this.edges.values()) {
      if (nodeIdSet.has(edge.sourceId) || nodeIdSet.has(edge.targetId)) {
        if (!edgeTypes || edgeTypes.includes(edge.type)) {
          edges.push(edge);
        }
      }
    }

    return edges;
  }

  private findPaths(nodes: KnowledgeNode[], maxDepth: number): GraphPath[] {
    const paths: GraphPath[] = [];
    
    // Find paths between all pairs of nodes (limited for performance)
    for (let i = 0; i < Math.min(nodes.length, 5); i++) {
      for (let j = i + 1; j < Math.min(nodes.length, 5); j++) {
        const path = this.findShortestPath(nodes[i].id, nodes[j].id, maxDepth);
        if (path) {
          paths.push(path);
        }
      }
    }

    return paths.sort((a, b) => b.score - a.score).slice(0, 10);
  }

  private findShortestPath(startId: string, endId: string, maxDepth: number): GraphPath | null {
    const queue: Array<{ nodeId: string; path: string[]; edges: string[]; depth: number }> = [
      { nodeId: startId, path: [startId], edges: [], depth: 0 }
    ];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const { nodeId, path, edges, depth } = queue.shift()!;
      
      if (visited.has(nodeId) || depth > maxDepth) continue;
      visited.add(nodeId);

      if (nodeId === endId && path.length > 1) {
        return {
          nodes: path,
          edges,
          score: this.calculatePathScore(path, edges),
          length: path.length - 1
        };
      }

      const neighbors = this.adjacencyList.get(nodeId) || new Set();
      for (const neighborId of neighbors) {
        if (!visited.has(neighborId)) {
          const edgeId = this.findEdgeId(nodeId, neighborId);
          if (edgeId) {
            queue.push({
              nodeId: neighborId,
              path: [...path, neighborId],
              edges: [...edges, edgeId],
              depth: depth + 1
            });
          }
        }
      }
    }

    return null;
  }

  private calculateNodeSimilarity(node1: KnowledgeNode, node2: KnowledgeNode): number {
    if (node1.type !== node2.type) return 0;

    // Content similarity
    const content1 = node1.content.toLowerCase();
    const content2 = node2.content.toLowerCase();
    const contentSim = this.calculateStringSimilarity(content1, content2);

    // Tag similarity
    const tags1 = new Set(node1.metadata.tags);
    const tags2 = new Set(node2.metadata.tags);
    const tagIntersection = new Set([...tags1].filter(tag => tags2.has(tag)));
    const tagUnion = new Set([...tags1, ...tags2]);
    const tagSim = tagUnion.size > 0 ? tagIntersection.size / tagUnion.size : 0;

    return (contentSim * 0.7) + (tagSim * 0.3);
  }

  private calculateStringSimilarity(str1: string, str2: string): number {
    // Simple Jaccard similarity on words
    const words1 = new Set(str1.split(/\s+/));
    const words2 = new Set(str2.split(/\s+/));
    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  private calculatePathScore(nodeIds: string[], edgeIds: string[]): number {
    let score = 0;
    
    // Score based on node importance
    for (const nodeId of nodeIds) {
      const node = this.nodes.get(nodeId);
      if (node) {
        score += node.metadata.importance;
      }
    }
    
    // Score based on edge weights
    for (const edgeId of edgeIds) {
      const edge = this.edges.get(edgeId);
      if (edge) {
        score += edge.weight;
      }
    }
    
    // Normalize by path length
    return score / Math.max(nodeIds.length + edgeIds.length, 1);
  }

  private calculateRelevanceScore(nodes: KnowledgeNode[], query: GraphQuery): number {
    if (nodes.length === 0) return 0;
    
    let totalRelevance = 0;
    
    for (const node of nodes) {
      let nodeRelevance = node.metadata.importance;
      
      // Boost relevance for keyword matches
      if (query.keywords) {
        const keywordMatches = query.keywords.filter(keyword =>
          node.content.toLowerCase().includes(keyword.toLowerCase()) ||
          node.metadata.tags.some(tag => tag.toLowerCase().includes(keyword.toLowerCase()))
        );
        nodeRelevance += keywordMatches.length * 0.2;
      }
      
      totalRelevance += nodeRelevance;
    }
    
    return totalRelevance / nodes.length;
  }

  private calculateClusteringCoefficient(): number {
    // Simplified clustering coefficient calculation
    let totalCoefficient = 0;
    let nodeCount = 0;

    for (const [nodeId, neighbors] of this.adjacencyList.entries()) {
      if (neighbors.size < 2) continue;

      let triangles = 0;
      const neighborArray = Array.from(neighbors);
      
      for (let i = 0; i < neighborArray.length; i++) {
        for (let j = i + 1; j < neighborArray.length; j++) {
          const neighbor1 = neighborArray[i];
          const neighbor2 = neighborArray[j];
          
          if (this.adjacencyList.get(neighbor1)?.has(neighbor2)) {
            triangles++;
          }
        }
      }
      
      const possibleTriangles = (neighbors.size * (neighbors.size - 1)) / 2;
      totalCoefficient += possibleTriangles > 0 ? triangles / possibleTriangles : 0;
      nodeCount++;
    }

    return nodeCount > 0 ? totalCoefficient / nodeCount : 0;
  }

  private countConnectedComponents(): number {
    const visited = new Set<string>();
    let components = 0;

    for (const nodeId of this.nodes.keys()) {
      if (!visited.has(nodeId)) {
        this.dfsVisit(nodeId, visited);
        components++;
      }
    }

    return components;
  }

  private dfsVisit(nodeId: string, visited: Set<string>): void {
    visited.add(nodeId);
    
    const neighbors = this.adjacencyList.get(nodeId) || new Set();
    for (const neighborId of neighbors) {
      if (!visited.has(neighborId)) {
        this.dfsVisit(neighborId, visited);
      }
    }
  }

  private getNodesForChunk(chunkId: string): string[] {
    return Array.from(this.nodes.entries())
      .filter(([_, node]) => node.properties.chunkId === chunkId)
      .map(([id, _]) => id);
  }

  private findEdgeId(sourceId: string, targetId: string): string | null {
    for (const edge of this.edges.values()) {
      if (edge.sourceId === sourceId && edge.targetId === targetId) {
        return edge.id;
      }
    }
    return null;
  }

  private mapEntityTypeToNodeType(entityType: string): NodeType {
    const mapping: Record<string, NodeType> = {
      'function': 'function',
      'class': 'class',
      'variable': 'variable',
      'file': 'file',
      'person': 'entity',
      'organization': 'entity',
      'location': 'entity',
      'concept': 'concept'
    };
    
    return mapping[entityType] || 'entity';
  }

  private mapRelationshipTypeToEdgeType(relationshipType: string): EdgeType {
    const mapping: Record<string, EdgeType> = {
      'sequential': 'related_to',
      'semantic_similarity': 'similar_to',
      'entity_reference': 'references',
      'code_dependency': 'depends_on',
      'hierarchical': 'part_of'
    };
    
    return mapping[relationshipType] || 'related_to';
  }

  private generateNodeId(content: string, type: NodeType): string {
    const hash = createHash('md5').update(`${type}:${content}`).digest('hex').slice(0, 12);
    return `node_${hash}`;
  }

  private generateEdgeId(sourceId: string, targetId: string, type: EdgeType): string {
    const hash = createHash('md5').update(`${sourceId}:${targetId}:${type}`).digest('hex').slice(0, 12);
    return `edge_${hash}`;
  }

  // Public utility methods
  getNode(id: string): KnowledgeNode | undefined {
    return this.nodes.get(id);
  }

  getEdge(id: string): KnowledgeEdge | undefined {
    return this.edges.get(id);
  }

  getAllNodes(): KnowledgeNode[] {
    return Array.from(this.nodes.values());
  }

  getAllEdges(): KnowledgeEdge[] {
    return Array.from(this.edges.values());
  }

  clear(): void {
    this.nodes.clear();
    this.edges.clear();
    this.nodesByType.clear();
    this.edgesByType.clear();
    this.adjacencyList.clear();
    this.reverseAdjacencyList.clear();
    this.initializeIndexes();
  }
}

export const knowledgeGraph = new KnowledgeGraph();
