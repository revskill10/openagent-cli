#!/usr/bin/env node

/**
 * Simple RAG Test - Standalone WebRAGTool demonstration
 * This test verifies the WebRAGTool works independently without KaibanJS integration
 */

import { WebRAGTool } from './tools/web-rag-tool.js';

async function runSimpleRAGTest() {
    console.log('🔍 Simple RAG Tool Test\n');
    
    // Check for OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
        console.error('❌ OPENAI_API_KEY environment variable is required');
        console.log('💡 Set your OpenAI API key:');
        console.log('   export OPENAI_API_KEY=your-key-here');
        console.log('   or create a .env file with OPENAI_API_KEY=your-key-here');
        process.exit(1);
    }
    
    try {
        // Test 1: Basic React documentation query
        console.log('📚 Test 1: React Documentation Query');
        console.log('   URL: https://react.dev/');
        console.log('   Query: What is React?\n');
        
        const reactTool = new WebRAGTool({
            url: 'https://react.dev/',
        });
        
        const reactResponse = await reactTool.invoke({ query: "What is React?" });
        console.log('✅ Response:', reactResponse);
        console.log('─'.repeat(50));
        
        // Test 2: TypeScript documentation query
        console.log('\n📘 Test 2: TypeScript Documentation Query');
        console.log('   URL: https://www.typescriptlang.org/docs/');
        console.log('   Query: What are TypeScript interfaces?\n');
        
        const tsTool = new WebRAGTool({
            url: 'https://www.typescriptlang.org/docs/',
        });
        
        const tsResponse = await tsTool.invoke({ query: "What are TypeScript interfaces?" });
        console.log('✅ Response:', tsResponse);
        console.log('─'.repeat(50));
        
        // Test 3: Node.js documentation query
        console.log('\n🟢 Test 3: Node.js Documentation Query');
        console.log('   URL: https://nodejs.org/en/docs');
        console.log('   Query: What is npm?\n');
        
        const nodeTool = new WebRAGTool({
            url: 'https://nodejs.org/en/docs',
        });
        
        const nodeResponse = await nodeTool.invoke({ query: "What is npm?" });
        console.log('✅ Response:', nodeResponse);
        
        console.log('\n🎉 All tests completed successfully!');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    }
}

// Custom test with user-provided URL and query
async function runCustomTest(url: string, query: string) {
    console.log(`🔍 Custom RAG Test`);
    console.log(`   URL: ${url}`);
    console.log(`   Query: ${query}\n`);
    
    try {
        const tool = new WebRAGTool({ url });
        const response = await tool.invoke({ query });
        console.log('✅ Response:', response);
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

// CLI interface
async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        await runSimpleRAGTest();
    } else if (args.length === 2) {
        const [url, query] = args;
        await runCustomTest(url, query);
    } else {
        console.log('Usage:');
        console.log('  npx tsx src/simple-rag-test.ts                    # Run all tests');
        console.log('  npx tsx src/simple-rag-test.ts <url> <query>     # Custom test');
        console.log('');
        console.log('Examples:');
        console.log('  npx tsx src/simple-rag-test.ts https://react.dev/ "What are React hooks?"');
        console.log('  npx tsx src/simple-rag-test.ts https://docs.python.org/3/ "What is Python?"');
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}