#!/usr/bin/env node
// test-streaming-blocks.ts - Test the enhanced streaming block execution

import { streamingBlockExecutor } from './streaming-block-executor.js';

async function demonstrateStreamingExecution() {
  console.log('🚀 Testing Enhanced Streaming Block Execution\n');

  // Test 1: Simple tool execution
  console.log('📋 Test 1: Simple Tool Execution');
  const simpleScript = streamingBlockExecutor.createToolScript('echo', { message: 'Hello World' });
  
  console.log('Script:', simpleScript);
  console.log('Results:');
  for await (const result of streamingBlockExecutor.executePromptStreaming(simpleScript)) {
    console.log(`  ${result.type}: ${JSON.stringify(result.result || result.error)}`);
  }
  console.log();

  // Test 2: Variable assignment
  console.log('📋 Test 2: Variable Assignment');
  const assignmentScript = `
    [ASSIGN]userName = "Alice"[END_ASSIGN]
    [ASSIGN]userAge = 25[END_ASSIGN]
    [ASSIGN]greeting = "Hello, " + \${userName} + "! You are " + \${userAge} + " years old."[END_ASSIGN]
  `;
  
  console.log('Script:', assignmentScript.trim());
  console.log('Results:');
  for await (const result of streamingBlockExecutor.executePromptStreaming(assignmentScript)) {
    console.log(`  ${result.type}: ${JSON.stringify(result.result || result.error)}`);
    if (result.variables && Object.keys(result.variables).length > 0) {
      console.log(`  Variables:`, result.variables);
    }
  }
  console.log();

  // Test 3: Sequential execution with variable injection
  console.log('📋 Test 3: Sequential Execution with Variables');
  const sequentialScript = `
    [ASSIGN]baseUrl = "https://api.example.com"[END_ASSIGN]
    [SEQUENTIAL]
    {
      "steps": [
        {
          "id": "fetch_user",
          "tool": "http_get",
          "params": {
            "url": "\${baseUrl}/users/1"
          }
        },
        {
          "id": "process_user",
          "tool": "json_transform",
          "params": {
            "data": "\${fetch_user}",
            "transform": "extract_name"
          },
          "after": ["fetch_user"]
        }
      ]
    }
    [END_SEQUENTIAL]
  `;
  
  console.log('Script:', sequentialScript.trim());
  console.log('Results:');
  for await (const result of streamingBlockExecutor.executePromptStreaming(sequentialScript)) {
    console.log(`  ${result.type}: ${JSON.stringify(result.result || result.error)}`);
  }
  console.log();

  // Test 4: Conditional execution
  console.log('📋 Test 4: Conditional Execution');
  const conditionalScript = `
    [ASSIGN]shouldProcess = true[END_ASSIGN]
    [IF]\${shouldProcess} === true
    [TOOL_REQUEST]
    {
      "id": "conditional_task",
      "tool": "process_data",
      "params": {
        "message": "Processing because condition is true"
      }
    }
    [END_TOOL_REQUEST]
    [END_IF]
  `;
  
  console.log('Script:', conditionalScript.trim());
  console.log('Results:');
  for await (const result of streamingBlockExecutor.executePromptStreaming(conditionalScript)) {
    console.log(`  ${result.type}: ${JSON.stringify(result.result || result.error)}`);
  }
  console.log();

  // Test 5: Parallel execution
  console.log('📋 Test 5: Parallel Execution');
  const parallelScript = streamingBlockExecutor.createParallelScript([
    { tool: 'task_a', params: { data: 'Dataset A' }, id: 'task_a' },
    { tool: 'task_b', params: { data: 'Dataset B' }, id: 'task_b' },
    { tool: 'task_c', params: { data: 'Dataset C' }, id: 'task_c' }
  ]);
  
  console.log('Script:', parallelScript);
  console.log('Results:');
  for await (const result of streamingBlockExecutor.executePromptStreaming(parallelScript)) {
    console.log(`  ${result.type}: ${JSON.stringify(result.result || result.error)}`);
  }
  console.log();

  // Test 6: Complex workflow with multiple control structures  
  console.log('📋 Test 6: Complex Workflow');
  const complexScript = `
    [ASSIGN]counter = 0[END_ASSIGN]
    [ASSIGN]maxRetries = 3[END_ASSIGN]
    
    [WHILE]\${counter} < \${maxRetries}
    [SEQUENTIAL]
    {
      "steps": [
        {
          "id": "attempt_\${counter}",
          "tool": "api_call",
          "params": {
            "url": "https://unreliable-api.com/data",
            "attempt": "\${counter}"
          },
          "retry": 1,
          "timeout": 5000
        }
      ]
    }
    [END_SEQUENTIAL]
    [ASSIGN]counter = \${counter} + 1[END_ASSIGN]
    [END_WHILE]
  `;
  
  console.log('Script:', complexScript.trim());
  console.log('Results:');
  for await (const result of streamingBlockExecutor.executePromptStreaming(complexScript)) {
    console.log(`  ${result.type}: ${JSON.stringify(result.result || result.error)}`);
    if (result.variables?.counter) {
      console.log(`  Counter: ${result.variables.counter}`);
    }
  }

  console.log('\n✅ Enhanced Streaming Block Execution Tests Complete!');
}

// Run the demonstration
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateStreamingExecution().catch(console.error);
}

export { demonstrateStreamingExecution };