import readline from 'node:readline';
import { config, getActiveProviderConfig } from './config.js';
import { getProvider } from './providers/index.js';
import { ContextManager } from './context/contextManager.js';
import { PERSONAS, DEFAULT_PERSONA } from './prompts/systemPrompts.js';

async function main() {
  console.clear();
  console.log('='.repeat(65));
  console.log('🤖  MULTI-TURN LLM CHATBOT CLI (WITH CONTEXT MANAGEMENT)');
  console.log('='.repeat(65));

  const providerConfig = getActiveProviderConfig();
  if (providerConfig.error) {
    console.error('\n❌ Configuration Error:');
    console.error(providerConfig.error);
    console.log('\nPlease create a .env file with your GEMINI_API_KEY or OPENAI_API_KEY.');
    console.log('Run "node scripts/test-connection.js" to verify setup.\n');
    process.exit(1);
  }

  const provider = getProvider();
  const contextManager = new ContextManager({
    maxActiveMessages: config.maxActiveMessages,
    defaultStrategy: config.contextStrategy,
  });

  // Wire up the summarizer
  contextManager.setSummarizer(async (olderMessages, currentSummary) => {
    return await provider.summarizeHistory(olderMessages, currentSummary);
  });

  const conversationId = 'cli-session-1';
  let currentPersona = DEFAULT_PERSONA;
  let currentStrategy = config.contextStrategy;

  contextManager.getOrCreateSession(conversationId, {
    personaId: currentPersona.id,
    strategy: currentStrategy,
  });

  console.log(`\n• Provider : ${providerConfig.provider.toUpperCase()} (${providerConfig.model})`);
  console.log(`• Persona  : ${currentPersona.name}`);
  console.log(`• Strategy : ${currentStrategy} (max active messages: ${config.maxActiveMessages})`);
  console.log('\nCommands:');
  console.log('  /summary   - View running summary of older turns');
  console.log('  /stats     - View context window usage & memory statistics');
  console.log('  /strategy  - Switch between "summarize" and "sliding_window"');
  console.log('  /persona   - Switch bot personality (aria | socratic | concise)');
  console.log('  /reset     - Clear conversation history');
  console.log('  /exit      - Quit the session\n');
  console.log('-'.repeat(65));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\nYou: ',
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();

    if (!input) {
      rl.prompt();
      return;
    }

    // Handle commands
    if (input.startsWith('/')) {
      const [cmd, ...args] = input.split(' ');

      if (cmd === '/exit' || cmd === '/quit') {
        console.log('\nGoodbye! 👋');
        rl.close();
        process.exit(0);
      }

      if (cmd === '/reset') {
        contextManager.resetSession(conversationId);
        console.log('\n🔄 Conversation memory cleared. Starting fresh!');
        rl.prompt();
        return;
      }

      if (cmd === '/summary') {
        const stats = contextManager.getSessionStats(conversationId);
        console.log('\n--- 📜 Running Conversation Summary ---');
        if (stats?.summary) {
          console.log(stats.summary);
        } else {
          console.log('(No summary yet. Older messages will be summarized once history exceeds the active window).');
        }
        console.log('----------------------------------------');
        rl.prompt();
        return;
      }

      if (cmd === '/stats') {
        const stats = contextManager.getSessionStats(conversationId);
        console.log('\n--- 📊 Context Window Metrics ---');
        console.log(`Session ID        : ${stats.id}`);
        console.log(`Strategy          : ${stats.strategy}`);
        console.log(`Total Messages    : ${stats.totalMessages}`);
        console.log(`Active Messages   : ${stats.activeMessages} / ${config.maxActiveMessages}`);
        console.log(`Older Messages    : ${stats.olderMessages}`);
        console.log(`Has Memory Summary: ${stats.hasSummary ? 'Yes' : 'No'}`);
        console.log('---------------------------------');
        rl.prompt();
        return;
      }

      if (cmd === '/strategy') {
        currentStrategy = currentStrategy === 'summarize' ? 'sliding_window' : 'summarize';
        const session = contextManager.getOrCreateSession(conversationId);
        session.strategy = currentStrategy;
        console.log(`\n⚙️ Context strategy switched to: ${currentStrategy}`);
        rl.prompt();
        return;
      }

      if (cmd === '/persona') {
        const choice = args[0]?.toLowerCase();
        if (PERSONAS[choice]) {
          currentPersona = PERSONAS[choice];
          console.log(`\n🎭 Persona changed to: ${currentPersona.name}`);
        } else {
          console.log(`\nAvailable personas: ${Object.keys(PERSONAS).join(', ')}`);
        }
        rl.prompt();
        return;
      }

      console.log(`Unknown command: ${cmd}. Type /stats, /summary, /strategy, /persona, /reset, or /exit.`);
      rl.prompt();
      return;
    }

    // Process user message
    try {
      contextManager.addMessage(conversationId, 'user', input);

      process.stdout.write(`\n${currentPersona.name.split(' ')[0]} is thinking... `);

      const contextResult = await contextManager.buildContext(conversationId);

      const completion = await provider.generateReply({
        messages: contextResult.messagesToSend,
        systemInstruction: currentPersona.systemInstruction,
        temperature: 0.7,
      });

      contextManager.addMessage(conversationId, 'model', completion.reply);

      // Clear the "is thinking" line
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);

      console.log(`\n${currentPersona.name.split(' ')[0]}:`);
      console.log(completion.reply.trim());

      // Show brief context indicator if truncation / summary occurred
      if (contextResult.truncatedCount > 0) {
        if (contextResult.strategy === 'summarize') {
          console.log(`\n\x1b[90m[Context: ${contextResult.activeMessagesCount} active turns + condensed summary of ${contextResult.truncatedCount} older messages]\x1b[0m`);
        } else {
          console.log(`\n\x1b[90m[Context: ${contextResult.activeMessagesCount} active turns (${contextResult.truncatedCount} older messages truncated)]\x1b[0m`);
        }
      }
    } catch (err) {
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
      console.error(`\n❌ Error: ${err.message}`);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Fatal CLI Error:', err);
  process.exit(1);
});
