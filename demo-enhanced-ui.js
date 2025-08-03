#!/usr/bin/env node

// Demo script to showcase the enhanced UI features like Claude Code
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🚀 Starting OpenAgent with Enhanced UI Demo...');
console.log('');
console.log('✨ New Features Implemented:');
console.log('  • Tool approval with clear parameter display');
console.log('  • File diff visualization for edits');
console.log('  • Step-by-step execution display');
console.log('  • Task planning with progress tracking');
console.log('  • Claude Code-like interface');
console.log('');
console.log('📝 Try these commands to see the enhanced UI:');
console.log('  1. "Create a simple hello.txt file"');
console.log('  2. "Edit the package.json file to add a new script"');
console.log('  3. "Run a shell command to list files"');
console.log('');
console.log('⚠️  Tool approval is now enabled - you\'ll see approval prompts before execution');
console.log('');

// Start the main application
const child = spawn('npm', ['run', 'dev'], {
  cwd: __dirname,
  stdio: 'inherit',
  shell: true
});

child.on('error', (error) => {
  console.error('Failed to start OpenAgent:', error);
  process.exit(1);
});

child.on('exit', (code) => {
  console.log(`OpenAgent exited with code ${code}`);
  process.exit(code);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down OpenAgent...');
  child.kill('SIGINT');
});

process.on('SIGTERM', () => {
  child.kill('SIGTERM');
});
