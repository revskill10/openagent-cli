#!/usr/bin/env node
// test-fixed-streaming.ts - Test the fixed streaming parser with proper block handling

import { blockParser } from './simple-tools.js';
import { integratedStreamingPipeline } from './integrated-streaming-pipeline.js';
import { mockInputHandler } from './console-input-handler.js';

async function testFixedStreamingParser() {
  console.log('🔧 Testing Fixed Streaming Parser with Proper Token Handling\n');

  // Test 1: Basic block parsing
  console.log('📋 Test 1: Basic Block Parsing');
  
  const basicBlocks = `
[ASSIGN]sessionId = "session_123"[END_ASSIGN]

[TOOL_REQUEST]
{
  "id": "fetch_data",
  "tool": "data_fetcher",
  "params": {
    "session": "\${sessionId}",
    "query": "SELECT * FROM users"
  }
}
[END_TOOL_REQUEST]

[ASSIGN]processedAt = "2025-08-01T18:30:00Z"[END_ASSIGN]
  `;
  
  console.log('🔍 Parsing basic blocks...');
  for await (const token of blockParser.parseBlocksStreaming(basicBlocks)) {
    if (token.kind === 'block') {
      console.log(`✅ Parsed ${token.block.type} block`);
      if (token.block.type === 'ASSIGN') {
        console.log(`   Variable: ${token.block.variable} = ${token.block.expression}`);
      } else if (token.block.type === 'TOOL') {
        console.log(`   Tool: ${token.block.step.tool} (id: ${token.block.step.id})`);
      }
    } else {
      console.log(`❌ Parse error: ${token.message}`);
    }
  }
  console.log();

  // Test 2: Complex parallel block
  console.log('📋 Test 2: Complex Parallel Block');
  
  const parallelBlock = `
[PARALLEL]
[
  {
    "id": "task_1",
    "tool": "processor_1",
    "params": {"data": "chunk_1"}
  },
  {
    "id": "task_2", 
    "tool": "processor_2",
    "params": {"data": "chunk_2"}
  },
  {
    "id": "task_3",
    "tool": "processor_3", 
    "params": {"data": "chunk_3"}
  }
]
[END_PARALLEL]
  `;
  
  console.log('🔍 Parsing parallel block...');
  for await (const token of blockParser.parseBlocksStreaming(parallelBlock)) {
    if (token.kind === 'block') {
      console.log(`✅ Parsed ${token.block.type} block with ${token.block.steps?.length || 0} steps`);
      if (token.block.steps) {
        token.block.steps.forEach((step: any, i: number) => {
          console.log(`   Step ${i + 1}: ${step.tool} (id: ${step.id})`);
        });
      }
    } else {
      console.log(`❌ Parse error: ${token.message}`);
    }
  }
  console.log();

  // Test 3: Sequential workflow
  console.log('📋 Test 3: Sequential Workflow');
  
  const sequentialBlock = `
[SEQUENTIAL]
{
  "steps": [
    {
      "id": "step_1",
      "tool": "data_extractor",
      "params": {"source": "database"}
    },
    {
      "id": "step_2",
      "tool": "data_transformer", 
      "params": {"input": "\${step_1}"},
      "after": ["step_1"]
    },
    {
      "id": "step_3",
      "tool": "data_validator",
      "params": {"data": "\${step_2}"},
      "after": ["step_2"]
    }
  ]
}
[END_SEQUENTIAL]
  `;
  
  console.log('🔍 Parsing sequential workflow...');
  for await (const token of blockParser.parseBlocksStreaming(sequentialBlock)) {
    if (token.kind === 'block') {
      console.log(`✅ Parsed ${token.block.type} block with ${token.block.steps?.length || 0} steps`);
      if (token.block.steps) {
        token.block.steps.forEach((step: any, i: number) => {
          const dependencies = step.after ? ` (depends on: ${step.after.join(', ')})` : '';
          console.log(`   Step ${i + 1}: ${step.tool}${dependencies}`);
        });
      }
    } else {
      console.log(`❌ Parse error: ${token.message}`);
    }
  }
  console.log();

  // Test 4: User prompt block
  console.log('📋 Test 4: User Prompt Block');
  
  const promptBlock = `
[PROMPT]
{
  "id": "user_confirmation",
  "type": "confirm",
  "message": "Do you want to proceed with deployment?",
  "variable": "confirmDeployment",
  "required": true,
  "default": false
}
[END_PROMPT]
  `;
  
  console.log('🔍 Parsing prompt block...');
  for await (const token of blockParser.parseBlocksStreaming(promptBlock)) {
    if (token.kind === 'block') {
      console.log(`✅ Parsed ${token.block.type} block`);
      if (token.block.prompt) {
        console.log(`   Prompt: ${token.block.prompt.message}`);
        console.log(`   Type: ${token.block.prompt.type}, Variable: ${token.block.prompt.variable}`);
      }
    } else {
      console.log(`❌ Parse error: ${token.message}`);
    }
  }
  console.log();

  // Test 5: Realistic streaming simulation (chunk-based, not character-based)
  console.log('📋 Test 5: Realistic Streaming Simulation');
  
  // Simulate how AI models actually stream - in meaningful chunks
  const streamChunks = [
    '[ASSIGN]workflowId = "wf_',
    Date.now().toString(),
    '"[END_ASSIGN]\n\n[PROMPT]\n{\n  "id": "env_select",\n  "type": "select",\n  "message": "Choose environment",',
    '\n  "variable": "environment",\n  "options": [\n    {"label": "Dev", "value": "dev"},',
    '\n    {"label": "Prod", "value": "prod"}\n  ]\n}\n[END_PROMPT]\n\n[TOOL_REQUEST]\n{',
    '\n  "id": "deploy_app",\n  "tool": "deployer",\n  "params": {\n    "env": "${environment}",',
    '\n    "workflow": "${workflowId}"\n  }\n}\n[END_TOOL_REQUEST]'
  ];
  
  // Create realistic streaming
  async function* createRealisticStream(chunks: string[]): AsyncIterable<string> {
    let accumulated = '';
    for (const chunk of chunks) {
      accumulated += chunk;
      yield accumulated; // Yield cumulative content
      
      // Small delay to simulate network latency
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  
  console.log('🚀 Processing realistic streaming chunks...');
  
  // Set up mock response
  mockInputHandler.setResponse('environment', 'prod');
  
  let chunkCount = 0;
  let blockCount = 0;
  
  for await (const result of integratedStreamingPipeline.processAIStreamWithConcurrentExecution(
    createRealisticStream(streamChunks), 
    {
      enableRealTimeDisplay: false,
      inputHandler: mockInputHandler
    }
  )) {
    switch (result.type) {
      case 'ai_content':
        chunkCount++;
        console.log(`📥 Chunk ${chunkCount} received (${result.aiContent?.length || 0} chars)`);
        break;
        
      case 'block_parsed':
        blockCount++;
        console.log(`📦 Block ${blockCount}: ${result.block?.type} parsed`);
        break;
        
      case 'prompt_needed':
        console.log(`📝 Prompt: ${result.promptDefinition?.message}`);
        break;
        
      case 'tool_complete':
        console.log(`✅ Tool completed: ${result.toolName}`);
        break;
        
      case 'error':
        console.log(`❌ Error: ${result.error}`);
        break;
    }
  }
  
  console.log(`\n✅ Streaming test completed: ${chunkCount} chunks, ${blockCount} blocks parsed`);

  console.log('\n🎉 Fixed Streaming Parser Tests Complete!\n');
  
  console.log('🌟 Key Improvements:');
  console.log('  • Proper handling of incomplete JSON during streaming');
  console.log('  • Safe parsing with fallback for partial blocks');
  console.log('  • Prevention of infinite loops in parser');
  console.log('  • Realistic chunk-based streaming simulation');
  console.log('  • Concurrent execution while parsing continues');
  console.log('  • Proper error handling for malformed blocks');
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  testFixedStreamingParser().catch(console.error);
}

export { testFixedStreamingParser };