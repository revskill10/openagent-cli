/**
 * OpenAgent API
 * 
 * Simple API to expose all available functionalities
 */

import { WebRAGTool } from "./tools/web-rag-tool.js";
import { 
  createDistributedTask,
  DistributedPipelineBuilder,
  distributedSystem
} from "./distributed_integration.js";
import { Config, getConfig } from "./simple-config.js";
import { GraphRAGEngine } from "./graphrag/core.js";
import { GraphRAGMCPTools } from "./graphrag/mcp-tools.js";
import { HierarchicalAgentSystem } from "./hierarchical-agent-system.js";
import { modelManager } from "./simple-models.js";

// Core classes and interfaces for easy access
export class OpenAgentCore {
  private ragTool: WebRAGTool | null = null;
  private graphRAG: GraphRAGEngine | null = null;
  private agentSystem: HierarchicalAgentSystem | null = null;

  async initializeRAG(config?: any): Promise<WebRAGTool> {
    if (!this.ragTool) {
      this.ragTool = new WebRAGTool(config || {});
      await this.ragTool.initialize();
    }
    return this.ragTool;
  }

  async initializeGraphRAG(config?: any): Promise<GraphRAGEngine> {
    if (!this.graphRAG) {
      this.graphRAG = new GraphRAGEngine(config || {});
      await this.graphRAG.initialize();
    }
    return this.graphRAG;
  }

  async initializeAgentSystem(config?: Config): Promise<HierarchicalAgentSystem> {
    if (!this.agentSystem) {
      const cfg = config || getConfig();
      await modelManager.initialize(cfg);
      this.agentSystem = new HierarchicalAgentSystem(cfg.concurrency);
      await this.agentSystem.initialize(cfg);
    }
    return this.agentSystem;
  }

  // Distributed system access
  async createDistributedTask(taskDefinition: any) {
    return createDistributedTask(taskDefinition);
  }

  getDistributedSystem() {
    return distributedSystem;
  }

  async cleanup(): Promise<void> {
    if (this.agentSystem) {
      await this.agentSystem.cleanup();
    }
  }
}

// Factory function for easy instantiation
export function createOpenAgentCore(config?: any): OpenAgentCore {
  return new OpenAgentCore();
}

// Direct exports for advanced usage
export { WebRAGTool } from "./tools/web-rag-tool.js";
export { HierarchicalAgentSystem } from "./hierarchical-agent-system.js";
export { modelManager } from "./simple-models.js";

// Distributed system exports
export { 
  createDistributedTask,
  DistributedPipelineBuilder,
  distributedSystem
} from "./distributed_integration.js";

// GraphRAG exports
export { GraphRAGEngine } from "./graphrag/core.js";
export { GraphRAGMCPTools } from "./graphrag/mcp-tools.js";

// Config exports
export { Config, getConfig } from "./simple-config.js";

// Default export for convenience
export default OpenAgentCore;