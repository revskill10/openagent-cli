// test-workflows.ts - Test workflows for shell execution system
import { integratedShellSystem, WorkflowStep } from './integrated-shell-system.js';
import { shellTools } from './shell-tools.js';

// Test workflow: Development environment setup
export const developmentSetupWorkflow: WorkflowStep[] = [
  {
    id: 'check_node',
    name: 'Check Node.js Installation',
    command: 'node --version',
    dependencies: [],
    variables: {},
    onSuccess: ['log_node_version'],
    onFailure: ['install_node']
  },
  {
    id: 'check_npm',
    name: 'Check NPM Installation',
    command: 'npm --version',
    dependencies: ['check_node'],
    variables: {},
    onSuccess: ['log_npm_version'],
    onFailure: ['install_npm']
  },
  {
    id: 'create_project_dir',
    name: 'Create Project Directory',
    command: 'mkdir -p {{project_name}}',
    dependencies: [],
    variables: { project_name: 'test-project' },
    onSuccess: ['navigate_to_project'],
    onFailure: ['fail_workflow']
  },
  {
    id: 'navigate_to_project',
    name: 'Navigate to Project Directory',
    command: 'cd {{project_name}}',
    dependencies: ['create_project_dir'],
    variables: { project_name: 'test-project' },
    onSuccess: ['init_npm'],
    onFailure: ['fail_workflow']
  },
  {
    id: 'init_npm',
    name: 'Initialize NPM Project',
    command: 'npm init -y',
    dependencies: ['navigate_to_project', 'check_npm'],
    variables: {},
    onSuccess: ['install_dependencies'],
    onFailure: ['fail_workflow']
  },
  {
    id: 'install_dependencies',
    name: 'Install Dependencies',
    command: 'npm install express typescript @types/node',
    dependencies: ['init_npm'],
    variables: {},
    onSuccess: ['create_basic_files'],
    onFailure: ['fail_workflow']
  },
  {
    id: 'create_basic_files',
    name: 'Create Basic Project Files',
    command: 'echo "console.log(\'Hello World\');" > index.js',
    dependencies: ['install_dependencies'],
    variables: {},
    onSuccess: ['test_project'],
    onFailure: ['fail_workflow']
  },
  {
    id: 'test_project',
    name: 'Test Project Setup',
    command: 'node index.js',
    dependencies: ['create_basic_files'],
    variables: {},
    onSuccess: ['cleanup'],
    onFailure: ['fail_workflow']
  },
  {
    id: 'cleanup',
    name: 'Cleanup Test Project',
    command: 'cd .. && rm -rf {{project_name}}',
    dependencies: ['test_project'],
    variables: { project_name: 'test-project' },
    onSuccess: [],
    onFailure: []
  }
];

// Test workflow: File operations and analysis
export const fileOperationsWorkflow: WorkflowStep[] = [
  {
    id: 'create_test_dir',
    name: 'Create Test Directory',
    command: 'mkdir -p test-files',
    dependencies: [],
    variables: {},
    onSuccess: ['create_test_files'],
    onFailure: ['fail_workflow']
  },
  {
    id: 'create_test_files',
    name: 'Create Test Files',
    command: 'echo "Test content {{file_number}}" > test-files/file{{file_number}}.txt',
    dependencies: ['create_test_dir'],
    variables: { file_number: '1' },
    onSuccess: ['create_more_files'],
    onFailure: ['fail_workflow']
  },
  {
    id: 'create_more_files',
    name: 'Create More Test Files',
    command: 'for i in {2..5}; do echo "Test content $i" > test-files/file$i.txt; done',
    dependencies: ['create_test_files'],
    variables: {},
    onSuccess: ['list_files'],
    onFailure: ['fail_workflow']
  },
  {
    id: 'list_files',
    name: 'List Created Files',
    command: 'ls -la test-files/',
    dependencies: ['create_more_files'],
    variables: {},
    onSuccess: ['count_files'],
    onFailure: ['fail_workflow']
  },
  {
    id: 'count_files',
    name: 'Count Files',
    command: 'find test-files -name "*.txt" | wc -l',
    dependencies: ['list_files'],
    variables: {},
    onSuccess: ['search_content'],
    onFailure: ['fail_workflow']
  },
  {
    id: 'search_content',
    name: 'Search File Content',
    command: 'grep -r "Test content" test-files/',
    dependencies: ['count_files'],
    variables: {},
    onSuccess: ['copy_files'],
    onFailure: ['fail_workflow']
  },
  {
    id: 'copy_files',
    name: 'Copy Files to Backup',
    command: 'cp -r test-files test-files-backup',
    dependencies: ['search_content'],
    variables: {},
    onSuccess: ['verify_backup'],
    onFailure: ['fail_workflow']
  },
  {
    id: 'verify_backup',
    name: 'Verify Backup',
    command: 'diff -r test-files test-files-backup',
    dependencies: ['copy_files'],
    variables: {},
    onSuccess: ['cleanup_test_files'],
    onFailure: ['cleanup_test_files']
  },
  {
    id: 'cleanup_test_files',
    name: 'Cleanup Test Files',
    command: 'rm -rf test-files test-files-backup',
    dependencies: ['verify_backup'],
    variables: {},
    onSuccess: [],
    onFailure: []
  }
];

