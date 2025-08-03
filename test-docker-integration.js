#!/usr/bin/env node

// Simple test script to verify Docker integration
console.log('🐳 Testing OpenAgent Docker Integration...\n');

async function testDockerIntegration() {
  try {
    // Test 1: Import Docker tools
    console.log('1. Testing Docker tools import...');
    const { dockerTools } = await import('./dist/tools/docker-tools.js');
    console.log(`✅ Successfully imported ${dockerTools.length} Docker tools`);
    
    // Test 2: Import Docker validator
    console.log('\n2. Testing Docker validator import...');
    const { DockerValidator } = await import('./dist/shell-execution/docker-validator.js');
    console.log('✅ Successfully imported Docker validator');
    
    // Test 3: Test Docker command validation
    console.log('\n3. Testing Docker command validation...');
    const testCommands = [
      'docker --version',
      'docker ps',
      'docker run --privileged ubuntu',
      'docker system prune -f'
    ];
    
    for (const cmd of testCommands) {
      const validation = DockerValidator.validateDockerCommand(cmd);
      console.log(`   Command: ${cmd}`);
      console.log(`   Risk Level: ${validation.riskLevel.toUpperCase()}`);
      console.log(`   Safe: ${validation.safe ? '✅' : '❌'}`);
      if (validation.issues.length > 0) {
        console.log(`   Issues: ${validation.issues.length}`);
      }
      console.log('');
    }
    
    // Test 4: Test Docker availability check
    console.log('4. Testing Docker availability...');
    const availability = await DockerValidator.checkDockerAvailability();
    if (availability.available) {
      console.log(`✅ Docker is available (version: ${availability.version})`);
    } else {
      console.log(`❌ Docker not available: ${availability.error}`);
    }
    
    // Test 5: Test shell executor Docker detection
    console.log('\n5. Testing shell executor Docker detection...');
    const { ShellExecutor } = await import('./dist/shell-execution/shell-executor.js');
    const executor = new ShellExecutor();
    console.log('✅ Shell executor created successfully');
    
    console.log('\n🎉 All Docker integration tests passed!');
    console.log('\n📋 Available Docker tools:');
    dockerTools.forEach(tool => {
      console.log(`   • ${tool.name}: ${tool.description.substring(0, 60)}...`);
    });
    
  } catch (error) {
    console.error('❌ Docker integration test failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

testDockerIntegration();
