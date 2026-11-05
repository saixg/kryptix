import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config, getActiveProviderConfig } from './config.js';
import { getProvider } from './providers/index.js';
import { ContextManager } from './context/contextManager.js';
import { PERSONAS, DEFAULT_PERSONA } from './prompts/systemPrompts.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middleware - allow larger payload for base64 image/file uploads (up to 25MB)
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(express.static(path.resolve(__dirname, '../public')));

// Initialize ContextManager
const contextManager = new ContextManager({
  maxActiveMessages: config.maxActiveMessages,
  defaultStrategy: config.contextStrategy,
});

// Configure context manager summarizer function using active provider
contextManager.setSummarizer(async (olderMessages, currentSummary) => {
  try {
    const provider = getProvider(contextManager.lastUsedProvider);
    return await provider.summarizeHistory(olderMessages, currentSummary);
  } catch (err) {
    console.warn('[Server Summarizer Warning]:', err.message);
    return currentSummary;
  }
});

// -----------------------------------------------------------------------------
// REST API Routes
// -----------------------------------------------------------------------------

/**
 * Health check & configuration status
 */
app.get('/api/health', (req, res) => {
  const providerConfig = getActiveProviderConfig();
  res.json({
    status: 'ok',
    configured: !providerConfig.error,
    activeProvider: providerConfig.provider,
    activeModel: providerConfig.model || null,
    contextStrategy: config.contextStrategy,
    maxActiveMessages: config.maxActiveMessages,
    error: providerConfig.error || null,
  });
});

/**
 * List available personas
 */
app.get('/api/personas', (req, res) => {
  res.json({
    personas: Object.values(PERSONAS).map(p => ({
      id: p.id,
      name: p.name,
      systemInstruction: p.systemInstruction,
    })),
    defaultPersona: DEFAULT_PERSONA.id,
  });
});

/**
 * List all saved conversation sessions
 */
app.get('/api/conversations', (req, res) => {
  const sessions = contextManager.listSessions();
  res.json({ sessions });
});

/**
 * Send user message and get response with multi-turn context management & attachments
 */
app.post('/api/chat', async (req, res) => {
  const {
    message,
    conversationId,
    personaId,
    strategy,
    provider: preferredProvider,
    attachments,
  } = req.body;

  if ((!message || !message.trim()) && (!attachments || !attachments.length)) {
    return res.status(400).json({ error: 'Message or attachment cannot be empty.' });
  }

  // Verify provider setup
  const providerConfig = getActiveProviderConfig();
  if (providerConfig.error && preferredProvider !== 'demo') {
    return res.status(503).json({
      error: providerConfig.error,
      hint: 'Please set your GEMINI_API_KEY in the .env file.',
    });
  }

  try {
    const selectedPersona = PERSONAS[personaId] || DEFAULT_PERSONA;
    const session = contextManager.getOrCreateSession(conversationId, {
      personaId: selectedPersona.id,
      strategy: strategy || config.contextStrategy,
    });

    contextManager.lastUsedProvider = preferredProvider;

    // 1. Add incoming user message + attachments to session memory
    contextManager.addMessage(session.id, 'user', (message || '').trim(), attachments || []);

    // 2. Build context window (applies sliding window / progressive summarization)
    const contextResult = await contextManager.buildContext(session.id);

    // 3. Obtain LLM provider
    const llmProvider = getProvider(preferredProvider);

    // 4. Request completion with active persona and managed context
    const completion = await llmProvider.generateReply({
      messages: contextResult.messagesToSend,
      systemInstruction: selectedPersona.systemInstruction,
      temperature: 0.7,
    });

    // 5. Store assistant's response in session memory
    contextManager.addMessage(session.id, 'model', completion.reply);

    // 6. Return response + diagnostic context window stats
    const updatedStats = contextManager.getSessionStats(session.id);

    return res.json({
      reply: completion.reply,
      conversationId: session.id,
      model: completion.model,
      provider: completion.provider,
      stats: {
        ...updatedStats,
        truncatedCount: contextResult.truncatedCount,
        contextSentCount: contextResult.messagesToSend.length,
        usage: completion.usage,
      },
    });
  } catch (err) {
    console.error(`[Server API Error]:`, err.message);
    const statusCode = err.status || 500;
    return res.status(statusCode).json({
      error: err.message || 'An error occurred while communicating with the LLM API.',
    });
  }
});

/**
 * Inspect conversation session history and context summary
 */
app.get('/api/conversations/:id', (req, res) => {
  const session = contextManager.sessions.get(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Conversation session not found.' });
  }
  const stats = contextManager.getSessionStats(req.params.id);
  res.json({
    session,
    stats,
  });
});

/**
 * Update conversation title
 */
app.patch('/api/conversations/:id', (req, res) => {
  const { title } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required.' });
  const success = contextManager.updateTitle(req.params.id, title);
  if (!success) return res.status(404).json({ error: 'Conversation not found.' });
  res.json({ success: true });
});

/**
 * Delete conversation session
 */
app.delete('/api/conversations/:id', (req, res) => {
  const success = contextManager.deleteSession(req.params.id);
  if (!success) return res.status(404).json({ error: 'Conversation not found.' });
  res.json({ success: true });
});

/**
 * Reset conversation history
 */
app.post('/api/conversations/:id/reset', (req, res) => {
  const success = contextManager.resetSession(req.params.id);
  if (!success) {
    return res.status(404).json({ error: 'Conversation session not found.' });
  }
  res.json({ success: true, message: 'Conversation session reset.' });
});

// Start Express server
const PORT = config.port;
app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 ROGUE Chatbot Server running on http://localhost:${PORT}`);
  console.log(`📡 Model: ${config.geminiModel} | Strategy: ${config.contextStrategy}`);
  console.log(`======================================================\n`);
});
