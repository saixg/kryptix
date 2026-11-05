// ==============================================================================
// ROGUE — Advanced Context-Managed AI Platform (Client Application)
// ==============================================================================

// Session & State
let activeConversationId = localStorage.getItem('rogue_active_conv') || crypto.randomUUID();
localStorage.setItem('rogue_active_conv', activeConversationId);

let pendingAttachments = []; // Array<{ name, type, size, data, text }>
let thinkingInterval = null;
let currentTokenCounter = 420;

// DOM Elements Cache
const DOM = {
  // Sidebar
  sidebar: document.getElementById('sidebar'),
  sidebarCollapseBtn: document.getElementById('sidebar-collapse-btn'),
  sidebarExpandBtn: document.getElementById('sidebar-expand-btn'),
  newChatBtn: document.getElementById('new-chat-btn'),
  chatHistoryList: document.getElementById('chat-history-list'),
  footerModelName: document.getElementById('footer-model-name'),
  activeModelTag: document.getElementById('active-model-tag'),

  // Navigation & Personas
  personaSelect: document.getElementById('persona-select'),
  contextGaugeBtn: document.getElementById('context-gauge-btn'),
  gaugeProgress: document.getElementById('gauge-progress'),
  contextPercentBadge: document.getElementById('context-percent-badge'),

  // Drawer (Context Inspector)
  contextDrawer: document.getElementById('context-drawer'),
  closeDrawerBtn: document.getElementById('close-drawer-btn'),
  gaugeLargeBar: document.getElementById('gauge-large-bar'),
  drawerPercentText: document.getElementById('drawer-percent-text'),
  drawerTokenCount: document.getElementById('drawer-token-count'),
  drawerCompactionState: document.getElementById('drawer-compaction-state'),
  stratSummarize: document.getElementById('strat-summarize'),
  stratWindow: document.getElementById('strat-window'),
  metricTotalMsgs: document.getElementById('metric-total-msgs'),
  metricActiveWindow: document.getElementById('metric-active-window'),
  metricSummarizedTurns: document.getElementById('metric-summarized-turns'),
  synopsisBadge: document.getElementById('synopsis-badge'),
  synopsisBox: document.getElementById('synopsis-box'),
  drawerResetBtn: document.getElementById('drawer-reset-btn'),

  // Viewport & Messages
  apiBanner: document.getElementById('api-banner'),
  bannerText: document.getElementById('banner-text'),
  messagesStream: document.getElementById('messages-stream'),
  emptyHero: document.getElementById('empty-hero'),

  // Dock / Input Form
  chatForm: document.getElementById('chat-form'),
  userInput: document.getElementById('user-input'),
  sendBtn: document.getElementById('send-btn'),
  fileInput: document.getElementById('file-input'),
  attachBtn: document.getElementById('attach-btn'),
  attachmentTray: document.getElementById('attachment-tray'),
  mentionTriggerBtn: document.getElementById('mention-trigger-btn'),
  mentionsPopup: document.getElementById('mentions-popup'),
  dragOverlay: document.getElementById('drag-overlay'),
};

// ==============================================================================
// 1. INITIALIZATION & HEALTH CHECK
// ==============================================================================
async function initApp() {
  await checkHealth();
  await refreshConversationList();
  await loadConversation(activeConversationId);
  setupEventListeners();
}

async function checkHealth() {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();

    if (data.configured) {
      DOM.apiBanner.classList.add('hidden');
      const modelDisplayName = data.activeModel || 'Gemini 3.5 Flash';
      DOM.activeModelTag.textContent = modelDisplayName;
      DOM.footerModelName.textContent = modelDisplayName;
    } else {
      DOM.apiBanner.classList.remove('hidden');
      DOM.bannerText.textContent = `Setup Required: ${data.error || 'Please add GEMINI_API_KEY to .env file'}`;
    }
  } catch (err) {
    DOM.apiBanner.classList.remove('hidden');
    DOM.bannerText.textContent = `Server Connection Offline. Verify that the ROGUE server is running.`;
  }
}

