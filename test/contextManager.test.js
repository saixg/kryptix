import assert from 'node:assert/strict';
import { ContextManager } from '../src/context/contextManager.js';

async function runTests() {
  console.log('🧪 Starting ContextManager Unit & Integration Tests...\n');

  // Test 1: Basic multi-turn conversation storage
  {
    console.log('Test 1: Store multi-turn messages within window limit');
    const cm = new ContextManager({ maxActiveMessages: 6 });
    const convId = 'test-session-1';

    cm.addMessage(convId, 'user', 'My name is Alice');
    cm.addMessage(convId, 'model', 'Nice to meet you, Alice!');
    cm.addMessage(convId, 'user', 'I am building a web app');
    cm.addMessage(convId, 'model', 'Awesome, what stack?');

    const context = await cm.buildContext(convId);
    assert.equal(context.messagesToSend.length, 4);
    assert.equal(context.messagesToSend[0].content, 'My name is Alice');
    assert.equal(context.messagesToSend[3].content, 'Awesome, what stack?');
    assert.equal(context.truncatedCount, 0);
    console.log('  ✅ Test 1 Passed: Multi-turn history accurately assembled.\n');
  }

  // Test 2: Sliding window truncation
  {
    console.log('Test 2: Sliding window truncation when exceeding maxActiveMessages');
    const cm = new ContextManager({ maxActiveMessages: 4, defaultStrategy: 'sliding_window' });
    const convId = 'test-session-2';

    // Add 6 messages (3 turns)
    cm.addMessage(convId, 'user', 'Turn 1');
    cm.addMessage(convId, 'model', 'Reply 1');
    cm.addMessage(convId, 'user', 'Turn 2');
    cm.addMessage(convId, 'model', 'Reply 2');
    cm.addMessage(convId, 'user', 'Turn 3');
    cm.addMessage(convId, 'model', 'Reply 3');

    const context = await cm.buildContext(convId);
    assert.equal(context.totalStoredMessages, 6);
    assert.equal(context.activeMessagesCount, 4);
    assert.equal(context.truncatedCount, 2);
    assert.equal(context.messagesToSend.length, 4);
    // Should contain Turn 2, Reply 2, Turn 3, Reply 3
    assert.equal(context.messagesToSend[0].content, 'Turn 2');
    assert.equal(context.messagesToSend[3].content, 'Reply 3');
    console.log('  ✅ Test 2 Passed: Earlier messages cleanly truncated in sliding window mode.\n');
  }

  // Test 3: Progressive Summarization
  {
    console.log('Test 3: Progressive Summarization of older turns');
    let summarizerCalled = false;
    let summarizedContent = '';

    const mockSummarizer = async (olderMessages, existingSummary) => {
      summarizerCalled = true;
      summarizedContent = `Summary of ${olderMessages.length} older messages (previously: "${existingSummary}")`;
      return summarizedContent;
    };

    const cm = new ContextManager({
      maxActiveMessages: 4,
      defaultStrategy: 'summarize',
      summarizerFn: mockSummarizer,
    });
    const convId = 'test-session-3';

    // Add 6 messages (3 turns)
    cm.addMessage(convId, 'user', 'I like TypeScript');
    cm.addMessage(convId, 'model', 'TypeScript is great for type safety.');
    cm.addMessage(convId, 'user', 'I use PostgreSQL');
    cm.addMessage(convId, 'model', 'PostgreSQL is very reliable.');
    cm.addMessage(convId, 'user', 'Now what should I use for ORM?');
    cm.addMessage(convId, 'model', 'Prisma or Drizzle are great choices.');

    const context = await cm.buildContext(convId);
    assert.equal(summarizerCalled, true, 'Summarizer should be invoked for older messages');
    assert.equal(context.strategy, 'summarize');
    assert.equal(context.truncatedCount, 2);
    // The messagesToSend should have the summary block (user + model note) + 4 recent messages = 6 total
    assert.equal(context.messagesToSend.length, 6);
    assert.match(context.messagesToSend[0].content, /Summary of 2 older messages/);
    console.log('  ✅ Test 3 Passed: Progressive summarization generated and injected into context.\n');
  }

  // Test 4: Conversation reset
  {
    console.log('Test 4: Reset conversation memory');
    const cm = new ContextManager();
    const convId = 'test-session-4';

    cm.addMessage(convId, 'user', 'Something secret');
    cm.resetSession(convId);

    const stats = cm.getSessionStats(convId);
    assert.equal(stats.totalMessages, 0);
    assert.equal(stats.summary, '');
    console.log('  ✅ Test 4 Passed: Reset clears conversation state.\n');
  }

  console.log('🎉 All ContextManager tests passed successfully!');
}

runTests().catch(err => {
  console.error('❌ Test failure:', err);
  process.exit(1);
});
