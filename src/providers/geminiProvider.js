import { GoogleGenAI } from '@google/genai';

export class GeminiProvider {
  /**
   * @param {Object} options
   * @param {string} options.apiKey
   * @param {string} [options.model='gemini-3.8-flash']
   */
  constructor({ apiKey, model = 'gemini-3.8-flash' }) {
    if (!apiKey) {
      throw new Error('Gemini API key is required. Please set GEMINI_API_KEY in your .env file.');
    }
    this.apiKey = apiKey;
    this.defaultModel = model;
    this.ai = new GoogleGenAI({ apiKey });
  }

  /**
   * Format generic messages ({ role: 'user'|'model'|'assistant', content: string })
   * into Gemini contents schema.
   */
  _formatContents(messages) {
    return messages.map(msg => {
      const role = (msg.role === 'assistant' || msg.role === 'model') ? 'model' : 'user';
      return {
        role,
        parts: [{ text: String(msg.content) }],
      };
    });
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
    const contents = this._formatContents(messages);

    try {
      const config = {
        temperature,
      };

      if (systemInstruction && systemInstruction.trim()) {
        config.systemInstruction = systemInstruction;
      }

      const response = await this.ai.models.generateContent({
        model: targetModel,
        contents,
        config,
      });

      const reply = response.text || (response.candidates?.[0]?.content?.parts?.[0]?.text) || '';
      
      const usageMetadata = response.usageMetadata;
      const usage = usageMetadata ? {
        promptTokens: usageMetadata.promptTokenCount,
        responseTokens: usageMetadata.candidatesTokenCount,
        totalTokens: usageMetadata.totalTokenCount,
      } : null;

      return {
        reply,
        usage,
        model: targetModel,
        provider: 'gemini',
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
      ? `You are an expert conversation summarizer for a chatbot context manager.
Existing summary of earlier conversation:
"""
${currentSummary}
"""

New conversation turns to incorporate:
"""
${formattedTranscript}
"""

Task: Update the summary to incorporate the new turns into a single coherent, concise synopsis (maximum 150-200 words). Retain key facts, user preferences, technical requirements, decisions made, and unresolved questions. Avoid meta-commentary.`
      : `You are an expert conversation summarizer for a chatbot context manager.
Conversation transcript to condense:
"""
${formattedTranscript}
"""

Task: Create a concise, structured synopsis of this conversation (maximum 150-200 words). Capture the essential topics discussed, user goals, key details provided, and current context. Do not include filler words.`;

    try {
      const response = await this.ai.models.generateContent({
        model: targetModel,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          temperature: 0.3,
        },
      });

      return (response.text || '').trim();
    } catch (err) {
      console.error('[GeminiProvider] Summarization request failed:', err.message);
      throw this._handleError(err);
    }
  }

  /**
   * Human-friendly error translation.
   */
  _handleError(error) {
    const message = error.message || String(error);
    const status = error.status || error.code;

    if (message.includes('API_KEY_INVALID') || status === 401 || status === 403 || message.includes('API key not valid')) {
      return new Error('Invalid Gemini API Key. Please verify your GEMINI_API_KEY in the .env file. (Get a key at https://aistudio.google.com/)');
    }

    if (status === 429 || message.includes('RESOURCE_EXHAUSTED') || message.includes('rate limit')) {
      return new Error('Gemini API rate limit exceeded. Please wait a moment and try again, or check your quota on Google AI Studio.');
    }

    if (status === 503 || message.includes('Unavailable') || message.includes('overloaded')) {
      return new Error('The Gemini model is temporarily overloaded or unavailable. Please retry in a few seconds.');
    }

    if (error.name === 'AbortError' || message.includes('timeout')) {
      return new Error('The request to Gemini API timed out. Please check your network connection.');
    }

    return new Error(`Gemini API Error: ${message}`);
  }
}