// Prompt Chip Helper
window.usePrompt = function (text) {
  DOM.userInput.value = text;
  DOM.userInput.focus();
  adjustTextareaHeight();
};

// ==============================================================================
// 2. CONVERSATION SESSIONS (ChatGPT Style History)
// ==============================================================================
async function refreshConversationList() {
  try {
    const res = await fetch('/api/conversations');
    const data = await res.json();
    const sessions = data.sessions || [];

    DOM.chatHistoryList.innerHTML = '';

    if (sessions.length === 0) {
      DOM.chatHistoryList.innerHTML = `<div style="font-size: 0.76rem; color: var(--text-dim); padding: 0.5rem;">No previous chats yet</div>`;
      return;
    }

    sessions.forEach(session => {
      const item = document.createElement('div');
      item.className = `history-item ${session.id === activeConversationId ? 'active' : ''}`;
      item.dataset.id = session.id;

      item.innerHTML = `
        <span class="history-item-title" title="${escapeHtml(session.title)}">${escapeHtml(session.title)}</span>
        <div class="history-item-actions">
          <button class="history-del-btn" title="Delete chat" onclick="event.stopPropagation(); deleteChat('${session.id}')">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      `;

      item.addEventListener('click', () => {
        if (session.id !== activeConversationId) {
          loadConversation(session.id);
        }
      });

      DOM.chatHistoryList.appendChild(item);
    });
  } catch (err) {
    console.error('Failed to load conversations:', err);
  }
}

async function loadConversation(id) {
  activeConversationId = id;
  localStorage.setItem('rogue_active_conv', id);

  // Update active class in sidebar
  document.querySelectorAll('.history-item').forEach(el => {
    el.classList.toggle('active', el.dataset.id === id);
  });

  // Clear messages stream
  DOM.messagesStream.innerHTML = '';

  try {
    const res = await fetch(`/api/conversations/${id}`);
    if (res.ok) {
      const data = await res.json();
      const messages = data.session?.messages || [];

      if (messages.length === 0) {
        DOM.messagesStream.appendChild(DOM.emptyHero);
        DOM.emptyHero.style.display = 'flex';
      } else {
        DOM.emptyHero.style.display = 'none';
        messages.forEach(msg => {
          renderMessage(msg.role, msg.content, msg.attachments, false, msg.timestamp);
        });
      }

      if (data.stats) {
        updateContextMetrics(data.stats);
      }
    } else {
      // New / uninitialized conversation
      DOM.messagesStream.appendChild(DOM.emptyHero);
      DOM.emptyHero.style.display = 'flex';
      updateContextMetrics({
        contextPercent: 0,
        estimatedTokens: 0,
        totalMessages: 0,
        activeMessages: 0,
        olderMessages: 0,
        strategy: 'summarize',
      });
    }
  } catch (err) {
    DOM.messagesStream.appendChild(DOM.emptyHero);
    DOM.emptyHero.style.display = 'flex';
  }

  DOM.userInput.focus();
}

function createNewChat() {
  const newId = crypto.randomUUID();
  activeConversationId = newId;
  localStorage.setItem('rogue_active_conv', newId);

  // Clear stream and show hero
  DOM.messagesStream.innerHTML = '';
  DOM.messagesStream.appendChild(DOM.emptyHero);
  DOM.emptyHero.style.display = 'flex';

  // Clear pending attachments
  clearAttachments();

  // Reset gauges
  updateContextMetrics({
    contextPercent: 0,
    estimatedTokens: 0,
    totalMessages: 0,
    activeMessages: 0,
    olderMessages: 0,
    strategy: 'summarize',
    summary: '',
  });

  refreshConversationList();
  DOM.userInput.focus();
}

window.deleteChat = async function (id) {
  if (!confirm('Are you sure you want to delete this chat?')) return;

  try {
    await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
    if (id === activeConversationId) {
      createNewChat();
    } else {
      refreshConversationList();
    }
  } catch (err) {
    console.error('Failed to delete chat:', err);
  }
};

