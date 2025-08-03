#!/usr/bin/env node

// Docker Demo Script for OpenAgent
import { shellTools } from './dist/shell-execution/shell-tools.js';
import { DockerValidator } from './dist/shell-execution/docker-validator.js';

console.log('🐳 OpenAgent Docker Integration Demo');
console.log('=====================================\n');

async function runDemo() {
  try {
    // 1. Check Docker availability
    console.log('1. Checking Docker availability...');
    const dockerCheck = await DockerValidator.checkDockerAvailability();
    
    if (dockerCheck.available) {
      console.log(`✅ Docker is available (version: ${dockerCheck.version})`);
    } else {
      console.log(`❌ Docker is not available: ${dockerCheck.error}`);
      console.log('Please install Docker to continue with the demo.');
      return;
    }

    // 2. Test Docker command validation
    console.log('\n2. Testing Docker command validation...');
    
    const testCommands = [
      'docker --version',
      'docker ps',
      'docker images',
      'docker run --rm hello-world',
      'docker run --privileged ubuntu', // Should trigger warning
      'docker system prune -f', // Should trigger critical warning
      'docker run -v /:/host ubuntu' // Should trigger security warning
    ];

    for (const cmd of testCommands) {
      console.log(`\n   Testing: ${cmd}`);
      const validation = DockerValidator.validateDockerCommand(cmd);
      console.log(`   Risk Level: ${validation.riskLevel.toUpperCase()}`);
      console.log(`   Safe: ${validation.safe ? '✅' : '❌'}`);
      
      if (validation.issues.length > 0) {
        console.log('   Issues:');
        validation.issues.forEach(issue => {
          const icon = issue.severity === 'critical' ? '🚨' : 
                      issue.severity === 'error' ? '❌' : 
                      issue.severity === 'warning' ? '⚠️' : 'ℹ️';
          console.log(`     ${icon} ${issue.message}`);
        });
      }
      
      if (validation.suggestions.length > 0) {
        console.log('   Suggestions:');
        validation.suggestions.forEach(suggestion => {
          console.log(`     💡 ${suggestion}`);
        });
      }
    }

    // 3. Test safe Docker commands execution
    console.log('\n3. Testing safe Docker command execution...');
    
    const safeCommands = [
      'docker --version',
      'docker ps -a',
      'docker images'
    ];

    for (const cmd of safeCommands) {
      console.log(`\n   Executing: ${cmd}`);
      try {
        const result = await shellTools.executeShellCommand(cmd, {
          safetyLevel: 'moderate',
          enableLearning: false
        });
        
        if (result.success) {
          console.log('   ✅ Success');
          console.log(`   Output: ${result.output?.trim() || 'No output'}`);
        } else {
          console.log('   ❌ Failed');
          console.log(`   Error: ${result.error}`);
        }
      } catch (error) {
        console.log('   ❌ Exception');
        console.log(`   Error: ${error.message}`);
      }
    }

    // 4. Test Docker tools (if available)
    console.log('\n4. Testing Docker tools...');
    
    try {
      // Import Docker tools
      const { dockerTools } = await import('./dist/tools/docker-tools.js');
      
      console.log(`   Available Docker tools: ${dockerTools.length}`);
      dockerTools.forEach(tool => {
        console.log(`   - ${tool.name}: ${tool.description}`);
      });

      // Test list containers tool
      console.log('\n   Testing list_docker_containers tool...');
      const listContainersResult = await dockerTools.find(t => t.name === 'list_docker_containers')?.fn({
        all: true
      });
      
      if (listContainersResult?.success) {
        console.log('   ✅ List containers successful');
        console.log(`   Output: ${listContainersResult.output?.trim() || 'No containers'}`);
      } else {
        console.log('   ❌ List containers failed');
        console.log(`   Error: ${listContainersResult?.error}`);
      }

    } catch (error) {
      console.log(`   ❌ Docker tools not available: ${error.message}`);
    }

    // 5. Test Docker Compose detection
    console.log('\n5. Testing Docker Compose detection...');
    
    try {
      const composeResult = await shellTools.executeShellCommand('docker-compose --version', {
        safetyLevel: 'moderate'
      });
      
      if (composeResult.success) {
        console.log('   ✅ Docker Compose is available');
        console.log(`   Version: ${composeResult.output?.trim()}`);
      } else {
        console.log('   ❌ Docker Compose not available');
      }
    } catch (error) {
      console.log('   ❌ Docker Compose check failed');
    }

    // 6. Show Docker best practices
    console.log('\n6. Docker Best Practices for OpenAgent:');
    console.log('   📋 Recommended practices:');
    console.log('   • Always specify image tags (avoid :latest)');
    console.log('   • Use memory limits for containers');
    console.log('   • Avoid privileged mode unless necessary');
    console.log('   • Use specific volume mounts instead of root');
    console.log('   • Prefer bridge networking over host networking');
    console.log('   • Use multi-stage builds for smaller images');
    console.log('   • Scan images for vulnerabilities');
    console.log('   • Use .dockerignore files');

    console.log('\n✅ Docker integration demo completed successfully!');
    console.log('\n🚀 You can now use Docker commands in OpenAgent with:');
    console.log('   • Enhanced safety validation');
    console.log('   • Automatic risk assessment');
    console.log('   • Helpful suggestions');
    console.log('   • Specialized Docker tools');

  } catch (error) {
    console.error('❌ Demo failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Run the demo
runDemo().catch(console.error);
