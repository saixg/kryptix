/**
 * Mock Provider for local testing and demonstration when no external API key is present.
 * Simulates multi-turn reasoning and progressive summarization.
 */
export class MockProvider {
  constructor({ model = 'mock-llm-v1' } = {}) {
    this.model = model;
  }

  async generateReply({ messages, systemInstruction, temperature }) {
    const lastMessage = messages[messages.length - 1]?.content || '';
    const turnCount = messages.filter(m => m.role === 'user').length;
    
    // Check if context includes a prior summary
    const hasSummaryNote = messages.some(m => m.content && m.content.includes('[System Note: Summary of earlier conversation history]'));

    let reply = `[Demo Mode] I received your message: "${lastMessage}".\n\n`;

    if (hasSummaryNote) {
      reply += `🧠 *Context Window Insight*: I can see earlier context has been summarized and preserved in my active memory.\n`;
    }

    if (turnCount > 1) {
      const priorUserMessages = messages
        .filter(m => m.role === 'user')
        .slice(0, -1)
        .map(m => `"${m.content.slice(0, 35)}${m.content.length > 35 ? '...' : ''}"`)
        .join(', ');

      reply += `I also remember our earlier turn(s) regarding: ${priorUserMessages}.\n\n`;
    }

    reply += `This confirms multi-turn context retention and context window management are working as expected! When you add your GEMINI_API_KEY or OPENAI_API_KEY to .env, I will connect directly to the live model.`;

    return {
      reply,
      usage: {
        promptTokens: lastMessage.length * 2,
        responseTokens: reply.length * 2,
        totalTokens: (lastMessage.length + reply.length) * 2,
      },
      model: 'demo-simulator (mock)',
      provider: 'demo',
    };
  }

  async summarizeHistory(olderMessages, currentSummary = '') {
    const topics = olderMessages
      .map(m => m.content.slice(0, 30))
      .slice(0, 3)
      .join('; ');
    
    return `The user and assistant discussed: ${topics}. Decisions and requirements from these earlier ${olderMessages.length} turns are captured.`;
  }
}