// ==============================================================================
// 3. CONTEXT WINDOW VISUALIZER & CIRCULAR PROGRESS GAUGE
// ==============================================================================
function updateContextMetrics(stats = {}) {
  const percent = Math.min(100, Math.max(0, stats.contextPercent ?? 0));
  const estimatedTokens = stats.estimatedTokens ?? 0;
  const total = stats.totalMessages ?? 0;
  const active = stats.activeMessages ?? 0;
  const truncated = stats.olderMessages ?? 0;
  const strategy = stats.strategy || 'summarize';

  // 1. Update Small Header Circle Gauge
  DOM.contextPercentBadge.textContent = `${percent}%`;
  DOM.gaugeProgress.setAttribute('stroke-dasharray', `${percent}, 100`);

  // Color threshold: Cyan (<50%), Amber (50-80%), Purple (>80%)
  let strokeColor = '#38bdf8';
  if (percent >= 80) strokeColor = '#c084fc';
  else if (percent >= 50) strokeColor = '#f59e0b';
  DOM.gaugeProgress.style.stroke = strokeColor;

  // 2. Update Drawer Large Gauge & Breakdown
  DOM.drawerPercentText.textContent = `${percent}%`;
  DOM.drawerTokenCount.textContent = estimatedTokens.toLocaleString();
  
  // Large SVG ring circumference is 2 * PI * 42 ≈ 263.89
  const largeOffset = 264 - (264 * percent) / 100;
  DOM.gaugeLargeBar.setAttribute('stroke-dasharray', `${(264 * percent) / 100}, 264`);
  DOM.gaugeLargeBar.style.stroke = strokeColor;

  DOM.drawerCompactionState.textContent = truncated > 0 ? (strategy === 'summarize' ? 'Compacting (Memory Prepend)' : 'Truncating Active Window') : 'Optimal Window';
  DOM.drawerCompactionState.style.color = truncated > 0 ? '#38bdf8' : '#34d399';

  DOM.metricTotalMsgs.textContent = total;
  DOM.metricActiveWindow.textContent = `${active} / 6`;
  DOM.metricSummarizedTurns.textContent = truncated;

  if (stats.summary && stats.summary.trim()) {
    DOM.synopsisBadge.textContent = 'Active Memory';
    DOM.synopsisBadge.className = 'mini-tag active';
    DOM.synopsisBox.textContent = stats.summary;
  } else {
    DOM.synopsisBadge.textContent = 'Empty';
    DOM.synopsisBadge.className = 'mini-tag';
    DOM.synopsisBox.innerHTML = '<em>No summary generated yet. Conversation is within the active sliding window.</em>';
  }

  // Radio button alignment
  if (strategy === 'sliding_window') {
    DOM.stratWindow.checked = true;
  } else {
    DOM.stratSummarize.checked = true;
  }
}

// ==============================================================================
// 4. 3D THINKING ANIMATION & LIVE TOKEN COUNTER
// ==============================================================================
function show3DThinking() {
  const row = document.createElement('div');
  row.className = 'message-row bot';
  row.id = 'active-thinking-row';

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar bot-av';
  avatar.innerHTML = `
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
      <path d="M12 2L21 7V17L12 22L3 17V7L12 2Z" stroke="#fff" stroke-width="2"/>
      <circle cx="12" cy="12" r="2.5" fill="#fff"/>
    </svg>
  `;

  const body = document.createElement('div');
  body.className = 'msg-body';

  const thinkingBox = document.createElement('div');
  thinkingBox.className = 'thinking-box';

  thinkingBox.innerHTML = `
    <!-- 3D Isometric Rotating Hypercube -->
    <div class="thinking-3d-scene">
      <div class="cube-3d">
        <div class="cube-face front"></div>
        <div class="cube-face back"></div>
        <div class="cube-face right"></div>
        <div class="cube-face left"></div>
        <div class="cube-face top"></div>
        <div class="cube-face bottom"></div>
        <div class="cube-core"></div>
      </div>
    </div>

    <!-- Thinking Info & Live Token Counter -->
    <div class="thinking-info">
      <div class="thinking-title-row">
        <span class="thinking-label">ROGUE is reasoning</span>
        <div class="live-token-pill">
          <span>⚡</span>
          <span id="thinking-token-counter">420 tokens</span>
        </div>
      </div>
      <span class="thinking-sub">Synthesizing multi-turn context & generating output...</span>
    </div>
  `;

  body.appendChild(thinkingBox);
  row.appendChild(avatar);
  row.appendChild(body);

  DOM.messagesStream.appendChild(row);
  DOM.messagesStream.scrollTop = DOM.messagesStream.scrollHeight;

  // Start animated token counter ticking up: 420 -> 560 -> 710 -> 840 -> 980 tokens
  currentTokenCounter = 420 + Math.floor(Math.random() * 80);
  const counterEl = document.getElementById('thinking-token-counter');

  if (thinkingInterval) clearInterval(thinkingInterval);
  thinkingInterval = setInterval(() => {
    currentTokenCounter += 70 + Math.floor(Math.random() * 80);
    if (counterEl) {
      counterEl.textContent = `${currentTokenCounter.toLocaleString()} tokens`;
    }
  }, 220);
}

