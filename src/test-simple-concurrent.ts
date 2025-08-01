#!/usr/bin/env node
// test-simple-concurrent.ts - Simple test for concurrent streaming execution

import { concurrentStreamingExecutor } from './concurrent-streaming-executor.js';

async function testSimpleConcurrentExecution() {
  console.log('⚡ Testing Simple Concurrent Tool Execution\n');

  // Test concurrent tool execution without AI parsing complexity
  const toolCalls = [
    { name: 'data_processor_1', arguments: { data: 'chunk_1', priority: 'high' }, priority: 'high' as const },
    { name: 'data_processor_2', arguments: { data: 'chunk_2', priority: 'normal' }, priority: 'normal' as const },
    { name: 'data_processor_3', arguments: { data: 'chunk_3', priority: 'low' }, priority: 'low' as const },
    { name: 'validator', arguments: { schema: 'data_schema', strict: true }, priority: 'high' as const },
    { name: 'cache_warmer', arguments: { keys: ['user_data', 'config'] }, priority: 'normal' as const }
  ];

  console.log('🚀 Executing 5 tools concurrently with priority-based scheduling...\n');
  
  const startTime = Date.now();
  let toolsStarted = 0;
  let toolsCompleted = 0;
  let toolsErrored = 0;
  
  for await (const result of concurrentStreamingExecutor.executeConcurrentStreaming(toolCalls, {
    maxConcurrent: 3,
    timeout: 10000
  })) {
    const elapsed = Date.now() - startTime;
    
    switch (result.type) {
      case 'start':
        toolsStarted++;
        console.log(`🚀 [${elapsed}ms] Started: ${result.toolName} (${toolsStarted}/${toolCalls.length})`);
        break;
        
      case 'progress':
        console.log(`⚙️  [${elapsed}ms] Progress: ${result.toolName} - ${JSON.stringify(result.data).slice(0, 50)}...`);
        break;
        
      case 'complete':
        toolsCompleted++;
        console.log(`✅ [${elapsed}ms] Completed: ${result.toolName} in ${result.executionTime}ms (${toolsCompleted}/${toolCalls.length})`);
        break;
        
      case 'error':
        toolsErrored++;
        console.log(`❌ [${elapsed}ms] Error: ${result.toolName} - ${result.error} (${toolsErrored} errors)`);
        break;
    }
    
    // Show execution status
    const status = concurrentStreamingExecutor.getExecutionStatus();
    console.log(`   📊 Status: ${status.active} active, ${status.queued} queued, ${status.completed} completed, ${status.errors} errors\n`);
  }
  
  const totalTime = Date.now() - startTime;
  console.log(`✅ All tools completed in ${totalTime}ms`);
  console.log(`📈 Performance: ${toolsStarted} started, ${toolsCompleted} completed, ${toolsErrored} errors`);
  console.log(`📈 Average time per tool: ${Math.round(totalTime / toolCalls.length)}ms\n`);

  // Test 2: High-throughput scenario
  console.log('📋 Test 2: High-Throughput Scenario (20 parallel tools)');
  
  const largeBatch = [];
  for (let i = 1; i <= 20; i++) {
    largeBatch.push({
      name: `batch_processor_${i}`,
      arguments: { 
        chunk: i, 
        data: `large_dataset_chunk_${i}`,
        size: Math.floor(Math.random() * 1000) + 100 
      },
      priority: (i <= 5 ? 'high' : i <= 15 ? 'normal' : 'low') as const
    });
  }
  
  console.log('🚀 Processing 20 tools with priority queue...\n');
  
  const batchStartTime = Date.now();
  let batchCompleted = 0;
  let maxConcurrent = 0;
  
  for await (const result of concurrentStreamingExecutor.executeConcurrentStreaming(largeBatch, {
    maxConcurrent: 5
  })) {
    if (result.type === 'complete') {
      batchCompleted++;
      const elapsed = Date.now() - batchStartTime;
      console.log(`✅ [${elapsed}ms] Completed: ${result.toolName} (${batchCompleted}/20)`);
    }
    
    const status = concurrentStreamingExecutor.getExecutionStatus();
    maxConcurrent = Math.max(maxConcurrent, status.active);
    
    // Show progress every 5 completions
    if (batchCompleted % 5 === 0 && result.type === 'complete') {
      console.log(`📊 Progress: ${batchCompleted}/20 completed, max concurrent: ${maxConcurrent}\n`);
    }
  }
  
  const batchTotalTime = Date.now() - batchStartTime;
  console.log(`✅ Batch processing completed in ${batchTotalTime}ms`);
  console.log(`📈 Throughput: ${Math.round(20 / (batchTotalTime / 1000))} tools/second`);
  console.log(`📈 Max concurrent executions: ${maxConcurrent}\n`);

  // Test 3: Error handling and retries
  console.log('📋 Test 3: Error Handling and Retry Logic');
  
  const errorProneBatch = [
    { name: 'reliable_tool', arguments: { data: 'safe_data' }, priority: 'normal' as const },
    { name: 'unreliable_tool', arguments: { data: 'risky_data', fail_rate: 0.7 }, priority: 'high' as const },
    { name: 'timeout_tool', arguments: { data: 'slow_data', delay: 15000 }, priority: 'low' as const },
    { name: 'invalid_tool', arguments: { malformed: true }, priority: 'normal' as const }
  ];
  
  console.log('🚀 Testing error handling with unreliable tools...\n');
  
  const errorTestStart = Date.now();
  let successfulTools = 0;
  let failedTools = 0;
  
  for await (const result of concurrentStreamingExecutor.executeConcurrentStreaming(errorProneBatch, {
    maxConcurrent: 2,
    timeout: 5000,
    retries: 2
  })) {
    const elapsed = Date.now() - errorTestStart;
    
    if (result.type === 'complete') {
      successfulTools++;
      console.log(`✅ [${elapsed}ms] Success: ${result.toolName}`);
    } else if (result.type === 'error') {
      failedTools++;
      console.log(`❌ [${elapsed}ms] Failed: ${result.toolName} - ${result.error}`);
    }
  }
  
  const errorTestTime = Date.now() - errorTestStart;
  console.log(`\n📊 Error test completed in ${errorTestTime}ms`);
  console.log(`📈 Results: ${successfulTools} successful, ${failedTools} failed`);
  console.log(`📈 Success rate: ${Math.round((successfulTools / errorProneBatch.length) * 100)}%`);

  console.log('\n🎉 Concurrent Streaming Execution Tests Complete!\n');
  
  console.log('🌟 Key Features Demonstrated:');
  console.log('  • Priority-based tool execution queue');
  console.log('  • Concurrent execution with configurable limits');
  console.log('  • Real-time streaming progress updates');
  console.log('  • High-throughput batch processing');
  console.log('  • Error handling and retry mechanisms');
  console.log('  • Performance monitoring and statistics');
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  testSimpleConcurrentExecution().catch(console.error);
}

export { testSimpleConcurrentExecution };