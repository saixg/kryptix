import { GeminiProvider } from './geminiProvider.js';
import { OpenAIProvider } from './openaiProvider.js';
import { config, getActiveProviderConfig } from '../config.js';

let activeProviderInstance = null;

export function getProvider(preferredProvider) {
  const activeConfig = getActiveProviderConfig();

  if (activeConfig.error) {
    throw new Error(activeConfig.error);
  }

  const providerType = preferredProvider || activeConfig.provider;

  if (providerType === 'gemini') {
    if (!config.geminiApiKey) {
      throw new Error('GEMINI_API_KEY is not configured in .env file.');
    }
    return new GeminiProvider({
      apiKey: config.geminiApiKey,
      model: config.geminiModel,
    });
  }

  if (providerType === 'openai') {
    if (!config.openaiApiKey) {
      throw new Error('OPENAI_API_KEY is not configured in .env file.');
    }
    return new OpenAIProvider({
      apiKey: config.openaiApiKey,
      model: config.openaiModel,
    });
  }

  throw new Error(`Unsupported or unconfigured provider: ${providerType}`);
}

export function getDefaultProvider() {
  if (!activeProviderInstance) {
    activeProviderInstance = getProvider();
  }
  return activeProviderInstance;
}