function remove3DThinking() {
  if (thinkingInterval) {
    clearInterval(thinkingInterval);
    thinkingInterval = null;
  }
  const el = document.getElementById('active-thinking-row');
  if (el) el.remove();
}

// ==============================================================================
// 5. MESSAGE RENDERING (User & Assistant)
// ==============================================================================
function renderMessage(role, text, attachments = [], isError = false, timestamp = null) {
  DOM.emptyHero.style.display = 'none';

  const row = document.createElement('div');
  row.className = `message-row ${role === 'user' ? 'user' : 'bot'} ${isError ? 'error' : ''}`;

  const avatar = document.createElement('div');
  avatar.className = `msg-avatar ${role === 'user' ? 'user-av' : 'bot-av'}`;
  avatar.innerHTML = role === 'user' ? 'U' : `
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
      <path d="M12 2L21 7V17L12 22L3 17V7L12 2Z" stroke="#fff" stroke-width="2"/>
      <circle cx="12" cy="12" r="2.5" fill="#fff"/>
    </svg>
  `;

  const body = document.createElement('div');
  body.className = 'msg-body';

  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  const timeStr = timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const senderLabel = role === 'user' ? 'You' : 'ROGUE';
  meta.textContent = `${senderLabel} • ${timeStr}`;

  // Attachments grid (for user uploaded images/documents)
  if (attachments && attachments.length) {
    const attGrid = document.createElement('div');
    attGrid.className = 'msg-attachments-grid';

    attachments.forEach(att => {
      if (att.type && att.type.startsWith('image/') && att.data) {
        const img = document.createElement('img');
        img.className = 'msg-att-img';
        img.src = att.data.startsWith('data:') ? att.data : `data:${att.type};base64,${att.data}`;
        img.alt = att.name || 'Uploaded photo';
        attGrid.appendChild(img);
      } else {
        const fileChip = document.createElement('div');
        fileChip.className = 'msg-att-file';
        fileChip.innerHTML = `<span>📄</span> <strong>${escapeHtml(att.name || 'file')}</strong>`;
        attGrid.appendChild(fileChip);
      }
    });

    body.appendChild(attGrid);
  }

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.innerHTML = formatMarkdown(text);

  body.appendChild(meta);
  body.appendChild(bubble);

  row.appendChild(avatar);
  row.appendChild(body);

  DOM.messagesStream.appendChild(row);
  DOM.messagesStream.scrollTop = DOM.messagesStream.scrollHeight;
}

// Markdown formatting helper
function formatMarkdown(text) {
  if (!text) return '';
  let escaped = escapeHtml(text);

  // Fenced Code blocks
  escaped = escaped.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
    return `<pre><code class="language-${lang}">${code}</code></pre>`;
  });

  // Inline code
  escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold
  escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Italic
  escaped = escaped.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  return escaped;
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ==============================================================================
// 6. ATTACHMENTS (Photos & Document Uploads)
// ==============================================================================
DOM.attachBtn.addEventListener('click', () => {
  DOM.fileInput.click();
});

