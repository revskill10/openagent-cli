// complex-workflow-tests.ts - Complex workflow composition tests with dynamic variables
import { integratedShellSystem, WorkflowStep } from './integrated-shell-system.js';
import { shellTools } from './shell-tools.js';
import { intelligentFileReader } from '../intelligent-file-reader/intelligent-file-reader.js';
import { memorySystem } from '../memory-system/memory-layers.js';

// Complex workflow: Full-stack project analysis and optimization
export const fullStackAnalysisWorkflow: WorkflowStep[] = [
  {
    id: 'scan_project_structure',
    name: 'Scan Project Structure',
    command: 'find . -type f -name "*.js" -o -name "*.ts" -o -name "*.json" -o -name "*.md" | head -20',
    dependencies: [],
    variables: {},
    onSuccess: ['analyze_package_json'],
    onFailure: ['continue']
  },
  {
    id: 'analyze_package_json',
    name: 'Analyze Package.json',
    command: 'if [ -f package.json ]; then cat package.json | jq -r ".dependencies // {} | keys[]" 2>/dev/null || echo "No dependencies found"; else echo "No package.json found"; fi',
    dependencies: ['scan_project_structure'],
    variables: {},
    onSuccess: ['count_dependencies'],
    onFailure: ['continue']
  },
  {
    id: 'count_dependencies',
    name: 'Count Dependencies',
    command: 'if [ -f package.json ]; then cat package.json | jq -r ".dependencies // {} | length" 2>/dev/null || echo "0"; else echo "0"; fi',
    dependencies: ['analyze_package_json'],
    variables: {},
    onSuccess: ['analyze_code_complexity'],
    onFailure: ['continue']
  },
  {
    id: 'analyze_code_complexity',
    name: 'Analyze Code Complexity',
    command: 'find . -name "*.js" -o -name "*.ts" | xargs wc -l | tail -1 | awk "{print $1}" || echo "0"',
    dependencies: ['count_dependencies'],
    variables: {},
    onSuccess: ['check_test_coverage'],
    onFailure: ['continue']
  },
  {
    id: 'check_test_coverage',
    name: 'Check Test Files',
    command: 'find . -name "*test*" -o -name "*spec*" | wc -l',
    dependencies: ['analyze_code_complexity'],
    variables: {},
    onSuccess: ['generate_analysis_report'],
    onFailure: ['continue']
  },
  {
    id: 'generate_analysis_report',
    name: 'Generate Analysis Report',
    command: 'echo "Project Analysis Report\\nGenerated: $(date)\\nTotal Files: {{scan_project_structure_output}}\\nDependencies: {{count_dependencies_output}}\\nLines of Code: {{analyze_code_complexity_output}}\\nTest Files: {{check_test_coverage_output}}" > analysis-report.md',
    dependencies: ['scan_project_structure', 'count_dependencies', 'analyze_code_complexity', 'check_test_coverage'],
    variables: {},
    onSuccess: ['optimize_suggestions'],
    onFailure: ['continue']
  },
  {
    id: 'optimize_suggestions',
    name: 'Generate Optimization Suggestions',
    command: 'echo "\\n## Optimization Suggestions\\n- Consider reducing dependencies if count > 50\\n- Add more tests if coverage < 20%\\n- Refactor large files if LOC > 10000" >> analysis-report.md',
    dependencies: ['generate_analysis_report'],
    variables: {},
    onSuccess: ['cleanup_analysis'],
    onFailure: ['cleanup_analysis']
  },
  {
    id: 'cleanup_analysis',
    name: 'Cleanup Analysis Files',
    command: 'rm -f analysis-report.md',
    dependencies: ['optimize_suggestions'],
    variables: {},
    onSuccess: [],
    onFailure: []
  }
];

