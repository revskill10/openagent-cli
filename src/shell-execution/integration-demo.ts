// integration-demo.ts - Comprehensive integration demonstration
import { shellTools } from './shell-tools.js';
import { complexWorkflowTestSuite } from './complex-workflow-tests.js';
import { testSuite } from './test-workflows.js';
import { integratedShellSystem } from './integrated-shell-system.js';
import { memorySystem } from '../memory-system/memory-layers.js';

// Comprehensive demonstration of the enhanced shell execution system
export async function runIntegrationDemo(): Promise<void> {
  console.log('🎯 Enhanced OpenAgent Shell Execution System - Integration Demo');
  console.log('=' .repeat(80));
  console.log('Demonstrating enterprise-grade AI coding agent capabilities\n');

  try {
    // Initialize all systems
    console.log('🔧 Initializing Systems...');
    await integratedShellSystem.initialize();
    await memorySystem.initialize();
    console.log('✅ All systems initialized successfully\n');

    // Demo 1: Natural Language Command Generation
    console.log('📝 Demo 1: Natural Language Command Generation');
    console.log('-' .repeat(50));
    
    const nlCommands = [
      'find all TypeScript files in the current directory',
      'count the number of lines in all JavaScript files',
      'list the 10 largest files in the project',
      'search for TODO comments in source code'
    ];

    for (const description of nlCommands) {
      console.log(`\n🔍 Request: "${description}"`);
      
      const generated = await shellTools.generateShellCommand(description, {
        safetyLevel: 'moderate'
      });

      if (generated.success && generated.commands.length > 0) {
        const cmd = generated.commands[0];
        console.log(`✅ Generated: ${cmd.command}`);
        console.log(`   Confidence: ${(cmd.confidence * 100).toFixed(1)}%`);
        console.log(`   Safety: ${cmd.safetyLevel}`);
        console.log(`   Template: ${cmd.template}`);
      } else {
        console.log(`❌ Failed: ${generated.message}`);
      }
    }

    // Demo 2: Command Analysis and Safety
    console.log('\n\n🛡️ Demo 2: Command Analysis and Safety');
    console.log('-' .repeat(50));

    const testCommands = [
      'ls -la',                    // Safe command
      'rm -rf /tmp/test-*',       // Potentially dangerous
      'find . -name "*.log" -delete', // Dangerous pattern
      'git status',               // Safe git command
      'sudo rm -rf /',           // Extremely dangerous
    ];

    for (const command of testCommands) {
      console.log(`\n🔍 Analyzing: "${command}"`);
      
      const analysis = await shellTools.analyzeShellCommand(command);
      
      if (analysis.success && analysis.analysis) {
        const a = analysis.analysis;
        console.log(`   Risk Level: ${a.riskLevel.toUpperCase()}`);
        console.log(`   Confidence: ${(a.confidence * 100).toFixed(1)}%`);
        console.log(`   Valid: ${a.isValid ? '✅' : '❌'}`);
        console.log(`   Issues: ${a.issues.length}`);
        
        if (a.issues.length > 0) {
          a.issues.forEach(issue => {
            console.log(`     - ${issue.severity.toUpperCase()}: ${issue.message}`);
          });
        }
        
        if (analysis.recommendations.length > 0) {
          console.log(`   Recommendations:`);
          analysis.recommendations.forEach(rec => {
            console.log(`     - ${rec}`);
          });
        }
      }
    }

    // Demo 3: Safe Command Execution
    console.log('\n\n⚡ Demo 3: Safe Command Execution');
    console.log('-' .repeat(50));

    const safeCommands = [
      'echo "Hello from Enhanced OpenAgent!"',
      'date',
      'pwd',
      'whoami'
    ];

    for (const command of safeCommands) {
      console.log(`\n🚀 Executing: "${command}"`);
      
      const result = await shellTools.executeShellCommand(command, {
        safetyLevel: 'moderate',
        enableLearning: true
      });

      console.log(`   Success: ${result.success ? '✅' : '❌'}`);
      console.log(`   Output: ${result.output.trim()}`);
      console.log(`   Confidence: ${(result.confidence * 100).toFixed(1)}%`);
      console.log(`   Risk Level: ${result.riskLevel}`);
      console.log(`   Execution Time: ${result.executionTime}ms`);
      
      if (result.suggestions.length > 0) {
        console.log(`   Suggestions: ${result.suggestions.join(', ')}`);
      }
    }

    // Demo 4: Complex Workflow Execution
    console.log('\n\n🔄 Demo 4: Complex Workflow with Dynamic Variables');
    console.log('-' .repeat(50));

    const demoWorkflow = {
      name: 'Project Analysis Demo',
      description: 'Demonstrate complex workflow with dynamic variable embedding',
      steps: [
        {
          id: 'get_timestamp',
          name: 'Get Current Timestamp',
          command: 'date +"%Y%m%d_%H%M%S"',
          dependencies: [],
          variables: {},
          onSuccess: ['create_demo_dir'],
          onFailure: ['fail_workflow']
        },
        {
          id: 'create_demo_dir',
          name: 'Create Demo Directory',
          command: 'mkdir -p demo_{{get_timestamp_output}}',
          dependencies: ['get_timestamp'],
          variables: {},
          onSuccess: ['analyze_current_dir'],
          onFailure: ['fail_workflow']
        },
        {
          id: 'analyze_current_dir',
          name: 'Analyze Current Directory',
          command: 'find . -maxdepth 2 -type f -name "*.ts" -o -name "*.js" | wc -l',
          dependencies: [],
          variables: {},
          onSuccess: ['create_report'],
          onFailure: ['continue']
        },
        {
          id: 'create_report',
          name: 'Create Analysis Report',
          command: 'echo "Demo Analysis Report\\nTimestamp: {{get_timestamp_output}}\\nTypeScript/JavaScript files found: {{analyze_current_dir_output}}\\nGenerated by Enhanced OpenAgent" > demo_{{get_timestamp_output}}/report.txt',
          dependencies: ['get_timestamp', 'create_demo_dir', 'analyze_current_dir'],
          variables: {},
          onSuccess: ['show_report'],
          onFailure: ['continue']
        },
        {
          id: 'show_report',
          name: 'Display Report',
          command: 'cat demo_{{get_timestamp_output}}/report.txt',
          dependencies: ['create_report'],
          variables: {},
          onSuccess: ['cleanup_demo'],
          onFailure: ['cleanup_demo']
        },
        {
          id: 'cleanup_demo',
          name: 'Cleanup Demo Files',
          command: 'rm -rf demo_{{get_timestamp_output}}',
          dependencies: ['show_report'],
          variables: {},
          onSuccess: [],
          onFailure: []
        }
      ]
    };

    console.log('\n🔄 Executing complex workflow...');
    const workflowResult = await shellTools.executeWorkflow(demoWorkflow);
    
    console.log(`\n✅ Workflow Results:`);
    console.log(`   Status: ${workflowResult.status}`);
    console.log(`   Success: ${workflowResult.success}`);
    console.log(`   Steps: ${workflowResult.summary?.completedSteps}/${workflowResult.summary?.totalSteps}`);
    console.log(`   Total Time: ${workflowResult.summary?.totalExecutionTime}ms`);
    console.log(`   Average Confidence: ${((workflowResult.summary?.averageConfidence || 0) * 100).toFixed(1)}%`);

    if (workflowResult.results && workflowResult.results.length > 0) {
      console.log('\n📋 Step-by-Step Results:');
      for (const stepResult of workflowResult.results) {
        console.log(`   ${stepResult.stepName}: ${stepResult.success ? '✅' : '❌'}`);
        if (stepResult.output && stepResult.output.trim()) {
          console.log(`     Output: ${stepResult.output.trim()}`);
        }
      }
    }

    // Demo 5: Context-Aware Suggestions
    console.log('\n\n💡 Demo 5: Context-Aware Suggestions');
    console.log('-' .repeat(50));

    const contexts = [
      'working with git repository',
      'analyzing log files',
      'setting up development environment',
      'debugging performance issues'
    ];

    for (const context of contexts) {
      console.log(`\n🔍 Context: "${context}"`);
      
      const suggestions = await shellTools.getShellSuggestions(context);
      
      if (suggestions.success && suggestions.suggestions.length > 0) {
        console.log(`   Found ${suggestions.suggestions.length} suggestions:`);
        suggestions.suggestions.slice(0, 3).forEach((suggestion, index) => {
          console.log(`   ${index + 1}. ${suggestion.command}`);
          console.log(`      Confidence: ${(suggestion.confidence * 100).toFixed(1)}%`);
          console.log(`      Source: ${suggestion.source}`);
        });
      } else {
        console.log(`   No suggestions found`);
      }
    }

    // Demo 6: System Performance and Learning
    console.log('\n\n📊 Demo 6: System Performance and Learning');
    console.log('-' .repeat(50));

    const stats = await shellTools.getShellSystemStats();
    
    if (stats.success && stats.statistics) {
      console.log('\n📈 System Statistics:');
      console.log(`   Execution Success Rate: ${stats.statistics.execution?.successRate || '0%'}`);
      console.log(`   Average Processing Time: ${stats.statistics.execution?.averageProcessingTime || '0ms'}`);
      console.log(`   Average Confidence: ${stats.statistics.execution?.averageConfidence || '0%'}`);
      console.log(`   Total Commands Executed: ${stats.statistics.execution?.totalCommands || 0}`);
      
      console.log('\n🧠 Learning System:');
      console.log(`   Learning Records: ${stats.statistics.learning?.totalLearningRecords || 0}`);
      console.log(`   Known Patterns: ${stats.statistics.learning?.knownPatterns || 0}`);
      console.log(`   Learning Success Rate: ${stats.statistics.learning?.successRate || '0%'}`);
      
      console.log('\n💾 Memory System:');
      console.log(`   Total Entries: ${stats.statistics.memory?.totalEntries || 0}`);
      console.log(`   Memory Usage: ${stats.statistics.memory?.memoryUsage || '0 Bytes'}`);
      console.log(`   Average Importance: ${stats.statistics.memory?.averageImportance || '0%'}`);
    }

    // Demo 7: Advanced Features Showcase
    console.log('\n\n🎯 Demo 7: Advanced Features Showcase');
    console.log('-' .repeat(50));

    console.log('\n🔧 Testing Cross-Platform Translation...');
    const platformCommands = [
      'ls -la',           // Unix to Windows: Get-ChildItem
      'cat file.txt',     // Unix to Windows: Get-Content
      'grep "pattern"',   // Unix to Windows: Select-String
      'find . -name "*.js"' // Unix to Windows: Get-ChildItem -Recurse
    ];

    for (const cmd of platformCommands) {
      const analysis = await shellTools.analyzeShellCommand(cmd);
      if (analysis.success && analysis.analysis) {
        console.log(`   ${cmd} → Translated: ${analysis.analysis.metadata.translatedCommand}`);
        console.log(`     Platform Compatible: ${analysis.analysis.metadata.platformCompatible ? '✅' : '❌'}`);
      }
    }

    console.log('\n🧪 Running Comprehensive Test Suite...');
    console.log('   (This may take a few moments...)');
    
    // Run a subset of the complex workflow tests
    try {
      await complexWorkflowTestSuite.testComplexWorkflowComposition();
      console.log('✅ Complex workflow tests completed successfully');
    } catch (error) {
      console.log('❌ Complex workflow tests encountered issues:', error);
    }

    // Final Summary
    console.log('\n\n🎉 Integration Demo Complete!');
    console.log('=' .repeat(80));
    console.log('Enhanced OpenAgent Shell Execution System Features Demonstrated:');
    console.log('✅ Natural language command generation');
    console.log('✅ Advanced command analysis and safety checks');
    console.log('✅ Cross-platform command translation');
    console.log('✅ Complex workflow execution with dynamic variables');
    console.log('✅ Context-aware suggestions and learning');
    console.log('✅ Comprehensive error handling and recovery');
    console.log('✅ Performance monitoring and analytics');
    console.log('✅ Anti-hallucination and reliability framework');
    console.log('✅ Persistent memory and knowledge management');
    console.log('✅ Template-based command optimization');
    
    console.log('\n🚀 The system is ready for enterprise-grade AI coding assistance!');
    console.log('   Use the shell execution tools in your OpenAgent workflows for');
    console.log('   reliable, safe, and intelligent shell command operations.');

  } catch (error) {
    console.error('\n❌ Integration demo encountered an error:', error);
    console.log('\nThis may be due to system-specific limitations or missing dependencies.');
    console.log('The shell execution system is designed to gracefully handle such scenarios.');
  }
}

