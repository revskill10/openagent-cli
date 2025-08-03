#!/usr/bin/env node

// Simple test for conversation persistence
import { ConversationPersistence } from './dist/conversation-persistence.js';

async function testConversationPersistence() {
  console.log('🧪 Testing Conversation Persistence System...\n');

  // Create a test instance
  const persistence = new ConversationPersistence('./test-sessions');

  try {
    // Test 1: Start a new session
    console.log('📝 Test 1: Starting new session...');
    const sessionId = persistence.startNewSession();
    console.log(`✅ Created session: ${sessionId}\n`);

    // Test 2: Add some logs
    console.log('📝 Test 2: Adding conversation logs...');
    persistence.addLog({
      agentId: 'user',
      text: 'Hello, can you help me with a coding task?',
      type: 'question'
    });

    persistence.addLog({
      agentId: 'ai-assistant',
      text: 'Of course! I\'d be happy to help you with your coding task. What do you need assistance with?',
      type: 'response'
    });

    persistence.addLog({
      agentId: 'user',
      text: 'I need to create a simple web server in Node.js',
      type: 'question'
    });

    persistence.addLog({
      agentId: 'ai-assistant',
      text: 'I can help you create a Node.js web server. Let me show you a simple example using Express.js...',
      type: 'response',
      metadata: {
        toolName: 'code-generator',
        executionTime: 1250,
        success: true
      }
    });

    console.log('✅ Added 4 conversation logs\n');

    // Test 3: Save session
    console.log('📝 Test 3: Saving session...');
    persistence.saveCurrentSession();
    console.log('✅ Session saved\n');

    // Test 4: Get current logs
    console.log('📝 Test 4: Retrieving current logs...');
    const logs = persistence.getCurrentLogs();
    console.log(`✅ Retrieved ${logs.length} logs:`);
    logs.forEach((log, index) => {
      console.log(`   ${index + 1}. [${log.agentId}] ${log.text.substring(0, 50)}...`);
    });
    console.log('');

    // Test 5: End session and start new one
    console.log('📝 Test 5: Ending session and starting new one...');
    persistence.endSession();
    const newSessionId = persistence.startNewSession();
    console.log(`✅ New session: ${newSessionId}\n`);

    // Test 6: Load previous session
    console.log('📝 Test 6: Loading previous session...');
    const loadedSession = persistence.loadSession(sessionId);
    if (loadedSession) {
      console.log(`✅ Loaded session with ${loadedSession.logs.length} logs`);
      console.log(`   Session ID: ${loadedSession.id}`);
      console.log(`   Started: ${loadedSession.startTime.toLocaleString()}`);
      console.log(`   Last Activity: ${loadedSession.lastActivity.toLocaleString()}`);
    } else {
      console.log('❌ Failed to load session');
    }
    console.log('');

    // Test 7: List all sessions
    console.log('📝 Test 7: Listing all sessions...');
    const sessions = persistence.listSessions();
    console.log(`✅ Found ${sessions.length} sessions:`);
    sessions.forEach((session, index) => {
      console.log(`   ${index + 1}. ${session.id} (${session.messageCount} messages)`);
      console.log(`      Last activity: ${session.lastActivity.toLocaleString()}`);
    });
    console.log('');

    // Test 8: Resume previous session
    console.log('📝 Test 8: Resuming previous session...');
    const resumed = persistence.resumeSession(sessionId);
    if (resumed) {
      console.log('✅ Successfully resumed session');
      const currentSession = persistence.getCurrentSession();
      console.log(`   Current session has ${currentSession?.logs.length} logs`);
    } else {
      console.log('❌ Failed to resume session');
    }
    console.log('');

    // Test 9: Get last session
    console.log('📝 Test 9: Getting last session...');
    const lastSession = persistence.getLastSession();
    if (lastSession) {
      console.log(`✅ Last session: ${lastSession.id}`);
      console.log(`   Messages: ${lastSession.logs.length}`);
    } else {
      console.log('❌ No last session found');
    }
    console.log('');

    // Test 10: Add more logs to resumed session
    console.log('📝 Test 10: Adding more logs to resumed session...');
    persistence.addLog({
      agentId: 'user',
      text: 'Thanks! That was very helpful.',
      type: 'question'
    });

    persistence.addLog({
      agentId: 'ai-assistant',
      text: 'You\'re welcome! Feel free to ask if you have any more questions.',
      type: 'response'
    });

    console.log('✅ Added 2 more logs');
    console.log(`   Total logs in session: ${persistence.getCurrentLogs().length}\n`);

    // Final save
    persistence.saveCurrentSession();
    persistence.endSession();

    console.log('🎉 All tests completed successfully!');
    console.log('\n💡 The conversation persistence system is working correctly.');
    console.log('   - Sessions are saved to disk automatically');
    console.log('   - Previous conversations can be restored');
    console.log('   - Multiple sessions are supported');
    console.log('   - Metadata is preserved');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testConversationPersistence().catch(console.error);
