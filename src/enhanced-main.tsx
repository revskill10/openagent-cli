#!/usr/bin/env node
// enhanced-main.tsx - Enhanced OpenAgent with intelligent file reading and multi-panel UI
import React from 'react';
import { render } from 'ink';
import { EnhancedUI } from './enhanced-ui.js';
import { unifiedToolRegistry } from './tools/unified-tool-registry.js';
import { fileCache } from './intelligent-file-reader/file-cache.js';
import { agentManager } from './advanced-agents/agent-manager.js';
import { backgroundProcessor } from './advanced-agents/background-processor.js';
import { systemEventEmitter } from './system-events.js';

async function initializeEnhancedOpenAgent() {
  console.log('🚀 Initializing Enhanced OpenAgent...');

  try {
    // Initialize file cache
    console.log('📁 Initializing file cache...');
    await fileCache.initialize();

    // Initialize tool registry with intelligent file tools
    console.log('🔧 Initializing tool registry...');
    await unifiedToolRegistry.initialize({
      functions: [
        // Core tools will be automatically included via intelligent-file-tool.ts
        {
          name: 'echo',
          description: 'Echo back the input for testing',
          inputSchema: {
            type: 'object',
            properties: {
              message: { type: 'string', description: 'Message to echo' }
            },
            required: ['message']
          },
          fn: async (args: { message: string }) => {
            return { success: true, message: args.message };
          }
        }
      ]
    });

    // Initialize agent manager (core agents are created automatically)
    console.log('🤖 Agent manager initialized with core agents');

    // Initialize background processor
    console.log('⚙️ Background processor initialized');

    // Set up system event logging
    systemEventEmitter.emitSystemInfo('Enhanced OpenAgent initialized successfully', {
      fileCache: 'ready',
      toolRegistry: 'ready',
      agentManager: 'ready',
      backgroundProcessor: 'ready'
    });

    console.log('✅ Enhanced OpenAgent initialization complete!');
    console.log('');
    console.log('🎯 Features available:');
    console.log('  • Intelligent file reading with caching');
    console.log('  • Advanced agent planning and execution');
    console.log('  • Multi-panel UI with real-time updates');
    console.log('  • Tool execution approval system');
    console.log('  • Background task processing');
    console.log('');
    console.log('📋 UI Controls:');
    console.log('  • Tab/Shift+Tab: Switch panels');
    console.log('  • Ctrl+H: Show help');
    console.log('  • Ctrl+R: Resize mode');
    console.log('  • Ctrl+L: Cycle layouts');
    console.log('  • m: Minimize selected panel');
    console.log('');

    return true;
  } catch (error) {
    console.error('❌ Failed to initialize Enhanced OpenAgent:', error);
    systemEventEmitter.emitSystemInfo('Initialization failed', { error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}

async function main() {
  // Initialize the enhanced system
  const initialized = await initializeEnhancedOpenAgent();
  
  if (!initialized) {
    console.error('Failed to initialize. Exiting...');
    process.exit(1);
  }

  // Render the enhanced UI
  const { unmount, waitUntilExit } = render(
    <EnhancedUI 
      onExit={() => {
        console.log('\n👋 Shutting down Enhanced OpenAgent...');
        
        // Cleanup
        backgroundProcessor.shutdown();
        fileCache.clear();
        systemEventEmitter.clearHistory();
        
        console.log('✅ Cleanup complete. Goodbye!');
        process.exit(0);
      }}
    />
  );

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT. Shutting down gracefully...');
    unmount();
  });

  process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM. Shutting down gracefully...');
    unmount();
  });

  // Wait for the UI to exit
  await waitUntilExit();
}

// Run the enhanced OpenAgent
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
}

export { main as enhancedMain };