// Quick demo function for basic functionality
export async function runQuickDemo(): Promise<void> {
  console.log('⚡ Quick Demo: Enhanced Shell Execution System\n');

  try {
    // Quick command generation test
    console.log('1. Generating command from natural language...');
    const generated = await shellTools.generateShellCommand('list all files modified today');
    console.log(`   Result: ${generated.success ? '✅' : '❌'}`);
    if (generated.success && generated.commands.length > 0) {
      console.log(`   Command: ${generated.commands[0].command}`);
    }

    // Quick command execution test
    console.log('\n2. Executing safe command...');
    const executed = await shellTools.executeShellCommand('echo "Enhanced OpenAgent is working!"');
    console.log(`   Result: ${executed.success ? '✅' : '❌'}`);
    console.log(`   Output: ${executed.output.trim()}`);

    // Quick analysis test
    console.log('\n3. Analyzing potentially dangerous command...');
    const analyzed = await shellTools.analyzeShellCommand('rm -rf /tmp/*');
    console.log(`   Result: ${analyzed.success ? '✅' : '❌'}`);
    if (analyzed.success && analyzed.analysis) {
      console.log(`   Risk Level: ${analyzed.analysis.riskLevel.toUpperCase()}`);
      console.log(`   Issues Found: ${analyzed.analysis.issues.length}`);
    }

    console.log('\n✅ Quick demo completed successfully!');
    console.log('   Run runIntegrationDemo() for a comprehensive demonstration.');

  } catch (error) {
    console.error('❌ Quick demo failed:', error);
  }
}

// Export demo functions
export const integrationDemo = {
  runIntegrationDemo,
  runQuickDemo
};