DOM.fileInput.addEventListener('change', (e) => {
  handleFiles(Array.from(e.target.files));
  DOM.fileInput.value = '';
});

function handleFiles(files) {
  if (!files || !files.length) return;

  files.forEach(file => {
    const isImage = file.type.startsWith('image/');

    const reader = new FileReader();

    if (isImage) {
      reader.onload = (evt) => {
        pendingAttachments.push({
          name: file.name,
          type: file.type,
          size: file.size,
          data: evt.target.result, // base64
        });
        renderAttachmentTray();
      };
      reader.readAsDataURL(file);
    } else {
      reader.onload = (evt) => {
        pendingAttachments.push({
          name: file.name,
          type: file.type || 'text/plain',
          size: file.size,
          text: evt.target.result,
        });
        renderAttachmentTray();
      };
      reader.readAsText(file);
    }
  });
}

function renderAttachmentTray() {
  if (pendingAttachments.length === 0) {
    DOM.attachmentTray.classList.add('hidden');
    DOM.attachmentTray.innerHTML = '';
    return;
  }

  DOM.attachmentTray.classList.remove('hidden');
  DOM.attachmentTray.innerHTML = '';

  pendingAttachments.forEach((att, index) => {
    const card = document.createElement('div');
    card.className = 'att-card';

    const isImage = att.type && att.type.startsWith('image/');
    const sizeStr = formatBytes(att.size);

    if (isImage) {
      card.innerHTML = `
        <img class="att-card-img" src="${att.data}" alt="${escapeHtml(att.name)}" />
        <div class="att-card-meta">
          <span class="att-card-name">${escapeHtml(att.name)}</span>
          <span class="att-card-size">${sizeStr}</span>
        </div>
        <button class="att-remove-btn" type="button" onclick="removeAttachment(${index})">&times;</button>
      `;
    } else {
      card.innerHTML = `
        <div class="att-card-fileicon">📄</div>
        <div class="att-card-meta">
          <span class="att-card-name">${escapeHtml(att.name)}</span>
          <span class="att-card-size">${sizeStr}</span>
        </div>
        <button class="att-remove-btn" type="button" onclick="removeAttachment(${index})">&times;</button>
      `;
    }

    DOM.attachmentTray.appendChild(card);
  });
}

window.removeAttachment = function (index) {
  pendingAttachments.splice(index, 1);
  renderAttachmentTray();
};