// Complex workflow: Automated testing and CI/CD simulation
export const cicdSimulationWorkflow: WorkflowStep[] = [
  {
    id: 'setup_test_env',
    name: 'Setup Test Environment',
    command: 'mkdir -p ci-test && cd ci-test',
    dependencies: [],
    variables: {},
    onSuccess: ['create_test_project'],
    onFailure: ['fail_workflow']
  },
  {
    id: 'create_test_project',
    name: 'Create Test Project',
    command: 'cd ci-test && echo "{\\"name\\": \\"test-project\\", \\"version\\": \\"1.0.0\\", \\"scripts\\": {\\"test\\": \\"echo \\\\"Running tests...\\\\" && exit 0\\", \\"build\\": \\"echo \\\\"Building project...\\\\" && exit 0\\", \\"lint\\": \\"echo \\\\"Linting code...\\\\" && exit 0\\"}}" > package.json',
    dependencies: ['setup_test_env'],
    variables: {},
    onSuccess: ['run_linting'],
    onFailure: ['fail_workflow']
  },
  {
    id: 'run_linting',
    name: 'Run Code Linting',
    command: 'cd ci-test && npm run lint',
    dependencies: ['create_test_project'],
    variables: {},
    onSuccess: ['run_tests'],
    onFailure: ['handle_lint_failure']
  },
  {
    id: 'handle_lint_failure',
    name: 'Handle Lint Failure',
    command: 'echo "Linting failed, but continuing with tests"',
    dependencies: ['run_linting'],
    variables: {},
    onSuccess: ['run_tests'],
    onFailure: ['run_tests']
  },
  {
    id: 'run_tests',
    name: 'Run Unit Tests',
    command: 'cd ci-test && npm test',
    dependencies: ['run_linting', 'handle_lint_failure'],
    variables: {},
    onSuccess: ['build_project'],
    onFailure: ['handle_test_failure']
  },
  {
    id: 'handle_test_failure',
    name: 'Handle Test Failure',
    command: 'echo "Tests failed - deployment blocked" && exit 1',
    dependencies: ['run_tests'],
    variables: {},
    onSuccess: [],
    onFailure: ['fail_workflow']
  },
  {
    id: 'build_project',
    name: 'Build Project',
    command: 'cd ci-test && npm run build',
    dependencies: ['run_tests'],
    variables: {},
    onSuccess: ['package_artifacts'],
    onFailure: ['handle_build_failure']
  },
  {
    id: 'handle_build_failure',
    name: 'Handle Build Failure',
    command: 'echo "Build failed - deployment blocked" && exit 1',
    dependencies: ['build_project'],
    variables: {},
    onSuccess: [],
    onFailure: ['fail_workflow']
  },
  {
    id: 'package_artifacts',
    name: 'Package Build Artifacts',
    command: 'cd ci-test && tar -czf build-{{run_tests_success}}-$(date +%s).tar.gz package.json',
    dependencies: ['build_project'],
    variables: {},
    onSuccess: ['deploy_simulation'],
    onFailure: ['continue']
  },
  {
    id: 'deploy_simulation',
    name: 'Simulate Deployment',
    command: 'cd ci-test && echo "Deploying build-*.tar.gz to production..." && ls -la *.tar.gz',
    dependencies: ['package_artifacts'],
    variables: {},
    onSuccess: ['cleanup_ci'],
    onFailure: ['cleanup_ci']
  },
  {
    id: 'cleanup_ci',
    name: 'Cleanup CI Environment',
    command: 'rm -rf ci-test',
    dependencies: ['deploy_simulation'],
    variables: {},
    onSuccess: [],
    onFailure: []
  }
];

