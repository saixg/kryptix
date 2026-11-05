import crypto from 'node:crypto';

/**
 * ContextManager handles multi-turn conversation memory, session listing, and context window optimization.
 * 
 * Implemented Strategies:
 * 1. 'sliding_window': Keeps only the latest N messages, discarding older history.
 * 2. 'summarize': Progressively condenses older messages into a running synopsis,
 *    prepending this memory block to the active sliding window of recent messages.
 */
export class ContextManager {
  /**
   * @param {Object} options
   * @param {number} [options.maxActiveMessages=6] - Maximum messages kept in the active recent window
   * @param {'summarize'|'sliding_window'} [options.defaultStrategy='summarize'] - Context compaction strategy
   * @param {Function} [options.summarizerFn] - Callback to generate an LLM summary of older messages
   */
  constructor({ maxActiveMessages = 6, defaultStrategy = 'summarize', summarizerFn = null } = {}) {
    this.maxActiveMessages = maxActiveMessages;
    this.defaultStrategy = defaultStrategy;
    this.summarizerFn = summarizerFn;
    
    /** @type {Map<string, Object>} */
    this.sessions = new Map();
  }

  /**
   * Set or update the LLM summarization function
   * @param {Function} fn - async function(olderMessages, currentSummary) => Promise<string>
   */
  setSummarizer(fn) {
    this.summarizerFn = fn;
  }

  /**
   * Retrieve or create a session by ID
   * @param {string} [conversationId] 
   * @param {Object} [options]
   * @returns {Object}
   */
  getOrCreateSession(conversationId, options = {}) {
    const id = conversationId || crypto.randomUUID();
    
    if (!this.sessions.has(id)) {
      this.sessions.set(id, {
        id,
        title: options.title || 'New Mission',
        messages: [],
        summary: '',
        lastSummarizedIndex: 0,
        strategy: options.strategy || this.defaultStrategy,
        personaId: options.personaId || 'aria',
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
      });
    }

    const session = this.sessions.get(id);
    if (options.strategy) session.strategy = options.strategy;
    if (options.personaId) session.personaId = options.personaId;
    if (options.title) session.title = options.title;
    session.lastActiveAt = Date.now();
    return session;
  }

  /**
   * Append a message to conversation history
   * @param {string} conversationId 
   * @param {'user'|'model'} role 
   * @param {string} content 
   * @param {Array<Object>} [attachments=[]]
   */
  addMessage(conversationId, role, content, attachments = []) {
    const session = this.getOrCreateSession(conversationId);
    
    // Auto-title on first user message if default
    if (role === 'user' && (!session.title || session.title === 'New Mission' || session.title === 'New Chat')) {
      const cleanTitle = content.replace(/\s+/g, ' ').trim().slice(0, 38);
      session.title = cleanTitle ? (cleanTitle + (content.length > 38 ? '...' : '')) : 'Chat Session';
    }

    session.messages.push({
      role,
      content,
      attachments: attachments || [],
      timestamp: Date.now(),
    });
    session.lastActiveAt = Date.now();
  }

