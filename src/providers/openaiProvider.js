import OpenAI from 'openai';

export class OpenAIProvider {
  /**
   * @param {Object} options
   * @param {string} options.apiKey
   * @param {string} [options.model='gpt-4o-mini']
   */
  constructor({ apiKey, model = 'gpt-4o-mini' }) {
    if (!apiKey) {
      throw new Error('OpenAI API key is required. Please set OPENAI_API_KEY in your .env file.');
    }
    this.apiKey = apiKey;
    this.defaultModel = model;
    this.client = new OpenAI({ apiKey });
  }

  /**
   * Generate a chat response for multi-turn history.
   * 
   * @param {Object} params
   * @param {Array<{ role: string, content: string }>} params.messages
   * @param {string} [params.systemInstruction]
   * @param {string} [params.model]
   * @param {number} [params.temperature=0.7]
   */
  async generateReply({ messages, systemInstruction, model, temperature = 0.7 }) {
    const targetModel = model || this.defaultModel;

    const formattedMessages = [];
    if (systemInstruction && systemInstruction.trim()) {
      formattedMessages.push({ role: 'system', content: systemInstruction });
    }

    for (const msg of messages) {
      const role = (msg.role === 'model' || msg.role === 'assistant') ? 'assistant' : 'user';
      formattedMessages.push({
        role,
        content: String(msg.content),
      });
    }

    try {
      const response = await this.client.chat.completions.create({
        model: targetModel,
        messages: formattedMessages,
        temperature,
      });

      const reply = response.choices?.[0]?.message?.content || '';
      const usageMetadata = response.usage;
      const usage = usageMetadata ? {
        promptTokens: usageMetadata.prompt_tokens,
        responseTokens: usageMetadata.completion_tokens,
        totalTokens: usageMetadata.total_tokens,
      } : null;

      return {
        reply,
        usage,
        model: targetModel,
        provider: 'openai',
      };
    } catch (err) {
      throw this._handleError(err);
    }
  }

  /**
   * Condense older conversation turns into a running summary.
   * 
   * @param {Array<{ role: string, content: string }>} olderMessages
   * @param {string} [currentSummary]
   * @param {string} [model]
   */
  async summarizeHistory(olderMessages, currentSummary = '', model) {
    const targetModel = model || this.defaultModel;

    const formattedTranscript = olderMessages
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n');

    const prompt = currentSummary && currentSummary.trim()
      ? `Existing summary of earlier conversation:
"""
${currentSummary}
"""

New conversation turns to incorporate:
"""
${formattedTranscript}
"""

Task: Update the summary to incorporate the new turns into a single coherent, concise synopsis (maximum 150-200 words). Retain key facts, preferences, code details, and decisions. Avoid meta-commentary.`
      : `Conversation transcript to condense:
"""
${formattedTranscript}
"""

Task: Create a concise, structured synopsis of this conversation (maximum 150-200 words). Capture the essential topics discussed, user goals, and decisions. Do not include filler words.`;

    try {
      const response = await this.client.chat.completions.create({
        model: targetModel,
        messages: [
          { role: 'system', content: 'You are an expert conversation summarizer for a chatbot context manager.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
      });

      return (response.choices?.[0]?.message?.content || '').trim();
    } catch (err) {
      console.error('[OpenAIProvider] Summarization request failed:', err.message);
      throw this._handleError(err);
    }
  }

  /**
   * Human-friendly error translation.
   */
  _handleError(error) {
    const message = error.message || String(error);
    const status = error.status || error.code;

    if (status === 401 || message.includes('Incorrect API key') || message.includes('invalid_api_key')) {
      return new Error('Invalid OpenAI API Key. Please verify your OPENAI_API_KEY in the .env file. (Get a key at https://platform.openai.com/api-keys)');
    }

    if (status === 429 || message.includes('quota') || message.includes('rate_limit')) {
      return new Error('OpenAI rate limit or credit quota exceeded. Please check your account billing on platform.openai.com.');
    }

    if (status === 503 || status === 500) {
      return new Error('OpenAI servers are temporarily unavailable. Please retry in a few moments.');
    }

    if (error.name === 'AbortError' || message.includes('timeout')) {
      return new Error('The request to OpenAI API timed out. Please check your network connection.');
    }

    return new Error(`OpenAI API Error: ${message}`);
  }
}