// Test workflow: Git operations
export const gitOperationsWorkflow: WorkflowStep[] = [
  {
    id: 'check_git',
    name: 'Check Git Installation',
    command: 'git --version',
    dependencies: [],
    variables: {},
    onSuccess: ['create_repo_dir'],
    onFailure: ['fail_workflow']
  },
  {
    id: 'create_repo_dir',
    name: 'Create Repository Directory',
    command: 'mkdir -p test-repo',
    dependencies: ['check_git'],
    variables: {},
    onSuccess: ['init_git'],
    onFailure: ['fail_workflow']
  },
  {
    id: 'init_git',
    name: 'Initialize Git Repository',
    command: 'cd test-repo && git init',
    dependencies: ['create_repo_dir'],
    variables: {},
    onSuccess: ['config_git'],
    onFailure: ['fail_workflow']
  },
  {
    id: 'config_git',
    name: 'Configure Git',
    command: 'cd test-repo && git config user.name "Test User" && git config user.email "test@example.com"',
    dependencies: ['init_git'],
    variables: {},
    onSuccess: ['create_readme'],
    onFailure: ['fail_workflow']
  },
  {
    id: 'create_readme',
    name: 'Create README File',
    command: 'cd test-repo && echo "# Test Repository" > README.md',
    dependencies: ['config_git'],
    variables: {},
    onSuccess: ['add_files'],
    onFailure: ['fail_workflow']
  },
  {
    id: 'add_files',
    name: 'Add Files to Git',
    command: 'cd test-repo && git add .',
    dependencies: ['create_readme'],
    variables: {},
    onSuccess: ['commit_files'],
    onFailure: ['fail_workflow']
  },
  {
    id: 'commit_files',
    name: 'Commit Files',
    command: 'cd test-repo && git commit -m "Initial commit"',
    dependencies: ['add_files'],
    variables: {},
    onSuccess: ['check_status'],
    onFailure: ['fail_workflow']
  },
  {
    id: 'check_status',
    name: 'Check Git Status',
    command: 'cd test-repo && git status',
    dependencies: ['commit_files'],
    variables: {},
    onSuccess: ['check_log'],
    onFailure: ['fail_workflow']
  },
  {
    id: 'check_log',
    name: 'Check Git Log',
    command: 'cd test-repo && git log --oneline',
    dependencies: ['check_status'],
    variables: {},
    onSuccess: ['cleanup_repo'],
    onFailure: ['cleanup_repo']
  },
  {
    id: 'cleanup_repo',
    name: 'Cleanup Repository',
    command: 'rm -rf test-repo',
    dependencies: ['check_log'],
    variables: {},
    onSuccess: [],
    onFailure: []
  }
];