  /**
   * Prepares the optimized context array to be sent to the LLM.
   * If 'summarize' strategy is active and message count exceeds threshold,
   * it triggers condensation of older turns into `session.summary`.
   * 
   * @param {string} conversationId 
   * @returns {Promise<{
   *   messagesToSend: Array<{ role: 'user'|'model', content: string, attachments?: Array<any> }>,
   *   summary: string,
   *   strategy: string,
   *   totalStoredMessages: number,
   *   activeMessagesCount: number,
   *   truncatedCount: number,
   *   estimatedTokens: number,
   *   contextPercent: number
   * }>}
   */
  async buildContext(conversationId) {
    const session = this.getOrCreateSession(conversationId);
    const totalMessages = session.messages.length;
    const strategy = session.strategy || this.defaultStrategy;

    // Estimate tokens across all stored messages (~4 chars per token)
    let totalTextChars = 0;
    session.messages.forEach(m => {
      totalTextChars += (m.content || '').length;
      if (m.attachments) {
        m.attachments.forEach(a => {
          totalTextChars += (a.name || '').length + (a.text || '').length;
        });
      }
    });
    totalTextChars += (session.summary || '').length;
    const estimatedTokens = Math.max(1, Math.round(totalTextChars / 4));
    
    // Theoretical limit for context gauge visualization (e.g. 10,000 threshold for compaction)
    const contextLimit = this.maxActiveMessages * 600;
    const contextPercent = Math.min(100, Math.round((estimatedTokens / contextLimit) * 100));

    // If within limits, send raw conversation
    if (totalMessages <= this.maxActiveMessages) {
      return {
        messagesToSend: session.messages.map(m => ({
          role: m.role,
          content: m.content,
          attachments: m.attachments,
        })),
        summary: session.summary,
        strategy,
        totalStoredMessages: totalMessages,
        activeMessagesCount: totalMessages,
        truncatedCount: 0,
        estimatedTokens,
        contextPercent,
      };
    }

    // Messages split: older vs recent active window
    const splitIndex = totalMessages - this.maxActiveMessages;
    const olderMessages = session.messages.slice(0, splitIndex);
    const recentMessages = session.messages.slice(splitIndex);

    if (strategy === 'sliding_window') {
      return {
        messagesToSend: recentMessages.map(m => ({
          role: m.role,
          content: m.content,
          attachments: m.attachments,
        })),
        summary: '',
        strategy: 'sliding_window',
        totalStoredMessages: totalMessages,
        activeMessagesCount: recentMessages.length,
        truncatedCount: olderMessages.length,
        estimatedTokens,
        contextPercent,
      };
    }

    // Strategy === 'summarize'
    // Update summary if new older messages need summarization
    if (this.summarizerFn && splitIndex > session.lastSummarizedIndex) {
      try {
        const messagesToSummarize = session.messages.slice(0, splitIndex);
        const updatedSummary = await this.summarizerFn(messagesToSummarize, session.summary);
        if (updatedSummary) {
          session.summary = updatedSummary;
          session.lastSummarizedIndex = splitIndex;
        }
      } catch (err) {
        console.warn(`[ContextManager] Auto-summarization failed, falling back to existing summary: ${err.message}`);
      }
    }

    // Prepend running summary as contextual memory
    const messagesToSend = [];

    if (session.summary && session.summary.trim()) {
      messagesToSend.push({
        role: 'user',
        content: `[System Note: Summary of earlier conversation history]\n${session.summary}\n[End of earlier summary - continue conversation below]`,
      });
      messagesToSend.push({
        role: 'model',
        content: `Understood. I have integrated our previous discussion into memory and am ready to proceed.`,
      });
    }

    // Append the active recent sliding window
    for (const msg of recentMessages) {
      messagesToSend.push({
        role: msg.role,
        content: msg.content,
        attachments: msg.attachments,
      });
    }

    return {
      messagesToSend,
      summary: session.summary,
      strategy: 'summarize',
      totalStoredMessages: totalMessages,
      activeMessagesCount: recentMessages.length,
      truncatedCount: olderMessages.length,
      estimatedTokens,
      contextPercent,
    };
  }

  /**
   * Reset or clear a conversation
   * @param {string} conversationId 
   */
  resetSession(conversationId) {
    if (this.sessions.has(conversationId)) {
      const existing = this.sessions.get(conversationId);
      this.sessions.set(conversationId, {
        id: conversationId,
        title: existing.title || 'New Mission',
        messages: [],
        summary: '',
        lastSummarizedIndex: 0,
        strategy: existing.strategy,
        personaId: existing.personaId,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
      });
      return true;
    }
    return false;
  }

  /**
   * Delete a session
   * @param {string} conversationId 
   */
  deleteSession(conversationId) {
    return this.sessions.delete(conversationId);
  }

  /**
   * Update session title
   * @param {string} conversationId 
   * @param {string} title 
   */
  updateTitle(conversationId, title) {
    const session = this.sessions.get(conversationId);
    if (session) {
      session.title = title;
      return true;
    }
    return false;
  }

  /**
   * List all conversation sessions sorted by recent activity
   */
  listSessions() {
    return Array.from(this.sessions.values())
      .sort((a, b) => b.lastActiveAt - a.lastActiveAt)
      .map(s => ({
        id: s.id,
        title: s.title || 'New Mission',
        messageCount: s.messages.length,
        strategy: s.strategy,
        personaId: s.personaId,
        createdAt: s.createdAt,
        lastActiveAt: s.lastActiveAt,
        lastMessageSnippet: s.messages.length ? s.messages[s.messages.length - 1].content.slice(0, 60) : '',
      }));
  }

  /**
   * Get metadata and debugging stats for a session
   * @param {string} conversationId 
   */
  getSessionStats(conversationId) {
    const session = this.sessions.get(conversationId);
    if (!session) return null;

    const total = session.messages.length;
    const active = Math.min(total, this.maxActiveMessages);
    const older = Math.max(0, total - this.maxActiveMessages);

    let totalChars = 0;
    session.messages.forEach(m => { totalChars += (m.content || '').length; });
    totalChars += (session.summary || '').length;
    const estimatedTokens = Math.max(1, Math.round(totalChars / 4));
    const contextLimit = this.maxActiveMessages * 600;
    const contextPercent = Math.min(100, Math.round((estimatedTokens / contextLimit) * 100));

    return {
      id: session.id,
      title: session.title,
      personaId: session.personaId,
      strategy: session.strategy,
      totalMessages: total,
      activeMessages: active,
      olderMessages: older,
      hasSummary: Boolean(session.summary),
      summary: session.summary,
      estimatedTokens,
      contextPercent,
      createdAt: session.createdAt,
      lastActiveAt: session.lastActiveAt,
    };
  }
}
