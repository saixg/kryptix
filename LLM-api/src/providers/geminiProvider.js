import { GoogleGenAI } from '@google/genai';

export class GeminiProvider {
  /**
   * @param {Object} options
   * @param {string} options.apiKey
   * @param {string} [options.model='gemini-3.5-flash-lite']
   */
  constructor({ apiKey, model = 'gemini-3.5-flash-lite' }) {
    if (!apiKey) {
      throw new Error('Gemini API key is required. Please set GEMINI_API_KEY in your .env file.');
    }
    this.apiKey = apiKey;
    this.defaultModel = model;
    this.ai = new GoogleGenAI({ apiKey });
  }

  /**
   * Format message array into clear input for the Interactions API (supporting text & image attachments).
   */
  _formatInput(messages) {
    const images = [];

    const textTranscript = messages
      .map(msg => {
        const speaker = (msg.role === 'assistant' || msg.role === 'model') ? 'Assistant' : 'User';
        let text = `${speaker}: ${msg.content || ''}`;

        if (msg.attachments && msg.attachments.length) {
          msg.attachments.forEach(att => {
            if (att.type && att.type.startsWith('image/') && att.data) {
              // Strip data:image/...;base64, prefix if present
              const cleanBase64 = att.data.replace(/^data:image\/[a-z]+;base64,/, '');
              images.push({
                type: 'image',
                data: cleanBase64,
                mime_type: att.type,
              });
              text += `\n[Image Attached: ${att.name || 'image'}]`;
            } else if (att.text) {
              text += `\n[Attached File: ${att.name || 'document'}]\n\`\`\`\n${att.text}\n\`\`\``;
            }
          });
        }

        return text;
      })
      .join('\n\n');

    if (images.length > 0) {
      return [
        { type: 'text', text: textTranscript },
        ...images,
      ];
    }

    return textTranscript;
  }

  /**
   * Generate a chat response for multi-turn history using the Google Gemini Interactions API.
   * 
   * @param {Object} params
   * @param {Array<{ role: string, content: string, attachments?: Array<any> }>} params.messages
   * @param {string} [params.systemInstruction]
   * @param {string} [params.model]
   * @param {number} [params.temperature=0.7]
   */
  async generateReply({ messages, systemInstruction, model, temperature = 0.7 }) {
    const targetModel = model || this.defaultModel;
    const input = this._formatInput(messages);

    const callInteraction = async (modelName) => {
      const interactionParams = {
        model: modelName,
        input,
      };

      if (systemInstruction && systemInstruction.trim()) {
        interactionParams.system_instruction = systemInstruction;
      }

      if (temperature !== undefined) {
        interactionParams.generation_config = {
          temperature,
        };
      }

      return await this.ai.interactions.create(interactionParams);
    };

    try {
      let interaction;
      let usedModel = targetModel;

      try {
        interaction = await callInteraction(targetModel);
      } catch (err) {
        // If preferred model is 503 overloaded, fall back gracefully to gemini-3.5-flash-lite
        if ((err.status === 503 || err.message?.includes('503') || err.message?.includes('high demand')) && targetModel !== 'gemini-3.5-flash-lite') {
          console.warn(`[GeminiProvider] ${targetModel} experiencing high demand, falling back to gemini-3.5-flash-lite...`);
          usedModel = 'gemini-3.5-flash-lite';
          interaction = await callInteraction('gemini-3.5-flash-lite');
        } else {
          throw err;
        }
      }

      const reply = interaction.output_text || '';
      const usageMetadata = interaction.usage;
      const usage = usageMetadata ? {
        promptTokens: usageMetadata.total_input_tokens || usageMetadata.promptTokenCount,
        responseTokens: usageMetadata.total_output_tokens || usageMetadata.candidatesTokenCount,
        totalTokens: usageMetadata.total_tokens || usageMetadata.totalTokenCount,
      } : null;

      return {
        reply,
        usage,
        model: usedModel,
        provider: 'gemini',
        interactionId: interaction.id,
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
    const targetModel = model || 'gemini-3.5-flash-lite';

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

Task: Update the summary to incorporate the new turns into a single coherent, concise synopsis (maximum 150-200 words). Retain key facts, user preferences, technical requirements, decisions made, and unresolved questions. Avoid meta-commentary.`
      : `Conversation transcript to condense:
"""
${formattedTranscript}
"""

Task: Create a concise, structured synopsis of this conversation (maximum 150-200 words). Capture the essential topics discussed, user goals, key details provided, and current context. Do not include filler words.`;

    try {
      const interaction = await this.ai.interactions.create({
        model: targetModel,
        input: prompt,
        system_instruction: 'You are an expert conversation summarizer for a chatbot context manager.',
        generation_config: {
          temperature: 0.3,
        },
      });

      return (interaction.output_text || '').trim();
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

    if (status === 503 || message.includes('503') || message.includes('Unavailable') || message.includes('high demand') || message.includes('overloaded')) {
      return new Error('The Gemini model is temporarily overloaded. Please retry in a few seconds.');
    }

    if (error.name === 'AbortError' || message.includes('timeout')) {
      return new Error('The request to Gemini API timed out. Please check your network connection.');
    }

    return new Error(`Gemini API Error: ${message}`);
  }
}