// Test workflow: System monitoring and analysis
export const systemMonitoringWorkflow: WorkflowStep[] = [
  {
    id: 'check_disk_usage',
    name: 'Check Disk Usage',
    command: 'df -h',
    dependencies: [],
    variables: {},
    onSuccess: ['check_memory'],
    onFailure: ['continue']
  },
  {
    id: 'check_memory',
    name: 'Check Memory Usage',
    command: 'free -h',
    dependencies: [],
    variables: {},
    onSuccess: ['check_processes'],
    onFailure: ['continue']
  },
  {
    id: 'check_processes',
    name: 'Check Running Processes',
    command: 'ps aux | head -10',
    dependencies: [],
    variables: {},
    onSuccess: ['check_network'],
    onFailure: ['continue']
  },
  {
    id: 'check_network',
    name: 'Check Network Connections',
    command: 'netstat -tuln | head -10',
    dependencies: [],
    variables: {},
    onSuccess: ['check_uptime'],
    onFailure: ['continue']
  },
  {
    id: 'check_uptime',
    name: 'Check System Uptime',
    command: 'uptime',
    dependencies: [],
    variables: {},
    onSuccess: ['check_load'],
    onFailure: ['continue']
  },
  {
    id: 'check_load',
    name: 'Check System Load',
    command: 'top -bn1 | head -5',
    dependencies: [],
    variables: {},
    onSuccess: ['generate_report'],
    onFailure: ['continue']
  },
  {
    id: 'generate_report',
    name: 'Generate System Report',
    command: 'echo "System monitoring completed at $(date)" > system-report.txt',
    dependencies: ['check_disk_usage', 'check_memory', 'check_processes', 'check_network', 'check_uptime', 'check_load'],
    variables: {},
    onSuccess: ['cleanup_report'],
    onFailure: ['cleanup_report']
  },
  {
    id: 'cleanup_report',
    name: 'Cleanup Report File',
    command: 'rm -f system-report.txt',
    dependencies: ['generate_report'],
    variables: {},
    onSuccess: [],
    onFailure: []
  }
];

// Test function to run all workflows
export async function runTestWorkflows(): Promise<void> {
  console.log('🚀 Starting Shell Execution System Test Workflows...\n');

  const workflows = [
    { name: 'Development Setup', steps: developmentSetupWorkflow },
    { name: 'File Operations', steps: fileOperationsWorkflow },
    { name: 'Git Operations', steps: gitOperationsWorkflow },
    { name: 'System Monitoring', steps: systemMonitoringWorkflow }
  ];

  for (const workflow of workflows) {
    console.log(`\n📋 Running ${workflow.name} Workflow...`);
    
    try {
      const result = await shellTools.executeWorkflow({
        name: workflow.name,
        description: `Test workflow for ${workflow.name.toLowerCase()}`,
        steps: workflow.steps
      });

      console.log(`✅ ${workflow.name} Workflow Result:`);
      console.log(`   Status: ${result.status}`);
      console.log(`   Success: ${result.success}`);
      console.log(`   Completed Steps: ${result.summary?.completedSteps || 0}/${result.summary?.totalSteps || 0}`);
      console.log(`   Total Time: ${result.summary?.totalExecutionTime || 0}ms`);
      console.log(`   Average Confidence: ${((result.summary?.averageConfidence || 0) * 100).toFixed(1)}%`);

      if (!result.success) {
        console.log(`   Failed Steps: ${result.summary?.failedSteps || 0}`);
        console.log(`   Message: ${result.message}`);
      }
    } catch (error) {
      console.error(`❌ ${workflow.name} Workflow Failed:`, error);
    }
  }

  console.log('\n📊 Getting System Statistics...');
  try {
    const stats = await shellTools.getShellSystemStats();
    if (stats.success) {
      console.log('✅ System Statistics:');
      console.log('   Execution Stats:', stats.statistics?.execution);
      console.log('   Learning Stats:', stats.statistics?.learning);
      console.log('   Memory Stats:', stats.statistics?.memory);
    }
  } catch (error) {
    console.error('❌ Failed to get system statistics:', error);
  }

  console.log('\n🎯 Testing Individual Commands...');
  
  // Test command generation
  try {
    const generated = await shellTools.generateShellCommand('list all JavaScript files in the current directory');
    console.log('✅ Command Generation Result:', generated.success ? 'Success' : 'Failed');
    if (generated.success && generated.commands.length > 0) {
      console.log('   Generated Command:', generated.commands[0].command);
      console.log('   Confidence:', (generated.commands[0].confidence * 100).toFixed(1) + '%');
    }
  } catch (error) {
    console.error('❌ Command generation failed:', error);
  }

  // Test command analysis
  try {
    const analysis = await shellTools.analyzeShellCommand('rm -rf /tmp/test-*');
    console.log('✅ Command Analysis Result:', analysis.success ? 'Success' : 'Failed');
    if (analysis.success && analysis.analysis) {
      console.log('   Risk Level:', analysis.analysis.riskLevel);
      console.log('   Confidence:', (analysis.analysis.confidence * 100).toFixed(1) + '%');
      console.log('   Issues Found:', analysis.analysis.issues.length);
    }
  } catch (error) {
    console.error('❌ Command analysis failed:', error);
  }

  // Test suggestions
  try {
    const suggestions = await shellTools.getShellSuggestions('find large files');
    console.log('✅ Suggestions Result:', suggestions.success ? 'Success' : 'Failed');
    if (suggestions.success) {
      console.log('   Suggestions Found:', suggestions.suggestions.length);
    }
  } catch (error) {
    console.error('❌ Getting suggestions failed:', error);
  }

  console.log('\n🎉 Shell Execution System Test Complete!');
}