function clearAttachments() {
  pendingAttachments = [];
  renderAttachmentTray();
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Drag & Drop
['dragenter', 'dragover'].forEach(eventName => {
  window.addEventListener(eventName, (e) => {
    e.preventDefault();
    DOM.dragOverlay.classList.remove('hidden');
  });
});

['dragleave', 'drop'].forEach(eventName => {
  DOM.dragOverlay.addEventListener(eventName, (e) => {
    e.preventDefault();
    DOM.dragOverlay.classList.add('hidden');
  });
});

window.addEventListener('drop', (e) => {
  e.preventDefault();
  DOM.dragOverlay.classList.add('hidden');
  if (e.dataTransfer && e.dataTransfer.files) {
    handleFiles(Array.from(e.dataTransfer.files));
  }
});

// ==============================================================================
// 7. MENTIONS SYSTEM
// ==============================================================================
DOM.mentionTriggerBtn.addEventListener('click', () => {
  DOM.mentionsPopup.classList.toggle('hidden');
});

document.querySelectorAll('.mention-item').forEach(item => {
  item.addEventListener('click', () => {
    const mention = item.dataset.mention;
    insertMention(mention);
    DOM.mentionsPopup.classList.add('hidden');
  });
});

DOM.userInput.addEventListener('input', (e) => {
  adjustTextareaHeight();
  const val = DOM.userInput.value;
  // Trigger mentions popup if typing @ at end
  if (val.endsWith('@')) {
    DOM.mentionsPopup.classList.remove('hidden');
  } else if (!val.includes('@')) {
    DOM.mentionsPopup.classList.add('hidden');
  }
});

function insertMention(tag) {
  const current = DOM.userInput.value;
  if (current.endsWith('@')) {
    DOM.userInput.value = current.slice(0, -1) + tag + ' ';
  } else {
    DOM.userInput.value = current + (current.length && !current.endsWith(' ') ? ' ' : '') + tag + ' ';
  }
  DOM.userInput.focus();
  adjustTextareaHeight();
}

// Close mentions when clicking outside
document.addEventListener('click', (e) => {
  if (!DOM.mentionsPopup.contains(e.target) && e.target !== DOM.mentionTriggerBtn && !DOM.mentionTriggerBtn.contains(e.target)) {
    DOM.mentionsPopup.classList.add('hidden');
  }
});

// ==============================================================================
// 8. SEND MESSAGE & API FLOW
// ==============================================================================
DOM.chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = DOM.userInput.value.trim();
  const attachmentsToSend = [...pendingAttachments];

  if (!text && !attachmentsToSend.length) return;

  // Render user message immediately
  renderMessage('user', text, attachmentsToSend, false);

  // Clear inputs
  DOM.userInput.value = '';
  adjustTextareaHeight();
  clearAttachments();
  DOM.sendBtn.disabled = true;

  // Show 3D thinking animation + token ticker
  show3DThinking();

  // Active strategy from drawer radio
  const selectedStrategy = DOM.stratWindow.checked ? 'sliding_window' : 'summarize';

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        conversationId: activeConversationId,
        personaId: DOM.personaSelect.value,
        strategy: selectedStrategy,
        attachments: attachmentsToSend,
      }),
    });

    const data = await res.json();
    remove3DThinking();

    if (!res.ok) {
      renderMessage('bot', data.error || 'Request failed. Verify server status.', [], true);
      return;
    }

    // Render Gemini response
    renderMessage('bot', data.reply);

    // Update Context Window Metrics & Gauges
    if (data.stats) {
      updateContextMetrics(data.stats);
    }

    // Refresh sidebar conversation list so title updates
    refreshConversationList();
  } catch (err) {
    remove3DThinking();
    renderMessage('bot', `Network error: ${err.message}. Verify that the ROGUE server is running.`, [], true);
  } finally {
    DOM.sendBtn.disabled = false;
    DOM.userInput.focus();
  }
});

// Auto-expand textarea
function adjustTextareaHeight() {
  DOM.userInput.style.height = 'auto';
  DOM.userInput.style.height = `${Math.min(DOM.userInput.scrollHeight, 160)}px`;
}

// Shift+Enter newline, Enter submits
DOM.userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    DOM.chatForm.dispatchEvent(new Event('submit'));
  }
});

// ==============================================================================
// 9. EVENT LISTENERS & DRAWER CONTROLS
// ==============================================================================
function setupEventListeners() {
  // Sidebar Collapse / Expand
  DOM.sidebarCollapseBtn.addEventListener('click', () => {
    DOM.sidebar.classList.add('collapsed');
    DOM.sidebarExpandBtn.classList.remove('hidden');
  });

  DOM.sidebarExpandBtn.addEventListener('click', () => {
    DOM.sidebar.classList.remove('collapsed');
    DOM.sidebarExpandBtn.classList.add('hidden');
  });

  // New Chat
  DOM.newChatBtn.addEventListener('click', createNewChat);

  // Context Gauge Pill toggles Drawer
  DOM.contextGaugeBtn.addEventListener('click', () => {
    DOM.contextDrawer.classList.toggle('open');
  });

  DOM.closeDrawerBtn.addEventListener('click', () => {
    DOM.contextDrawer.classList.remove('open');
  });

  // Reset conversation button inside drawer
  DOM.drawerResetBtn.addEventListener('click', async () => {
    if (!confirm('Reset memory and conversation history for this session?')) return;
    try {
      await fetch(`/api/conversations/${activeConversationId}/reset`, { method: 'POST' });
    } catch (_) {}
    loadConversation(activeConversationId);
  });
}

// Start Application
initApp();
