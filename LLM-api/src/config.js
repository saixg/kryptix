import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  defaultProvider: (process.env.DEFAULT_PROVIDER || 'gemini').toLowerCase(),
  
  // Gemini settings
  geminiApiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  
  // OpenAI settings
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  
  // Context management settings
  // 'summarize' = rolling synopsis of older messages + sliding window of recent messages
  // 'sliding_window' = only retain the last N messages
  contextStrategy: process.env.CONTEXT_STRATEGY || 'summarize',
  maxActiveMessages: parseInt(process.env.MAX_ACTIVE_MESSAGES || '6', 10),
  demoMode: process.env.DEMO_MODE === 'true',
};

export function getActiveProviderConfig() {
  const hasGemini = Boolean(config.geminiApiKey && config.geminiApiKey.trim());
  const hasOpenAI = Boolean(config.openaiApiKey && config.openaiApiKey.trim());

  if (config.demoMode) {
    return { provider: 'demo', model: 'mock-llm-v1' };
  }

  if (config.defaultProvider === 'openai') {
    if (hasOpenAI) return { provider: 'openai', model: config.openaiModel };
    if (hasGemini) return { provider: 'gemini', model: config.geminiModel };
  } else {
    if (hasGemini) return { provider: 'gemini', model: config.geminiModel };
    if (hasOpenAI) return { provider: 'openai', model: config.openaiModel };
  }

  return {
    provider: 'none',
    error: 'No API key found. Please set GEMINI_API_KEY or OPENAI_API_KEY in your .env file.',
  };
}

