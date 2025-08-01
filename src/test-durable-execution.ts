#!/usr/bin/env node
// test-durable-execution.ts - Test durable execution with persistence and resumption

import { durableBlockExecutor, STREAMING_EXECUTION_SYSTEM_PROMPT } from './durable-block-executor.js';
import { mockInputHandler } from './console-input-handler.js';

async function demonstrateDurableExecution() {
  console.log('🛡️ Testing Durable Block Execution with Persistence\n');
  
  console.log('📝 System Prompt for AI Models:');
  console.log('=====================================');
  console.log(STREAMING_EXECUTION_SYSTEM_PROMPT);
  console.log('=====================================\n');

  // Test 1: Basic durable execution
  console.log('📋 Test 1: Basic Durable Execution');
  const basicScript = `
    [ASSIGN]startTime = "${new Date().toISOString()}"[END_ASSIGN]
    
    [TOOL_REQUEST]
    {
      "id": "fetch_config",
      "tool": "config_loader",
      "params": {
        "environment": "production",
        "version": "1.2.3"
      },
      "retry": 2,
      "timeout": 5000
    }
    [END_TOOL_REQUEST]
    
    [ASSIGN]processedAt = "${new Date().toISOString()}"[END_ASSIGN]
    
    [TOOL_REQUEST] 
    {
      "id": "validate_config",
      "tool": "validator",
      "params": {
        "config": "\${fetch_config}",
        "schema": "config_schema_v1"
      },
      "retry": 1
    }
    [END_TOOL_REQUEST]
  `;

  const executionId = `test_basic_${Date.now()}`;
  console.log(`🚀 Starting durable execution: ${executionId}`);
  
  for await (const result of durableBlockExecutor.executeDurable(basicScript, {
    executionId,
    inputHandler: mockInputHandler,
    autoCleanup: false // Keep for demonstration
  })) {
    console.log(`  ${result.type}: ${JSON.stringify(result.result || result.error)}`);
    if (result.executionState) {
      console.log(`    State: ${result.executionState.status}, Steps: ${result.executionState.completedSteps.length}`);
    }
  }
  console.log();

  // Test 2: Execution with user prompts (durable)
  console.log('📋 Test 2: Durable Execution with User Prompts');
  const promptScript = `
    [PROMPT]
    {
      "id": "deployment_target_prompt",
      "type": "select",
      "message": "Select deployment target",
      "variable": "deploymentTarget",
      "required": true,
      "options": [
        {"label": "AWS Production", "value": "aws-prod"},
        {"label": "Azure Staging", "value": "azure-staging"},
        {"label": "Local Development", "value": "local-dev"}
      ]
    }
    [END_PROMPT]
    
    [ASSIGN]deploymentConfig = {
      "target": "\${deploymentTarget}",
      "timestamp": "${new Date().toISOString()}",
      "version": "1.2.3"
    }[END_ASSIGN]
    
    [TOOL_REQUEST]
    {
      "id": "prepare_deployment",
      "tool": "deployment_manager",
      "params": {
        "target": "\${deploymentTarget}",
        "config": "\${deploymentConfig}"
      },
      "retry": 3,
      "timeout": 30000
    }
    [END_TOOL_REQUEST]
    
    [IF]\${prepare_deployment.status} === "ready"
    [TOOL_REQUEST]
    {
      "id": "deploy_application", 
      "tool": "deployer",
      "params": {
        "deployment_id": "\${prepare_deployment.id}",
        "confirm": true
      },
      "retry": 2
    }
    [END_TOOL_REQUEST]
    [END_IF]
  `;

  // Set up mock responses
  mockInputHandler.setResponse('deploymentTarget', 'aws-prod');
  
  const promptExecutionId = `test_prompt_${Date.now()}`;
  console.log(`🚀 Starting durable execution with prompts: ${promptExecutionId}`);
  
  for await (const result of durableBlockExecutor.executeDurable(promptScript, {
    executionId: promptExecutionId,
    inputHandler: mockInputHandler,
    autoCleanup: false
  })) {
    console.log(`  ${result.type}: ${JSON.stringify(result.result || result.error)}`);
    if (result.executionState?.variables) {
      const vars = Object.keys(result.executionState.variables);
      if (vars.length > 0) {
        console.log(`    Variables: ${vars.join(', ')}`);
      }
    }
  }
  console.log();

  // Test 3: Complex workflow with parallel execution
  console.log('📋 Test 3: Complex Durable Workflow with Parallel Tasks');
  const complexScript = `
    [ASSIGN]batchId = "batch_${Date.now()}"[END_ASSIGN]
    
    [PARALLEL]
    [
      {
        "id": "data_extraction",
        "tool": "data_extractor", 
        "params": {
          "source": "database",
          "batch_id": "\${batchId}",
          "query": "SELECT * FROM users WHERE active = true"
        },
        "retry": 2,
        "timeout": 60000
      },
      {
        "id": "data_validation",
        "tool": "data_validator",
        "params": {
          "rules": "user_validation_rules.json",
          "batch_id": "\${batchId}"
        },
        "retry": 1,
        "timeout": 30000
      },
      {
        "id": "cache_warm_up",
        "tool": "cache_manager",
        "params": {
          "action": "warm_up",
          "keys": ["user_profiles", "user_preferences"]
        },
        "retry": 3,
        "timeout": 45000
      }
    ]
    [END_PARALLEL]
    
    [SEQUENTIAL]
    {
      "steps": [
        {
          "id": "merge_results",
          "tool": "data_merger",
          "params": {
            "extraction_result": "\${data_extraction}",
            "validation_result": "\${data_validation}",
            "batch_id": "\${batchId}"
          },
          "after": ["data_extraction", "data_validation"]
        },
        {
          "id": "generate_report",
          "tool": "report_generator",
          "params": {
            "data": "\${merge_results}",
            "format": "json",
            "include_stats": true
          },
          "after": ["merge_results"]
        },
        {
          "id": "notify_completion",
          "tool": "notification_service",
          "params": {
            "message": "Batch processing completed for \${batchId}",
            "report": "\${generate_report}",
            "recipients": ["admin@example.com"]
          },
          "after": ["generate_report"]
        }
      ]
    }
    [END_SEQUENTIAL]
  `;

  const complexExecutionId = `test_complex_${Date.now()}`;
  console.log(`🚀 Starting complex durable execution: ${complexExecutionId}`);
  
  for await (const result of durableBlockExecutor.executeDurable(complexScript, {
    executionId: complexExecutionId,
    inputHandler: mockInputHandler,
    autoCleanup: false
  })) {
    console.log(`  ${result.type}: ${JSON.stringify(result.result || result.error)}`);
    if (result.executionState) {
      console.log(`    Progress: ${result.executionState.completedSteps.length} steps completed`);
    }
  }
  console.log();

  // Test 4: Demonstrate resumption capability
  console.log('📋 Test 4: Demonstrate Execution Resumption');
  const resumableScript = `
    [ASSIGN]sessionId = "session_${Date.now()}"[END_ASSIGN]
    
    [TOOL_REQUEST]
    {
      "id": "step_1",
      "tool": "processor_a",
      "params": {
        "session": "\${sessionId}",
        "data": "initial_data"
      }
    }
    [END_TOOL_REQUEST]
    
    [TOOL_REQUEST]
    {
      "id": "step_2", 
      "tool": "processor_b",
      "params": {
        "session": "\${sessionId}",
        "input": "\${step_1}"
      }
    }
    [END_TOOL_REQUEST]
    
    [TOOL_REQUEST]
    {
      "id": "step_3",
      "tool": "processor_c", 
      "params": {
        "session": "\${sessionId}",
        "input": "\${step_2}"
      }
    }
    [END_TOOL_REQUEST]
  `;

  const resumableExecutionId = `test_resumable_${Date.now()}`;
  console.log(`🚀 Starting resumable execution: ${resumableExecutionId}`);
  
  // Start execution but don't complete it
  let stepCount = 0;
  for await (const result of durableBlockExecutor.executeDurable(resumableScript, {
    executionId: resumableExecutionId,
    autoCleanup: false
  })) {
    console.log(`  ${result.type}: ${JSON.stringify(result.result || result.error)}`);
    stepCount++;
    
    // Simulate interruption after 2 steps
    if (stepCount >= 2) {
      console.log('  🔄 Simulating execution interruption...');
      durableBlockExecutor.pauseExecution(resumableExecutionId);
      break;
    }
  }
  
  console.log('\n  🔄 Resuming execution...');
  
  // Resume the execution
  for await (const result of durableBlockExecutor.resumeExecution(resumableExecutionId)) {
    console.log(`  ${result.type}: ${JSON.stringify(result.result || result.error)}`);
  }
  console.log();

  // Test 5: List and manage executions
  console.log('📋 Test 5: Execution Management');
  const executions = durableBlockExecutor.listExecutions();
  console.log(`📂 Found ${executions.length} executions:`);
  
  for (const execution of executions) {
    const duration = execution.status === 'completed' 
      ? execution.lastUpdate - execution.startTime
      : Date.now() - execution.startTime;
    
    console.log(`  • ${execution.id}: ${execution.status} (${execution.completedSteps.length} steps, ${duration}ms)`);
    if (execution.errors.length > 0) {
      console.log(`    Errors: ${execution.errors.length}`);
    }
  }
  console.log();

  // Cleanup completed executions
  console.log('🧹 Cleaning up completed executions...');
  const cleaned = await durableBlockExecutor.cleanupCompleted();
  console.log(`✅ Cleaned up ${cleaned} completed executions`);

  console.log('\n✅ Durable Execution Tests Complete!');
  console.log('\n🎉 Key Features Demonstrated:');
  console.log('  • Persistent execution state in .tmp directory');
  console.log('  • Automatic resumption after interruption'); 
  console.log('  • Variable persistence across restarts');
  console.log('  • Execution progress tracking');
  console.log('  • Automatic cleanup of completed executions');
  console.log('  • System prompt for AI model integration');
  console.log('  • Support for all control flow structures');
  console.log('  • Interactive prompts with durable state');
}

// Helper function to create AI-friendly execution requests
function createAIExecutionPrompt(userRequest: string): string {
  return `
${STREAMING_EXECUTION_SYSTEM_PROMPT}

USER REQUEST: ${userRequest}

Generate a structured workflow using the block syntax above that accomplishes the user's request. 
Include appropriate error handling, retries, and user prompts for missing information.
Make the workflow resumable and durable by using meaningful step IDs and variable names.
  `.trim();
}

// Run the demonstration
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateDurableExecution().catch(console.error);
}

export { demonstrateDurableExecution, createAIExecutionPrompt };