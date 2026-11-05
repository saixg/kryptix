import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'cors';
import { ContextManager } from '../src/context/contextManager.js';
import { MockProvider } from '../src/providers/mockProvider.js';
import { PERSONAS } from '../src/prompts/systemPrompts.js';

async function runE2ETests() {
  console.log('='.repeat(65));
  console.log('🚀 Running End-to-End Chatbot & Context Compaction Test');
  console.log('='.repeat(65));

  const mockProvider = new MockProvider();
  const contextManager = new ContextManager({
    maxActiveMessages: 4, // low threshold to test summarization quickly
    defaultStrategy: 'summarize',
    summarizerFn: async (older, summary) => mockProvider.summarizeHistory(older, summary),
  });

  const conversationId = 'e2e-session-test';

  console.log('\n[Phase 1] Multi-turn conversation (Within Context Window Limit)');
  
  // Turn 1
  contextManager.addMessage(conversationId, 'user', 'Hello, my name is Alex and I am creating an e-commerce platform.');
  let context = await contextManager.buildContext(conversationId);
  let reply = await mockProvider.generateReply({ messages: context.messagesToSend });
  contextManager.addMessage(conversationId, 'model', reply.reply);
  console.log('  Turn 1: User introduces themselves as Alex.');
  assert.equal(context.truncatedCount, 0);

  // Turn 2
  contextManager.addMessage(conversationId, 'user', 'What database should I choose for high-throughput orders?');
  context = await contextManager.buildContext(conversationId);
  assert.equal(context.truncatedCount, 0);
  assert.equal(context.totalStoredMessages, 3); // 2 previous + 1 current user message
  reply = await mockProvider.generateReply({ messages: context.messagesToSend });
  contextManager.addMessage(conversationId, 'model', reply.reply);
  console.log('  Turn 2: User asks about database choice (Total stored: 4).');

  console.log('\n[Phase 2] Exceeding Context Window -> Progressive Summarization');

  // Turn 3: 5th & 6th message, exceeds maxActiveMessages of 4
  contextManager.addMessage(conversationId, 'user', 'Can we also use Redis for cart caching?');
  context = await contextManager.buildContext(conversationId);
  reply = await mockProvider.generateReply({ messages: context.messagesToSend });
  contextManager.addMessage(conversationId, 'model', reply.reply);
  
  console.log('  Turn 3: Message count reached 6 (Limit: 4).');
  console.log(`  ✓ Older messages truncated: ${context.truncatedCount}`);
  console.log(`  ✓ Active window messages: ${context.activeMessagesCount}`);
  console.log(`  ✓ Rolling summary generated: "${context.summary}"`);
  
  assert.equal(context.truncatedCount, 1, '1 older message moved to summary');
  assert.ok(context.summary.length > 0, 'Summary must not be empty');

  // Turn 4: Add another message to verify continuous summary accumulation
  contextManager.addMessage(conversationId, 'user', 'Do you remember what my name was from the first message?');
  context = await contextManager.buildContext(conversationId);
  reply = await mockProvider.generateReply({ messages: context.messagesToSend });
  contextManager.addMessage(conversationId, 'model', reply.reply);

  console.log('\n[Phase 3] Verify Pre-pended Memory Delivery to LLM');
  const summaryMessage = context.messagesToSend[0];
  assert.ok(summaryMessage.content.includes('[System Note: Summary of earlier conversation history]'));
  console.log('  ✓ Verified: Context manager prepended summary note to model payload.');

  console.log('\n[Phase 4] Reset Conversation Memory');
  contextManager.resetSession(conversationId);
  const stats = contextManager.getSessionStats(conversationId);
  assert.equal(stats.totalMessages, 0);
  assert.equal(stats.summary, '');
  console.log('  ✓ Verified: Conversation history and summary successfully reset.');

  console.log('\n' + '='.repeat(65));
  console.log('🎉 All End-to-End Multi-Turn & Context Management Tests PASSED!');
  console.log('='.repeat(65) + '\n');
}

runE2ETests().catch(err => {
  console.error('E2E Test Failed:', err);
  process.exit(1);
});
