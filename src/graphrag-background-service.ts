import { conversationPersistence, ConversationSession } from './conversation-persistence.js';

export interface GraphRAGBackgroundConfig {
  updateInterval: number; // milliseconds
  batchSize: number; // number of logs to process at once
  enabled: boolean;
}

export class GraphRAGBackgroundService {
  private config: GraphRAGBackgroundConfig;
  private isRunning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;
  private lastProcessedTimestamp: Date = new Date(0);

  constructor(config: Partial<GraphRAGBackgroundConfig> = {}) {
    this.config = {
      updateInterval: 30000, // 30 seconds
      batchSize: 10,
      enabled: true,
      ...config
    };
  }

  start(): void {
    if (this.isRunning || !this.config.enabled) {
      return;
    }

    this.isRunning = true;
    console.log('🔄 Starting GraphRAG background service...');

    // Initial processing
    this.processNewConversationData();

    // Set up periodic processing
    this.intervalId = setInterval(() => {
      this.processNewConversationData();
    }, this.config.updateInterval);

    console.log(`✅ GraphRAG background service started (interval: ${this.config.updateInterval}ms)`);
  }

  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    console.log('🛑 GraphRAG background service stopped');
  }

  private async processNewConversationData(): Promise<void> {
    try {
      // Get current session
      const currentSession = conversationPersistence.getCurrentSession();
      if (!currentSession) {
        return;
      }

      // Find new logs since last processing
      const newLogs = currentSession.logs.filter(log => 
        new Date(log.timestamp) > this.lastProcessedTimestamp
      );

      if (newLogs.length === 0) {
        return;
      }

      console.log(`🔍 Processing ${newLogs.length} new conversation logs for GraphRAG...`);

      // Process logs in batches
      for (let i = 0; i < newLogs.length; i += this.config.batchSize) {
        const batch = newLogs.slice(i, i + this.config.batchSize);
        await this.processBatch(batch);
      }

      // Update last processed timestamp
      if (newLogs.length > 0) {
        this.lastProcessedTimestamp = new Date(Math.max(
          ...newLogs.map(log => new Date(log.timestamp).getTime())
        ));
      }

      console.log(`✅ Processed ${newLogs.length} logs for GraphRAG`);

    } catch (error) {
      console.warn('⚠️ Error processing conversation data for GraphRAG:', error);
    }
  }

  private async processBatch(logs: any[]): Promise<void> {
    // Extract meaningful content for GraphRAG
    const documents = logs.map(log => ({
      id: `${log.timestamp}_${log.agentId}`,
      content: log.text,
      metadata: {
        agentId: log.agentId,
        type: log.type,
        timestamp: log.timestamp,
        toolName: log.metadata?.toolName,
        success: log.metadata?.success,
        executionTime: log.metadata?.executionTime
      }
    }));

    // Filter out system messages and focus on meaningful content
    const meaningfulDocuments = documents.filter(doc => 
      doc.content.length > 10 && // Minimum content length
      !doc.content.startsWith('🔧') && // Skip tool status messages
      !doc.content.startsWith('📦') && // Skip parser messages
      !doc.content.startsWith('✅') && // Skip completion messages
      doc.metadata.agentId !== 'system' // Skip system messages
    );

    if (meaningfulDocuments.length === 0) {
      return;
    }

    // TODO: Integrate with actual GraphRAG engine
    // For now, we'll simulate the processing
    await this.simulateGraphRAGProcessing(meaningfulDocuments);
  }

  private async simulateGraphRAGProcessing(documents: any[]): Promise<void> {
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 100));

    // Log what would be processed
    console.log(`📊 GraphRAG would process ${documents.length} documents:`);
    documents.forEach(doc => {
      console.log(`   - [${doc.metadata.agentId}] ${doc.content.substring(0, 50)}...`);
    });

    // TODO: Replace with actual GraphRAG integration:
    // 1. Extract entities and relationships
    // 2. Update knowledge graph
    // 3. Generate embeddings
    // 4. Store in vector database
    // 5. Update search indices
  }

  // Method to manually trigger processing (useful for testing)
  async processCurrentSession(): Promise<void> {
    console.log('🔄 Manually triggering GraphRAG processing...');
    this.lastProcessedTimestamp = new Date(0); // Reset to process all logs
    await this.processNewConversationData();
  }

  // Get processing statistics
  getStats(): {
    isRunning: boolean;
    lastProcessedTimestamp: Date;
    config: GraphRAGBackgroundConfig;
  } {
    return {
      isRunning: this.isRunning,
      lastProcessedTimestamp: this.lastProcessedTimestamp,
      config: this.config
    };
  }

  // Update configuration
  updateConfig(newConfig: Partial<GraphRAGBackgroundConfig>): void {
    const wasRunning = this.isRunning;
    
    if (wasRunning) {
      this.stop();
    }

    this.config = { ...this.config, ...newConfig };

    if (wasRunning && this.config.enabled) {
      this.start();
    }

    console.log('⚙️ GraphRAG background service configuration updated');
  }

  // Process all historical sessions (useful for initial setup)
  async processAllSessions(): Promise<void> {
    console.log('🔄 Processing all historical sessions for GraphRAG...');
    
    try {
      const sessions = conversationPersistence.listSessions();
      console.log(`📚 Found ${sessions.length} sessions to process`);

      for (const sessionInfo of sessions) {
        const session = conversationPersistence.loadSession(sessionInfo.id);
        if (session && session.logs.length > 0) {
          console.log(`📖 Processing session ${sessionInfo.id} (${session.logs.length} logs)`);
          
          // Process all logs in this session
          for (let i = 0; i < session.logs.length; i += this.config.batchSize) {
            const batch = session.logs.slice(i, i + this.config.batchSize);
            await this.processBatch(batch);
          }
        }
      }

      console.log('✅ Completed processing all historical sessions');
    } catch (error) {
      console.error('❌ Error processing historical sessions:', error);
    }
  }
}

// Global instance
export const graphRAGBackgroundService = new GraphRAGBackgroundService();