// Complex workflow: Multi-service monitoring and health checks
export const serviceMonitoringWorkflow: WorkflowStep[] = [
  {
    id: 'check_system_resources',
    name: 'Check System Resources',
    command: 'echo "CPU: $(top -bn1 | grep "Cpu(s)" | awk "{print $2}" | cut -d"%" -f1)% | Memory: $(free | grep Mem | awk "{printf \\"%.1f\\", $3/$2 * 100.0}")% | Disk: $(df -h / | awk "NR==2{print $5}")"',
    dependencies: [],
    variables: {},
    onSuccess: ['check_network_connectivity'],
    onFailure: ['continue']
  },
  {
    id: 'check_network_connectivity',
    name: 'Check Network Connectivity',
    command: 'ping -c 1 8.8.8.8 >/dev/null 2>&1 && echo "Network: OK" || echo "Network: FAILED"',
    dependencies: [],
    variables: {},
    onSuccess: ['check_port_availability'],
    onFailure: ['continue']
  },
  {
    id: 'check_port_availability',
    name: 'Check Port Availability',
    command: 'netstat -tuln | grep -E ":80|:443|:22|:3000" | wc -l',
    dependencies: [],
    variables: {},
    onSuccess: ['simulate_service_health'],
    onFailure: ['continue']
  },
  {
    id: 'simulate_service_health',
    name: 'Simulate Service Health Checks',
    command: 'for service in web-api database cache; do echo "$service: $([ $((RANDOM % 10)) -gt 2 ] && echo "HEALTHY" || echo "UNHEALTHY")"; done',
    dependencies: [],
    variables: {},
    onSuccess: ['aggregate_health_status'],
    onFailure: ['continue']
  },
  {
    id: 'aggregate_health_status',
    name: 'Aggregate Health Status',
    command: 'echo "\\n=== System Health Report ===\\nTimestamp: $(date)\\nSystem: {{check_system_resources_output}}\\nNetwork: {{check_network_connectivity_output}}\\nOpen Ports: {{check_port_availability_output}}\\nServices:\\n{{simulate_service_health_output}}" > health-report.txt',
    dependencies: ['check_system_resources', 'check_network_connectivity', 'check_port_availability', 'simulate_service_health'],
    variables: {},
    onSuccess: ['analyze_health_trends'],
    onFailure: ['continue']
  },
  {
    id: 'analyze_health_trends',
    name: 'Analyze Health Trends',
    command: 'echo "\\n=== Health Analysis ===\\nStatus: $(grep -q "UNHEALTHY" health-report.txt && echo "CRITICAL - Unhealthy services detected" || echo "OK - All services healthy")\\nRecommendations: Monitor resource usage and service dependencies" >> health-report.txt',
    dependencies: ['aggregate_health_status'],
    variables: {},
    onSuccess: ['send_alerts'],
    onFailure: ['continue']
  },
  {
    id: 'send_alerts',
    name: 'Send Health Alerts',
    command: 'if grep -q "CRITICAL" health-report.txt; then echo "ALERT: Critical health issues detected - $(date)" > alert.log; else echo "INFO: System health normal - $(date)" > alert.log; fi',
    dependencies: ['analyze_health_trends'],
    variables: {},
    onSuccess: ['cleanup_monitoring'],
    onFailure: ['cleanup_monitoring']
  },
  {
    id: 'cleanup_monitoring',
    name: 'Cleanup Monitoring Files',
    command: 'rm -f health-report.txt alert.log',
    dependencies: ['send_alerts'],
    variables: {},
    onSuccess: [],
    onFailure: []
  }
];

