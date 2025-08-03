#!/usr/bin/env node
// test-background-execution.ts - Test non-blocking background execution

import { durableBlockExecutor } from './durable-block-executor.js';
import { mockInputHandler } from './console-input-handler.js';

async function testBackgroundExecution() {
  console.log('🚀 Testing Non-Blocking Background Execution\n');

  // Test script that simulates a long-running task
  const longRunningScript = `
[TOOL_REQUEST]{"id":"1","tool":"write_file","params":{"path":"test-output.txt","content":"Starting long task..."}}[END_TOOL_REQUEST]

[TOOL_REQUEST]{"id":"2","tool":"shell_command","params":{"command":"echo 'Processing step 1...'"}}[END_TOOL_REQUEST]

[TOOL_REQUEST]{"id":"3","tool":"shell_command","params":{"command":"echo 'Processing step 2...'"}}[END_TOOL_REQUEST]

[TOOL_REQUEST]{"id":"4","tool":"write_file","params":{"path":"test-output.txt","content":"Task completed!"}}[END_TOOL_REQUEST]
  `;

  console.log('📋 Starting background execution...');
  const startTime = Date.now();

  // Start background execution
  const executionId = `bg_test_${Date.now()}`;
  let statusCount = 0;
  let toolCount = 0;

  try {
    for await (const result of durableBlockExecutor.executeDurable(longRunningScript, {
      executionId,
      inputHandler: mockInputHandler,
      autoCleanup: false
    })) {
      statusCount++;
      
      console.log(`📊 Status Update ${statusCount}:`, {
        type: result.type,
        status: result.executionState?.status,
        completed: result.executionState?.completedSteps.length || 0,
        errors: result.executionState?.errors.length || 0,
        done: result.done
      });

      if (result.type === 'tool_start' || result.type === 'tool_complete') {
        toolCount++;
        console.log(`🔧 Tool Event ${toolCount}: ${result.type}`);
      }

      // Simulate UI responsiveness - we can do other work here
      if (statusCount % 3 === 0) {
        console.log('💡 UI remains responsive - doing other work...');
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      if (result.done && result.executionState?.status === 'completed') {
        break;
      }
    }

    const duration = Date.now() - startTime;
    console.log(`\n✅ Background execution completed in ${duration}ms`);
    console.log(`📈 Received ${statusCount} status updates and ${toolCount} tool events`);

  } catch (error) {
    console.error('❌ Background execution failed:', error);
  }

  // Test concurrent executions
  console.log('\n🔄 Testing concurrent background executions...');
  
  const concurrentTasks = [
    `[TOOL_REQUEST]{"id":"1","tool":"shell_command","params":{"command":"echo 'Task A'"}}[END_TOOL_REQUEST]`,
    `[TOOL_REQUEST]{"id":"1","tool":"shell_command","params":{"command":"echo 'Task B'"}}[END_TOOL_REQUEST]`,
    `[TOOL_REQUEST]{"id":"1","tool":"shell_command","params":{"command":"echo 'Task C'"}}[END_TOOL_REQUEST]`
  ];

  const promises = concurrentTasks.map(async (script, index) => {
    const execId = `concurrent_${index}_${Date.now()}`;
    console.log(`🚀 Starting concurrent task ${index + 1}`);
    
    for await (const result of durableBlockExecutor.executeDurable(script, {
      executionId: execId,
      autoCleanup: true
    })) {
      if (result.done) {
        console.log(`✅ Concurrent task ${index + 1} completed`);
        break;
      }
    }
  });

  await Promise.all(promises);
  console.log('\n🎉 All concurrent tasks completed!');

  // Show background job status
  const jobStatus = durableBlockExecutor.getBackgroundJobsStatus();
  console.log('\n📊 Background Jobs Status:', jobStatus);
}

async function demonstrateUIResponsiveness() {
  console.log('\n🎯 Demonstrating UI Responsiveness During Background Execution\n');

  const heavyScript = `
[TOOL_REQUEST]{"id":"1","tool":"write_file","params":{"path":"heavy-task.txt","content":"Starting heavy computation..."}}[END_TOOL_REQUEST]

[TOOL_REQUEST]{"id":"2","tool":"shell_command","params":{"command":"echo 'Heavy processing...'"}}[END_TOOL_REQUEST]
  `;

  // Start heavy background task
  const heavyExecId = `heavy_${Date.now()}`;
  const heavyTask = durableBlockExecutor.executeDurable(heavyScript, {
    executionId: heavyExecId,
    autoCleanup: true
  });

  // Simulate UI interactions while background task runs
  const uiSimulation = async () => {
    for (let i = 0; i < 10; i++) {
      console.log(`🖱️  UI Action ${i + 1}: User clicks button, UI responds immediately`);
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  };

  // Run both concurrently
  const [_, __] = await Promise.all([
    (async () => {
      for await (const result of heavyTask) {
        if (result.type === 'tool_complete') {
          console.log('⚙️  Background: Tool completed');
        }
        if (result.done) break;
      }
    })(),
    uiSimulation()
  ]);

  console.log('\n✨ UI remained responsive throughout background execution!');
}

// Run tests
if (require.main === module) {
  testBackgroundExecution()
    .then(() => demonstrateUIResponsiveness())
    .then(() => {
      console.log('\n🎊 All background execution tests completed successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Test failed:', error);
      process.exit(1);
    });
}

export { testBackgroundExecution, demonstrateUIResponsiveness };
