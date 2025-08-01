#!/usr/bin/env node
// test-concurrent-streaming.ts - Test concurrent streaming AI parsing and tool execution

import { integratedStreamingPipeline } from './integrated-streaming-pipeline.js';
import { concurrentStreamingExecutor } from './concurrent-streaming-executor.js';
import { mockInputHandler } from './console-input-handler.js';

async function demonstrateConcurrentStreaming() {
  console.log('⚡ Testing Concurrent Streaming AI Parsing & Tool Execution\n');

  // Test 1: Basic concurrent streaming
  console.log('📋 Test 1: Linear AI Response with Concurrent Tool Execution');
  
  const mockAIResponse = [
    '[ASSIGN]sessionId = "session_' + Date.now() + '"[END_ASSIGN]\n',
    
    '[PARALLEL]\n',
    '[\n',
    '  {\n',
    '    "id": "fetch_user_data",\n',
    '    "tool": "database_query",\n',
    '    "params": {\n',
    '      "query": "SELECT * FROM users WHERE active = true",\n',
    '      "session": "${sessionId}"\n',
    '    },\n',
    '    "retry": 2,\n',
    '    "timeout": 5000\n',
    '  },\n',
    '  {\n',
    '    "id": "fetch_config",\n',
    '    "tool": "config_loader",\n',
    '    "params": {\n',
    '      "environment": "production",\n',
    '      "session": "${sessionId}"\n',
    '    },\n',
    '    "retry": 1\n',
    '  },\n',
    '  {\n',
    '    "id": "warm_cache",\n',
    '    "tool": "cache_warmer",\n',
    '    "params": {\n',
    '      "keys": ["user_profiles", "system_config"],\n',
    '      "session": "${sessionId}"\n',
    '    }\n',
    '  }\n',
    ']\n',
    '[END_PARALLEL]\n',
    
    '[SEQUENTIAL]\n',
    '{\n',
    '  "steps": [\n',
    '    {\n',
    '      "id": "process_data",\n',
    '      "tool": "data_processor",\n',
    '      "params": {\n',
    '        "user_data": "${fetch_user_data}",\n',
    '        "config": "${fetch_config}",\n',
    '        "session": "${sessionId}"\n',
    '      },\n',
    '      "after": ["fetch_user_data", "fetch_config"]\n',
    '    },\n',
    '    {\n',
    '      "id": "generate_report",\n',
    '      "tool": "report_generator",\n',
    '      "params": {\n',
    '        "data": "${process_data}",\n',
    '        "format": "json",\n',
    '        "session": "${sessionId}"\n',
    '      },\n',
    '      "after": ["process_data"]\n',
    '    }\n',
    '  ]\n',
    '}\n',
    '[END_SEQUENTIAL]\n'
  ];

  // Create streaming AI response
  const aiStream = integratedStreamingPipeline.createMockAIStream(mockAIResponse);
  
  console.log('🚀 Processing streaming AI response with concurrent execution...\n');
  
  let aiContentBuffer = '';
  let blockCount = 0;
  let toolExecutions = 0;
  const startTime = Date.now();
  
  for await (const result of integratedStreamingPipeline.processAIStreamWithConcurrentExecution(aiStream, {
    enableRealTimeDisplay: true,
    maxConcurrentTools: 3,
    inputHandler: mockInputHandler
  })) {
    const elapsed = Date.now() - startTime;
    
    switch (result.type) {
      case 'ai_content':
        // Show streaming AI content (simulating real-time display)
        aiContentBuffer += result.aiContent || '';
        process.stdout.write(`\r🤖 AI: ${aiContentBuffer.slice(-50)}...`);
        break;
        
      case 'block_parsed':
        blockCount++;
        console.log(`\n📦 Block ${blockCount} parsed: ${result.block?.type} (${elapsed}ms)`);
        break;
        
      case 'tool_start':
        toolExecutions++;
        console.log(`🔧 Tool started: ${result.toolName} (${elapsed}ms)`);
        break;
        
      case 'tool_progress':
        console.log(`⚙️  Progress: ${result.toolName} - ${JSON.stringify(result.toolResult).slice(0, 50)}... (${elapsed}ms)`);
        break;
        
      case 'tool_complete':
        console.log(`✅ Tool completed: ${result.toolName} in ${result.executionTime}ms (${elapsed}ms)`);
        break;
        
      case 'prompt_needed':
        console.log(`📝 Prompt needed: ${result.promptDefinition?.message} (${elapsed}ms)`);
        break;
        
      case 'error':
        console.log(`❌ Error from ${result.source}: ${result.error} (${elapsed}ms)`);
        break;
    }
    
    // Show pipeline stats
    if (result.pipelineStats) {
      const stats = result.pipelineStats;
      console.log(`   📊 Stats: ${stats.completedBlocks} blocks, AI parsing: ${stats.activeAIParsing}, Active tools: ${stats.activeToolExecutions}`);
    }
  }
  
  console.log(`\n✅ Test 1 completed in ${Date.now() - startTime}ms\n`);

  // Test 2: Concurrent tool execution with different priorities
  console.log('📋 Test 2: Concurrent Tool Execution with Priority Queue');
  
  const toolCalls = [
    { name: 'high_priority_task', arguments: { data: 'critical' }, priority: 'high' as const },
    { name: 'normal_task_1', arguments: { data: 'regular_1' }, priority: 'normal' as const },
    { name: 'low_priority_task', arguments: { data: 'background' }, priority: 'low' as const },
    { name: 'normal_task_2', arguments: { data: 'regular_2' }, priority: 'normal' as const },
    { name: 'high_priority_urgent', arguments: { data: 'urgent' }, priority: 'high' as const }
  ];
  
  console.log('🚀 Executing tools with priority-based scheduling...\n');
  
  const execStartTime = Date.now();
  for await (const result of concurrentStreamingExecutor.executeConcurrentStreaming(toolCalls, {
    maxConcurrent: 2, // Limit concurrency to show queuing
    timeout: 10000
  })) {
    const elapsed = Date.now() - execStartTime;
    
    switch (result.type) {
      case 'start':
        console.log(`🚀 Started: ${result.toolName} (${elapsed}ms)`);
        break;
      case 'progress':
        console.log(`⚙️  Progress: ${result.toolName} - ${JSON.stringify(result.data).slice(0, 30)}... (${elapsed}ms)`);
        break;
      case 'complete':
        console.log(`✅ Completed: ${result.toolName} in ${result.executionTime}ms (${elapsed}ms)`);
        break;
      case 'error':
        console.log(`❌ Error: ${result.toolName} - ${result.error} (${elapsed}ms)`);
        break;
    }
    
    // Show execution status
    const status = concurrentStreamingExecutor.getExecutionStatus();
    console.log(`   📊 Status: ${status.active} active, ${status.queued} queued, ${status.completed} completed, ${status.errors} errors`);
  }
  
  console.log(`\n✅ Test 2 completed in ${Date.now() - execStartTime}ms\n`);

  // Test 3: Complex streaming workflow with user prompts
  console.log('📋 Test 3: Complex Streaming Workflow with Interactive Prompts');
  
  const complexAIResponse = [
    '[PROMPT]\n',
    '{\n',
    '  "id": "deployment_target_prompt",\n',
    '  "type": "select",\n',
    '  "message": "Select deployment target",\n',
    '  "variable": "deploymentTarget",\n',
    '  "required": true,\n',
    '  "options": [\n',
    '    {"label": "Production", "value": "prod"},\n',
    '    {"label": "Staging", "value": "staging"}\n',
    '  ]\n',
    '}\n',
    '[END_PROMPT]\n',
    
    '[ASSIGN]deploymentConfig = {\n',
    '  "target": "${deploymentTarget}",\n',
    '  "timestamp": "' + new Date().toISOString() + '",\n',
    '  "version": "1.2.3"\n',
    '}[END_ASSIGN]\n',
    
    '[IF]${deploymentTarget} === "prod"\n',
    '[TOOL_REQUEST]\n',
    '{\n',
    '  "id": "production_validation",\n',
    '  "tool": "prod_validator",\n',
    '  "params": {\n',
    '    "config": "${deploymentConfig}",\n',
    '    "strict": true\n',
    '  },\n',
    '  "retry": 3,\n',
    '  "timeout": 30000\n',
    '}\n',
    '[END_TOOL_REQUEST]\n',
    '[END_IF]\n',
    
    '[TOOL_REQUEST]\n',
    '{\n',
    '  "id": "deploy_application",\n',
    '  "tool": "deployer",\n',
    '  "params": {\n',
    '    "target": "${deploymentTarget}",\n',
    '    "config": "${deploymentConfig}",\n',
    '    "validation_result": "${production_validation}"\n',
    '  },\n',
    '  "retry": 2\n',
    '}\n',
    '[END_TOOL_REQUEST]\n'
  ];

  // Set up mock response for prompt
  mockInputHandler.setResponse('deploymentTarget', 'prod');
  
  const complexStream = integratedStreamingPipeline.createMockAIStream(complexAIResponse);
  
  console.log('🚀 Processing complex workflow with prompts...\n');
  
  const complexStartTime = Date.now();
  let promptsHandled = 0;
  let conditionalBlocks = 0;
  
  for await (const result of integratedStreamingPipeline.processAIStreamWithConcurrentExecution(complexStream, {
    enableRealTimeDisplay: false, // Disable for cleaner output
    maxConcurrentTools: 5,
    inputHandler: mockInputHandler
  })) {
    const elapsed = Date.now() - complexStartTime;
    
    switch (result.type) {
      case 'block_parsed':
        if (result.block?.type === 'IF') conditionalBlocks++;
        console.log(`📦 Parsed: ${result.block?.type} block (${elapsed}ms)`);
        break;
        
      case 'prompt_needed':
        promptsHandled++;
        console.log(`📝 Prompt: ${result.promptDefinition?.message} (${elapsed}ms)`);
        // Mock handler will automatically respond
        break;
        
      case 'tool_start':
        console.log(`🔧 Tool: ${result.toolName} started (${elapsed}ms)`);
        break;
        
      case 'tool_complete':
        console.log(`✅ Tool: ${result.toolName} completed in ${result.executionTime}ms (${elapsed}ms)`);
        break;
        
      case 'error':
        console.log(`❌ Error: ${result.error} (${elapsed}ms)`);
        break;
    }
  }
  
  console.log(`\n✅ Test 3 completed in ${Date.now() - complexStartTime}ms`);
  console.log(`   📊 Handled ${promptsHandled} prompts, ${conditionalBlocks} conditional blocks\n`);

  // Test 4: Performance measurement
  console.log('📋 Test 4: Performance Measurement - Large Parallel Workflow');
  
  const largeWorkflowResponse = [
    '[PARALLEL]\n',
    '[\n'
  ];
  
  // Generate 10 parallel tool calls
  for (let i = 1; i <= 10; i++) {
    largeWorkflowResponse.push(
      `  {\n` +
      `    "id": "parallel_task_${i}",\n` +
      `    "tool": "data_processor_${i % 3 + 1}",\n` +
      `    "params": {\n` +
      `      "chunk": ${i},\n` +
      `      "data": "large_dataset_chunk_${i}"\n` +
      `    },\n` +
      `    "retry": 1,\n` +
      `    "timeout": 5000\n` +
      `  }${i < 10 ? ',' : ''}\n`
    );
  }
  
  largeWorkflowResponse.push(']\n[END_PARALLEL]\n');
  
  const largeStream = integratedStreamingPipeline.createMockAIStream(largeWorkflowResponse);
  
  console.log('🚀 Processing large parallel workflow...\n');
  
  const perfStartTime = Date.now();
  let toolsStarted = 0;
  let toolsCompleted = 0;
  let maxConcurrent = 0;
  
  for await (const result of integratedStreamingPipeline.processAIStreamWithConcurrentExecution(largeStream, {
    enableRealTimeDisplay: false,
    maxConcurrentTools: 5
  })) {
    const elapsed = Date.now() - perfStartTime;
    
    switch (result.type) {
      case 'tool_start':
        toolsStarted++;
        console.log(`🔧 Started tool ${toolsStarted}/10: ${result.toolName} (${elapsed}ms)`);
        break;
        
      case 'tool_complete':
        toolsCompleted++;
        console.log(`✅ Completed tool ${toolsCompleted}/10: ${result.toolName} in ${result.executionTime}ms (${elapsed}ms)`);
        break;
    }
    
    if (result.pipelineStats) {
      maxConcurrent = Math.max(maxConcurrent, result.pipelineStats.activeToolExecutions);
    }
  }
  
  const totalTime = Date.now() - perfStartTime;
  console.log(`\n✅ Test 4 completed in ${totalTime}ms`);
  console.log(`   📊 Processed 10 parallel tools, max concurrent: ${maxConcurrent}`);
  console.log(`   📊 Average time per tool: ${Math.round(totalTime / 10)}ms`);

  console.log('\n🎉 All Concurrent Streaming Tests Complete!\n');
  
  console.log('🌟 Key Features Demonstrated:');
  console.log('  • Linear AI response parsing with real-time streaming');
  console.log('  • Concurrent tool execution while parsing continues');
  console.log('  • Priority-based tool execution queue');
  console.log('  • Interactive prompts during streaming execution');
  console.log('  • Conditional execution with dynamic branching');
  console.log('  • Performance optimization with parallel processing');
  console.log('  • Real-time progress updates and pipeline statistics');
  console.log('  • Error handling across concurrent operations');
}

// Performance analysis helper
function analyzePerformance(results: any[]): void {
  const timings = results
    .filter(r => r.executionTime)
    .map(r => r.executionTime)
    .sort((a, b) => a - b);
  
  if (timings.length === 0) return;
  
  const avg = timings.reduce((a, b) => a + b, 0) / timings.length;
  const median = timings[Math.floor(timings.length / 2)];
  const min = timings[0];
  const max = timings[timings.length - 1];
  
  console.log('\n📈 Performance Analysis:');
  console.log(`   Average execution time: ${avg.toFixed(2)}ms`);
  console.log(`   Median execution time: ${median}ms`);
  console.log(`   Min execution time: ${min}ms`);
  console.log(`   Max execution time: ${max}ms`);
}

// Run the demonstration
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateConcurrentStreaming().catch(console.error);
}

export { demonstrateConcurrentStreaming };