// Complex workflow: Data processing pipeline with error handling
export const dataProcessingWorkflow: WorkflowStep[] = [
  {
    id: 'create_sample_data',
    name: 'Create Sample Data',
    command: 'mkdir -p data-pipeline && for i in {1..5}; do echo "record_$i,value_$((RANDOM % 100)),$(date +%s)" >> data-pipeline/input.csv; done',
    dependencies: [],
    variables: {},
    onSuccess: ['validate_input_data'],
    onFailure: ['fail_workflow']
  },
  {
    id: 'validate_input_data',
    name: 'Validate Input Data',
    command: 'cd data-pipeline && wc -l input.csv | awk "{print $1}"',
    dependencies: ['create_sample_data'],
    variables: {},
    onSuccess: ['process_data_stage1'],
    onFailure: ['handle_validation_error']
  },
  {
    id: 'handle_validation_error',
    name: 'Handle Validation Error',
    command: 'echo "Data validation failed - creating fallback data" && echo "fallback_record,0,$(date +%s)" > data-pipeline/input.csv',
    dependencies: ['validate_input_data'],
    variables: {},
    onSuccess: ['process_data_stage1'],
    onFailure: ['fail_workflow']
  },
  {
    id: 'process_data_stage1',
    name: 'Data Processing Stage 1 - Transform',
    command: 'cd data-pipeline && awk -F"," "{print $1 \\"_transformed,\\" $2*2 \\",\\" $3}" input.csv > stage1.csv',
    dependencies: ['validate_input_data', 'handle_validation_error'],
    variables: {},
    onSuccess: ['process_data_stage2'],
    onFailure: ['handle_stage1_error']
  },
  {
    id: 'handle_stage1_error',
    name: 'Handle Stage 1 Error',
    command: 'echo "Stage 1 processing failed - using original data" && cd data-pipeline && cp input.csv stage1.csv',
    dependencies: ['process_data_stage1'],
    variables: {},
    onSuccess: ['process_data_stage2'],
    onFailure: ['fail_workflow']
  },
  {
    id: 'process_data_stage2',
    name: 'Data Processing Stage 2 - Aggregate',
    command: 'cd data-pipeline && awk -F"," "{sum+=$2; count++} END {print \\"total_records,\\" count \\",average_value,\\" sum/count \\",processed_at,\\" systime()}" stage1.csv > stage2.csv',
    dependencies: ['process_data_stage1', 'handle_stage1_error'],
    variables: {},
    onSuccess: ['validate_output'],
    onFailure: ['handle_stage2_error']
  },
  {
    id: 'handle_stage2_error',
    name: 'Handle Stage 2 Error',
    command: 'echo "Stage 2 processing failed - generating summary" && cd data-pipeline && echo "error_summary,0,0,$(date +%s)" > stage2.csv',
    dependencies: ['process_data_stage2'],
    variables: {},
    onSuccess: ['validate_output'],
    onFailure: ['fail_workflow']
  },
  {
    id: 'validate_output',
    name: 'Validate Output Data',
    command: 'cd data-pipeline && if [ -s stage2.csv ]; then echo "Output validation: PASSED"; else echo "Output validation: FAILED"; fi',
    dependencies: ['process_data_stage2', 'handle_stage2_error'],
    variables: {},
    onSuccess: ['generate_processing_report'],
    onFailure: ['continue']
  },
  {
    id: 'generate_processing_report',
    name: 'Generate Processing Report',
    command: 'cd data-pipeline && echo "Data Processing Report\\nInput Records: {{validate_input_data_output}}\\nProcessing Status: {{validate_output_output}}\\nOutput: $(cat stage2.csv)\\nCompleted: $(date)" > report.txt',
    dependencies: ['validate_input_data', 'validate_output'],
    variables: {},
    onSuccess: ['archive_results'],
    onFailure: ['continue']
  },
  {
    id: 'archive_results',
    name: 'Archive Processing Results',
    command: 'cd data-pipeline && tar -czf processing-results-$(date +%s).tar.gz *.csv report.txt',
    dependencies: ['generate_processing_report'],
    variables: {},
    onSuccess: ['cleanup_pipeline'],
    onFailure: ['cleanup_pipeline']
  },
  {
    id: 'cleanup_pipeline',
    name: 'Cleanup Pipeline Files',
    command: 'rm -rf data-pipeline',
    dependencies: ['archive_results'],
    variables: {},
    onSuccess: [],
    onFailure: []
  }
];

