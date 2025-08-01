#!/usr/bin/env node
// test-interactive-prompts.ts - Test interactive prompts and user input handling

import { streamingBlockExecutor } from './streaming-block-executor.js';
import { interactiveBlockExecutor } from './interactive-block-executor.js';
import { consoleInputHandler, mockInputHandler } from './console-input-handler.js';

async function demonstrateInteractivePrompts() {
  console.log('🎯 Testing Interactive PROMPT Token Support\n');

  // Test 1: Basic text prompt
  console.log('📋 Test 1: Basic Text Prompt');
  const textPromptScript = `
    [PROMPT]
    {
      "id": "user_name_prompt",
      "type": "text",
      "message": "What is your name?",
      "variable": "userName",
      "required": true,
      "validation": {
        "pattern": "^[a-zA-Z\\s]+$",
        "message": "Name should only contain letters and spaces"
      }
    }
    [END_PROMPT]
    
    [ASSIGN]greeting = "Hello, " + \${userName} + "! Welcome to OpenAgent!"[END_ASSIGN]
    
    [TOOL_REQUEST]
    {
      "id": "welcome_message",
      "tool": "console_log",
      "params": {
        "message": "\${greeting}"
      }
    }
    [END_TOOL_REQUEST]
  `;

  // Set up mock response for automated testing
  mockInputHandler.setResponse('userName', 'Alice Cooper');
  
  console.log('🤖 Using mock input handler for automated demo...');
  for await (const result of streamingBlockExecutor.executePromptStreaming(textPromptScript, {
    interactive: true,
    inputHandler: mockInputHandler
  })) {
    console.log(`  ${result.type}: ${JSON.stringify(result.result || result.error)}`);
    if (result.waitingForInput) {
      console.log(`  📝 Waiting for user input: ${result.promptNeeded?.message}`);
    }
    if (result.userResponse) {
      console.log(`  👤 User responded: ${result.userResponse}`);
    }
  }
  console.log();

  // Test 2: Select prompt
  console.log('📋 Test 2: Select Prompt');
  const selectPromptScript = `
    [PROMPT]
    {
      "id": "deployment_env_prompt",
      "type": "select",
      "message": "Choose deployment environment",
      "variable": "environment",
      "required": true,
      "options": [
        {"label": "Development", "value": "dev"},
        {"label": "Staging", "value": "staging"},
        {"label": "Production", "value": "prod"}
      ]
    }
    [END_PROMPT]
    
    [TOOL_REQUEST]
    {
      "id": "deploy_app",
      "tool": "deploy",
      "params": {
        "environment": "\${environment}",
        "version": "1.2.3"
      }
    }
    [END_TOOL_REQUEST]
  `;

  mockInputHandler.setResponse('environment', 'staging');
  
  for await (const result of streamingBlockExecutor.executePromptStreaming(selectPromptScript, {
    interactive: true,
    inputHandler: mockInputHandler
  })) {
    console.log(`  ${result.type}: ${JSON.stringify(result.result || result.error)}`);
    if (result.promptNeeded?.options) {
      console.log(`  📋 Options: ${result.promptNeeded.options.map(o => `${o.label}=${o.value}`).join(', ')}`);
    }
  }
  console.log();

  // Test 3: Number prompt with validation
  console.log('📋 Test 3: Number Prompt with Validation');
  const numberPromptScript = `
    [PROMPT]
    {
      "id": "batch_size_prompt",
      "type": "number",
      "message": "Enter batch size for processing",
      "variable": "batchSize",
      "required": true,
      "default": 100,
      "validation": {
        "min": 1,
        "max": 1000,
        "message": "Batch size must be between 1 and 1000"
      }
    }
    [END_PROMPT]
    
    [TOOL_REQUEST]
    {
      "id": "process_batch",
      "tool": "batch_processor",
      "params": {
        "size": \${batchSize},
        "type": "data_processing"
      }
    }
    [END_TOOL_REQUEST]
  `;

  mockInputHandler.setResponse('batchSize', 250);
  
  for await (const result of streamingBlockExecutor.executePromptStreaming(numberPromptScript, {
    interactive: true,
    inputHandler: mockInputHandler
  })) {
    console.log(`  ${result.type}: ${JSON.stringify(result.result || result.error)}`);
  }
  console.log();

  // Test 4: Confirm prompt
  console.log('📋 Test 4: Confirm Prompt');
  const confirmPromptScript = `
    [PROMPT]
    {
      "id": "delete_confirm_prompt",
      "type": "confirm",
      "message": "Are you sure you want to delete all temporary files?",
      "variable": "confirmDelete",
      "required": true,
      "default": false
    }
    [END_PROMPT]
    
    [IF]\${confirmDelete} === true
    [TOOL_REQUEST]
    {
      "id": "delete_temp_files",
      "tool": "file_system",
      "params": {
        "action": "delete",
        "path": "/tmp/*",
        "recursive": true
      }
    }
    [END_TOOL_REQUEST]
    [END_IF]
    
    [IF]\${confirmDelete} === false
    [TOOL_REQUEST]
    {
      "id": "skip_delete",
      "tool": "console_log",
      "params": {
        "message": "Delete operation cancelled by user"
      }
    }
    [END_TOOL_REQUEST]
    [END_IF]
  `;

  mockInputHandler.setResponse('confirmDelete', false);
  
  for await (const result of streamingBlockExecutor.executePromptStreaming(confirmPromptScript, {
    interactive: true,
    inputHandler: mockInputHandler
  })) {
    console.log(`  ${result.type}: ${JSON.stringify(result.result || result.error)}`);
  }
  console.log();

  // Test 5: Complex workflow with multiple prompts and missing argument detection
  console.log('📋 Test 5: Complex Workflow - Auto-Prompt for Missing Arguments');
  const complexWorkflowScript = `
    [TOOL_REQUEST]
    {
      "id": "api_call",
      "tool": "http_request",
      "params": {
        "url": "https://api.example.com/users/\${userId}",
        "method": "GET",
        "headers": {
          "Authorization": "Bearer \${apiToken}",
          "Content-Type": "application/json"
        }
      }
    }
    [END_TOOL_REQUEST]
    
    [TOOL_REQUEST]
    {
      "id": "send_notification",
      "tool": "email",
      "params": {
        "to": "\${userEmail}",
        "subject": "Account Update",
        "body": "Your account has been updated successfully.",
        "priority": "\${emailPriority}"
      }
    }
    [END_TOOL_REQUEST]
  `;

  // Set up responses for the missing arguments
  mockInputHandler.setResponses({
    userId: '12345',
    apiToken: 'sk-test-abc123',
    userEmail: 'user@example.com',
    emailPriority: 'normal'
  });
  
  console.log('🔍 This will auto-detect missing arguments and prompt for them...');
  for await (const result of streamingBlockExecutor.executePromptStreaming(complexWorkflowScript, {
    interactive: true,
    inputHandler: mockInputHandler
  })) {
    console.log(`  ${result.type}: ${JSON.stringify(result.result || result.error)}`);
    if (result.waitingForInput) {
      console.log(`  🤔 Auto-prompting for missing argument: ${result.promptNeeded?.variable}`);
    }
  }
  console.log();

  // Test 6: Loop with user input
  console.log('📋 Test 6: Loop with User Input');
  const loopPromptScript = `
    [ASSIGN]counter = 0[END_ASSIGN]
    [ASSIGN]maxAttempts = 3[END_ASSIGN]
    [ASSIGN]userWantsToContinue = true[END_ASSIGN]
    
    [WHILE]\${counter} < \${maxAttempts} && \${userWantsToContinue} === true
    
    [ASSIGN]counter = \${counter} + 1[END_ASSIGN]
    
    [TOOL_REQUEST]
    {
      "id": "attempt_\${counter}",
      "tool": "process_data",
      "params": {
        "attempt": \${counter},
        "data": "sample_data_\${counter}"
      }
    }
    [END_TOOL_REQUEST]
    
    [PROMPT]
    {
      "id": "continue_prompt_\${counter}",
      "type": "confirm",
      "message": "Continue with next attempt? (Attempt \${counter} of \${maxAttempts})",
      "variable": "userWantsToContinue",
      "default": true
    }
    [END_PROMPT]
    
    [END_WHILE]
  `;

  // Mock responses for the loop
  mockInputHandler.setResponses({
    userWantsToContinue: true // Will continue for first iteration, then we'll see
  });
  
  let promptCount = 0;
  for await (const result of streamingBlockExecutor.executePromptStreaming(loopPromptScript, {
    interactive: true,
    inputHandler: mockInputHandler
  })) {
    console.log(`  ${result.type}: ${JSON.stringify(result.result || result.error)}`);
    
    // After first prompt, set to false to exit loop
    if (result.type === 'prompt' && promptCount++ === 0) {
      mockInputHandler.setResponse('userWantsToContinue', false);
    }
  }
  console.log();

  console.log('✅ Interactive PROMPT Token Tests Complete!');
  console.log('\n🎉 Key Features Demonstrated:');
  console.log('  • Text input prompts with validation');
  console.log('  • Select prompts with multiple options');
  console.log('  • Number prompts with min/max validation');
  console.log('  • Confirm prompts (yes/no)');
  console.log('  • Automatic missing argument detection');
  console.log('  • Interactive loops with user decisions');
  console.log('  • Full integration with control flow (IF/WHILE/ASSIGN)');
  
  // Cleanup
  consoleInputHandler.cleanup();
}

