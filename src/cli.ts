#!/usr/bin/env node

// src/cli.ts - Command line interface for OpenAgent

import { Command } from 'commander';
import { spawn } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read package.json for version
const packagePath = resolve(__dirname, '../package.json');
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));

const program = new Command();

program
  .name('openagent')
  .description('Intelligent agentic coder with GraphRAG engine and MCP integration')
  .version(packageJson.version);

// UI Command (default)
program
  .command('ui', { isDefault: true })
  .description('Start the interactive UI (default command)')
  .option('-c, --config <path>', 'Path to config file', './config.json')
  .action((options) => {
    console.log('🚀 Starting OpenAgent UI...');
    
    const uiPath = resolve(__dirname, 'ui.js');
    const child = spawn('node', [uiPath], {
      stdio: 'inherit',
      env: {
        ...process.env,
        OPENAGENT_CONFIG: options.config
      }
    });

    child.on('exit', (code) => {
      process.exit(code || 0);
    });
  });

// Index Command
program
  .command('index <path>')
  .description('Index a codebase for GraphRAG analysis')
  .option('-l, --languages <langs>', 'Comma-separated list of languages to index', 'typescript,javascript,python,go,rust')
  .option('-e, --exclude <patterns>', 'Comma-separated patterns to exclude', 'node_modules/**,dist/**,.git/**')
  .option('-p, --parallel <num>', 'Number of parallel workers', '4')
  .option('--incremental', 'Perform incremental indexing', false)
  .action((path, options) => {
    console.log(`📚 Indexing codebase at: ${path}`);
    console.log(`Languages: ${options.languages}`);
    console.log(`Exclude patterns: ${options.exclude}`);
    console.log(`Parallel workers: ${options.parallel}`);
    console.log(`Incremental: ${options.incremental}`);
    
    throw new Error('Indexing functionality not yet implemented. Use RAG tools instead.');
  });

// Query Command
program
  .command('query <question>')
  .description('Query the indexed codebase')
  .option('-f, --file <path>', 'Limit query to specific file')
  .option('-t, --threshold <num>', 'Similarity threshold (0-1)', '0.7')
  .option('-l, --limit <num>', 'Maximum results', '10')
  .action((question, options) => {
    console.log(`🔍 Querying: "${question}"`);
    
    if (options.file) {
      console.log(`File filter: ${options.file}`);
    }
    console.log(`Threshold: ${options.threshold}`);
    console.log(`Limit: ${options.limit}`);
    
    throw new Error('Query functionality not yet implemented. Use agent tasks instead.');
  });

// Server Command
program
  .command('server')
  .description('Start the HTTP streaming MCP server')
  .option('-p, --port <port>', 'Port to listen on', '3001')
  .option('--host <host>', 'Host to bind to', 'localhost')
  .option('--websocket', 'Enable WebSocket support', true)
  .action((options) => {
    console.log(`🌐 Starting OpenAgent server...`);
    console.log(`Host: ${options.host}`);
    console.log(`Port: ${options.port}`);
    console.log(`WebSocket: ${options.websocket}`);
    
    throw new Error('Server functionality not yet implemented. Use UI or main entry points instead.');
  });

// Config Command
program
  .command('config')
  .description('Manage OpenAgent configuration')
  .option('--init', 'Initialize default config file')
  .option('--validate', 'Validate config file')
  .option('--show', 'Show current config')
  .action((options) => {
    if (options.init) {
      console.log('📝 Initializing default config...');
      throw new Error('Config init not implemented. Create config.json manually.');
    } else if (options.validate) {
      console.log('✅ Validating config...');
      throw new Error('Config validation not implemented.');
    } else if (options.show) {
      console.log('📋 Current config:');
      throw new Error('Config show not implemented.');
    } else {
      console.log('Use --init, --validate, or --show');
    }
  });

// Memory Command
program
  .command('memory')
  .description('Manage GraphRAG memory and patterns')
  .option('--analyze', 'Analyze code patterns')
  .option('--optimize', 'Optimize memory usage')
  .option('--clear', 'Clear memory cache')
  .action((options) => {
    if (options.analyze) {
      console.log('🧠 Analyzing code patterns...');
    }
    if (options.optimize) {
      console.log('⚡ Optimizing memory...');
    }
    if (options.clear) {
      console.log('🗑️  Clearing memory cache...');
    }
    
    console.log('⚠️  Memory commands not implemented yet - coming in future release!');
    process.exit(1);
  });

// Version Command (already handled by commander)

// Help Command
program
  .command('help [command]')
  .description('Display help for command')
  .action((command) => {
    if (command) {
      program.commands.find(cmd => cmd.name() === command)?.help();
    } else {
      program.help();
    }
  });

// Global error handling
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\n👋 Goodbye!');
  process.exit(0);
});

// Parse command line arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}