// Test function for complex workflow composition
export async function testComplexWorkflowComposition(): Promise<void> {
  console.log('🚀 Testing Complex Workflow Composition with Dynamic Variables...\n');

  // Initialize systems
  await integratedShellSystem.initialize();
  await memorySystem.initialize();

  const complexWorkflows = [
    {
      name: 'Full-Stack Analysis',
      description: 'Comprehensive project analysis with dynamic variable embedding',
      steps: fullStackAnalysisWorkflow,
      expectedFeatures: ['Dynamic variable substitution', 'Multi-step dependencies', 'Conditional execution']
    },
    {
      name: 'CI/CD Simulation',
      description: 'Automated testing pipeline with error handling',
      steps: cicdSimulationWorkflow,
      expectedFeatures: ['Error handling workflows', 'Conditional branching', 'Artifact generation']
    },
    {
      name: 'Service Monitoring',
      description: 'Multi-service health monitoring with aggregation',
      steps: serviceMonitoringWorkflow,
      expectedFeatures: ['Parallel execution', 'Data aggregation', 'Health analysis']
    },
    {
      name: 'Data Processing Pipeline',
      description: 'Multi-stage data processing with error recovery',
      steps: dataProcessingWorkflow,
      expectedFeatures: ['Error recovery', 'Data validation', 'Pipeline stages']
    }
  ];

  const results = [];

  for (const workflow of complexWorkflows) {
    console.log(`\n📋 Testing ${workflow.name}...`);
    console.log(`   Description: ${workflow.description}`);
    console.log(`   Expected Features: ${workflow.expectedFeatures.join(', ')}`);

    try {
      const startTime = Date.now();
      
      const result = await shellTools.executeWorkflow({
        name: workflow.name,
        description: workflow.description,
        steps: workflow.steps,
        variables: {
          timestamp: new Date().toISOString(),
          workflow_id: `test_${Date.now()}`
        }
      });

      const executionTime = Date.now() - startTime;

      console.log(`\n✅ ${workflow.name} Results:`);
      console.log(`   Status: ${result.status}`);
      console.log(`   Success: ${result.success}`);
      console.log(`   Execution Time: ${executionTime}ms`);
      console.log(`   Steps: ${result.summary?.completedSteps || 0}/${result.summary?.totalSteps || 0}`);
      console.log(`   Average Confidence: ${((result.summary?.averageConfidence || 0) * 100).toFixed(1)}%`);

      // Analyze dynamic variable usage
      if (result.results && result.results.length > 0) {
        console.log(`\n   📊 Dynamic Variable Analysis:`);
        
        let variableSubstitutions = 0;
        let dependencyResolutions = 0;
        
        for (const stepResult of result.results) {
          // Check for variable substitutions in output
          if (stepResult.stepName.includes('{{') || 
              (stepResult.output && stepResult.output.includes('{{') === false && 
               stepResult.stepName.includes('{{'))) {
            variableSubstitutions++;
          }
          
          // Count steps with dependencies
          const step = workflow.steps.find(s => s.id === stepResult.stepId);
          if (step && step.dependencies.length > 0) {
            dependencyResolutions++;
          }
        }
        
        console.log(`   - Variable Substitutions: ${variableSubstitutions}`);
        console.log(`   - Dependency Resolutions: ${dependencyResolutions}`);
        console.log(`   - Error Handling Steps: ${result.results.filter(r => r.stepName.includes('Handle')).length}`);
      }

      // Store results for analysis
      results.push({
        name: workflow.name,
        success: result.success,
        executionTime,
        stepsCompleted: result.summary?.completedSteps || 0,
        totalSteps: result.summary?.totalSteps || 0,
        averageConfidence: result.summary?.averageConfidence || 0,
        features: workflow.expectedFeatures
      });

      // Store execution in memory for learning
      await memorySystem.store({
        type: 'complex_workflow_execution',
        workflowName: workflow.name,
        result,
        features: workflow.expectedFeatures,
        executionTime,
        timestamp: new Date()
      }, 'workflow', {
        importance: result.success ? 0.8 : 0.9, // Failed workflows are more important to learn from
        tags: ['complex_workflow', 'test_execution', workflow.name.toLowerCase().replace(/\s+/g, '_')],
        source: 'complex_workflow_tests'
      });

    } catch (error) {
      console.error(`❌ ${workflow.name} Failed:`, error);
      results.push({
        name: workflow.name,
        success: false,
        executionTime: 0,
        stepsCompleted: 0,
        totalSteps: workflow.steps.length,
        averageConfidence: 0,
        features: workflow.expectedFeatures,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // Generate comprehensive test report
  console.log('\n📊 Complex Workflow Composition Test Summary:');
  console.log('=' .repeat(60));
  
  const successfulWorkflows = results.filter(r => r.success);
  const totalExecutionTime = results.reduce((sum, r) => sum + r.executionTime, 0);
  const averageConfidence = results.reduce((sum, r) => sum + r.averageConfidence, 0) / results.length;
  
  console.log(`Total Workflows Tested: ${results.length}`);
  console.log(`Successful Workflows: ${successfulWorkflows.length}`);
  console.log(`Success Rate: ${((successfulWorkflows.length / results.length) * 100).toFixed(1)}%`);
  console.log(`Total Execution Time: ${totalExecutionTime}ms`);
  console.log(`Average Confidence: ${(averageConfidence * 100).toFixed(1)}%`);
  
  console.log('\n📋 Feature Coverage Analysis:');
  const allFeatures = [...new Set(results.flatMap(r => r.features))];
  for (const feature of allFeatures) {
    const workflowsWithFeature = results.filter(r => r.features.includes(feature));
    const successfulWithFeature = workflowsWithFeature.filter(r => r.success);
    console.log(`   ${feature}: ${successfulWithFeature.length}/${workflowsWithFeature.length} successful`);
  }

  console.log('\n🎯 Dynamic Variable Embedding Test:');
  await testDynamicVariableEmbedding();

  console.log('\n📈 System Performance Analysis:');
  const stats = await shellTools.getShellSystemStats();
  if (stats.success) {
    console.log('   System Statistics:');
    console.log(`   - Total Executions: ${stats.statistics?.execution?.totalCommands || 0}`);
    console.log(`   - Success Rate: ${stats.statistics?.execution?.successRate || '0%'}`);
    console.log(`   - Learning Records: ${stats.statistics?.learning?.totalLearningRecords || 0}`);
    console.log(`   - Memory Usage: ${stats.statistics?.memory?.memoryUsage || '0 Bytes'}`);
  }

  console.log('\n🎉 Complex Workflow Composition Testing Complete!');
}

// Test dynamic variable embedding and reference capabilities
async function testDynamicVariableEmbedding(): Promise<void> {
  console.log('Testing dynamic variable embedding with complex references...');

  const dynamicTestWorkflow: WorkflowStep[] = [
    {
      id: 'generate_uuid',
      name: 'Generate Unique ID',
      command: 'echo "test_$(date +%s)_$RANDOM"',
      dependencies: [],
      variables: {},
      onSuccess: ['create_workspace'],
      onFailure: ['fail_workflow']
    },
    {
      id: 'create_workspace',
      name: 'Create Workspace',
      command: 'mkdir -p workspace_{{generate_uuid_output}} && echo "Workspace created: workspace_{{generate_uuid_output}}"',
      dependencies: ['generate_uuid'],
      variables: {},
      onSuccess: ['populate_workspace'],
      onFailure: ['fail_workflow']
    },
    {
      id: 'populate_workspace',
      name: 'Populate Workspace',
      command: 'echo "File created in {{generate_uuid_output}} at $(date)" > workspace_{{generate_uuid_output}}/data.txt',
      dependencies: ['create_workspace'],
      variables: {},
      onSuccess: ['analyze_workspace'],
      onFailure: ['fail_workspace']
    },
    {
      id: 'analyze_workspace',
      name: 'Analyze Workspace',
      command: 'ls -la workspace_{{generate_uuid_output}}/ && wc -l workspace_{{generate_uuid_output}}/data.txt',
      dependencies: ['populate_workspace'],
      variables: {},
      onSuccess: ['cleanup_workspace'],
      onFailure: ['cleanup_workspace']
    },
    {
      id: 'cleanup_workspace',
      name: 'Cleanup Workspace',
      command: 'rm -rf workspace_{{generate_uuid_output}}',
      dependencies: ['analyze_workspace'],
      variables: {},
      onSuccess: [],
      onFailure: []
    }
  ];

  try {
    const result = await shellTools.executeWorkflow({
      name: 'Dynamic Variable Embedding Test',
      description: 'Test complex dynamic variable embedding and reference',
      steps: dynamicTestWorkflow
    });

    console.log(`   Dynamic Variable Test: ${result.success ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`   Steps Completed: ${result.summary?.completedSteps || 0}/${result.summary?.totalSteps || 0}`);
    
    if (result.results) {
      const uuidStep = result.results.find(r => r.stepId === 'generate_uuid');
      if (uuidStep && uuidStep.output) {
        console.log(`   Generated UUID: ${uuidStep.output.trim()}`);
        
        // Verify UUID was used in subsequent steps
        const workspaceSteps = result.results.filter(r => 
          r.stepId !== 'generate_uuid' && r.output && r.output.includes(uuidStep.output.trim())
        );
        console.log(`   UUID References Found: ${workspaceSteps.length} steps`);
      }
    }
  } catch (error) {
    console.error('   Dynamic Variable Test: ❌ FAILED -', error);
  }
}

// Export test suite
export const complexWorkflowTestSuite = {
  testComplexWorkflowComposition,
  testDynamicVariableEmbedding,
  fullStackAnalysisWorkflow,
  cicdSimulationWorkflow,
  serviceMonitoringWorkflow,
  dataProcessingWorkflow
};