// Helper function to create common prompt patterns
function createPromptExamples() {
  const executor = streamingBlockExecutor;
  
  return {
    // User credentials prompt
    credentialsPrompt: `
      ${executor.createTextPrompt('username', 'Enter your username:', { required: true })}
      ${executor.createTextPrompt('password', 'Enter your password:', { 
        required: true,
        validation: { min: 8, message: 'Password must be at least 8 characters' }
      })}
    `,
    
    // Deployment configuration prompt
    deploymentPrompt: `
      ${executor.createSelectPrompt('environment', 'Select deployment environment:', [
        { label: 'Development', value: 'dev' },
        { label: 'Staging', value: 'staging' },
        { label: 'Production', value: 'prod' }
      ])}
      ${executor.createConfirmPrompt('autoMigrate', 'Run database migrations automatically?', { default: true })}
      ${executor.createNumberPrompt('replicas', 'Number of replicas:', { 
        default: 1, 
        validation: { min: 1, max: 10 }
      })}
    `,
    
    // File processing prompt
    fileProcessingPrompt: `
      ${executor.createTextPrompt('inputPath', 'Enter input file path:', { required: true })}
      ${executor.createTextPrompt('outputPath', 'Enter output file path:', { required: true })}
      ${executor.createSelectPrompt('format', 'Select output format:', [
        { label: 'JSON', value: 'json' },
        { label: 'CSV', value: 'csv' }, 
        { label: 'XML', value: 'xml' }
      ])}
      ${executor.createConfirmPrompt('overwrite', 'Overwrite existing files?', { default: false })}
    `
  };
}

// Run the demonstration
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateInteractivePrompts().catch(console.error);
}

export { demonstrateInteractivePrompts, createPromptExamples };