/**
 * Step 2: Connection Verification Script
 * Validates API connectivity with Google Gemini or OpenAI.
 */

import { config, getActiveProviderConfig } from '../src/config.js';
import { getProvider } from '../src/providers/index.js';

async function main() {
  console.log('='.repeat(60));
  console.log('🚀 LLM API Connection Verification Test');
  console.log('='.repeat(60));

  const active = getActiveProviderConfig();
  if (active.error) {
    console.error('\n❌ Configuration Error:');
    console.error(active.error);
    console.log('\n👉 Instructions:');
    console.log('1. Copy .env.example to .env:');
    console.log('   cp .env.example .env');
    console.log('2. Open .env and insert your GEMINI_API_KEY (from https://aistudio.google.com/)');
    console.log('   or OPENAI_API_KEY (from https://platform.openai.com/api-keys)');
    console.log('3. Re-run: npm run test-connection\n');
    process.exit(1);
  }

  console.log(`\nDetected Provider : ${active.provider.toUpperCase()}`);
  console.log(`Target Model      : ${active.model}`);
  console.log('Sending test ping to LLM API...\n');

  const startTime = Date.now();

  try {
    const provider = getProvider(active.provider);
    const result = await provider.generateReply({
      messages: [
        {
          role: 'user',
          content: 'Hello! Please confirm in one short sentence that our API connection is live and working.',
        },
      ],
      systemInstruction: 'You are a diagnostic health-check assistant. Respond briefly and cheerfully.',
      temperature: 0.2,
    });

    const elapsedMs = Date.now() - startTime;

    console.log('✅ Connection Successful!');
    console.log(`⏱ Response Latency: ${elapsedMs}ms`);
    console.log(`🤖 Model Output    : "${result.reply.trim()}"`);
    
    if (result.usage) {
      console.log(`📊 Token Usage     : Prompt=${result.usage.promptTokens ?? 'N/A'}, Completion=${result.usage.responseTokens ?? 'N/A'}, Total=${result.usage.totalTokens ?? 'N/A'}`);
    }
    console.log('\n🎉 Step 2 Completed: Your LLM API connection is ready!\n');
  } catch (err) {
    const elapsedMs = Date.now() - startTime;
    console.error(`\n❌ API Connection Failed after ${elapsedMs}ms:`);
    console.error(`   ${err.message}`);
    console.log('\n💡 Troubleshooting Tips:');
    console.log('- Double check that your API key in .env has no extra quotes or whitespace.');
    console.log('- Check that you have an active internet connection.');
    console.log('- For Gemini: visit https://aistudio.google.com/ to check your API key status.');
    console.log('- For OpenAI: visit https://platform.openai.com/ to check billing and key validity.\n');
    process.exit(1);
  }
}

main();