// Test function for dynamic variable embedding
export async function testDynamicVariables(): Promise<void> {
  console.log('\n🔄 Testing Dynamic Variable Embedding...');

  // Create a workflow with dynamic variable references
  const dynamicWorkflow: WorkflowStep[] = [
    {
      id: 'get_date',
      name: 'Get Current Date',
      command: 'date +"%Y-%m-%d"',
      dependencies: [],
      variables: {},
      onSuccess: ['create_dated_file'],
      onFailure: ['fail_workflow']
    },
    {
      id: 'create_dated_file',
      name: 'Create File with Date',
      command: 'echo "Created on {{get_date_output}}" > file-{{get_date_output}}.txt',
      dependencies: ['get_date'],
      variables: {},
      onSuccess: ['verify_file'],
      onFailure: ['fail_workflow']
    },
    {
      id: 'verify_file',
      name: 'Verify File Creation',
      command: 'ls -la file-*.txt',
      dependencies: ['create_dated_file'],
      variables: {},
      onSuccess: ['read_file'],
      onFailure: ['fail_workflow']
    },
    {
      id: 'read_file',
      name: 'Read File Content',
      command: 'cat file-*.txt',
      dependencies: ['verify_file'],
      variables: {},
      onSuccess: ['cleanup_dynamic'],
      onFailure: ['cleanup_dynamic']
    },
    {
      id: 'cleanup_dynamic',
      name: 'Cleanup Dynamic Files',
      command: 'rm -f file-*.txt',
      dependencies: ['read_file'],
      variables: {},
      onSuccess: [],
      onFailure: []
    }
  ];

  try {
    const result = await shellTools.executeWorkflow({
      name: 'Dynamic Variables Test',
      description: 'Test dynamic variable embedding and reference',
      steps: dynamicWorkflow
    });

    console.log('✅ Dynamic Variables Test Result:');
    console.log(`   Status: ${result.status}`);
    console.log(`   Success: ${result.success}`);
    console.log(`   Steps Completed: ${result.summary?.completedSteps || 0}/${result.summary?.totalSteps || 0}`);

    // Show step results with variable substitution
    if (result.results) {
      for (const stepResult of result.results) {
        console.log(`   Step "${stepResult.stepName}": ${stepResult.success ? '✅' : '❌'}`);
        if (stepResult.output) {
          console.log(`     Output: ${stepResult.output.trim()}`);
        }
      }
    }
  } catch (error) {
    console.error('❌ Dynamic variables test failed:', error);
  }
}

// Export test functions
export const testSuite = {
  runTestWorkflows,
  testDynamicVariables
};
