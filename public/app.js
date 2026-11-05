// State management
let conversationId = sessionStorage.getItem('nexus_conv_id') || crypto.randomUUID();
sessionStorage.setItem('nexus_conv_id', conversationId);

const DOM = {
  providerBadge: document.getElementById('provider-badge'),
  personaSelect: document.getElementById('persona-select'),
  strategySelect: document.getElementById('strategy-select'),
  resetBtn: document.getElementById('reset-btn'),
  toggleInspectorBtn: document.getElementById('toggle-inspector-btn'),
  closeInspectorBtn: document.getElementById('close-inspector-btn'),
  contextInspector: document.getElementById('context-inspector'),
  apiAlert: document.getElementById('api-alert'),
  alertMessage: document.getElementById('alert-message'),
  messagesContainer: document.getElementById('messages-container'),
  welcomeCard: document.getElementById('welcome-card'),
  chatForm: document.getElementById('chat-form'),
  userInput: document.getElementById('user-input'),
  sendBtn: document.getElementById('send-btn'),
  metricTotal: document.getElementById('metric-total'),
  metricActive: document.getElementById('metric-active'),
  metricTruncated: document.getElementById('metric-truncated'),
  metricStrategy: document.getElementById('metric-strategy'),
  summaryStatus: document.getElementById('summary-status'),
  summaryBox: document.getElementById('summary-box'),
  contextPreview: document.getElementById('context-preview'),
};

// Auto-expand textarea
DOM.userInput.addEventListener('input', () => {
  DOM.userInput.style.height = 'auto';
  DOM.userInput.style.height = `${Math.min(DOM.userInput.scrollHeight, 140)}px`;
});

// Shift+Enter newline, Enter submits
DOM.userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    DOM.chatForm.dispatchEvent(new Event('submit'));
  }
});

// Toggle Context Inspector
DOM.toggleInspectorBtn.addEventListener('click', () => {
  DOM.contextInspector.classList.toggle('collapsed');
});

DOM.closeInspectorBtn.addEventListener('click', () => {
  DOM.contextInspector.classList.add('collapsed');
});

// Prompt chips helper
window.usePrompt = function (text) {
  DOM.userInput.value = text;
  DOM.userInput.focus();
  DOM.userInput.dispatchEvent(new Event('input'));
};

// Check API Health
async function checkHealth() {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();

    if (data.configured) {
      DOM.providerBadge.textContent = `${data.activeProvider.toUpperCase()} (${data.activeModel})`;
      DOM.providerBadge.className = 'badge ready';
      DOM.apiAlert.classList.add('hidden');
    } else {
      DOM.providerBadge.textContent = 'API Key Missing';
      DOM.providerBadge.className = 'badge error';
      DOM.alertMessage.innerHTML = `<strong>Setup Required:</strong> ${data.error} <br>Create a <code>.env</code> file in your project folder with <code>GEMINI_API_KEY</code> or <code>OPENAI_API_KEY</code> and restart the server.`;
      DOM.apiAlert.classList.remove('hidden');
    }

    if (data.contextStrategy) {
      DOM.strategySelect.value = data.contextStrategy;
    }
  } catch (err) {
    DOM.providerBadge.textContent = 'Server Offline';
    DOM.providerBadge.className = 'badge error';
    DOM.alertMessage.textContent = 'Unable to connect to local server. Make sure "npm start" is running.';
    DOM.apiAlert.classList.remove('hidden');
  }
}

// Reset Conversation
DOM.resetBtn.addEventListener('click', async () => {
  if (!confirm('Clear conversation memory and start fresh?')) return;

  try {
    await fetch(`/api/conversations/${conversationId}/reset`, { method: 'POST' });
  } catch (_) {
    // Ignore if session not yet created on backend
  }

  conversationId = crypto.randomUUID();
  sessionStorage.setItem('nexus_conv_id', conversationId);

  // Clear UI messages
  DOM.messagesContainer.innerHTML = '';
  if (DOM.welcomeCard) DOM.messagesContainer.appendChild(DOM.welcomeCard);

  // Reset inspector
  updateInspectorMetrics({
    totalMessages: 0,
    activeMessages: 0,
    olderMessages: 0,
    strategy: DOM.strategySelect.value,
    summary: '',
    contextSentCount: 0,
  });

  DOM.userInput.focus();
});

// Update Context Inspector panel
function updateInspectorMetrics(stats = {}) {
  DOM.metricTotal.textContent = stats.totalMessages ?? 0;
  DOM.metricActive.textContent = `${stats.activeMessages ?? 0} / 6`;
  DOM.metricTruncated.textContent = stats.olderMessages ?? 0;
  DOM.metricStrategy.textContent = stats.strategy ?? DOM.strategySelect.value;

  if (stats.summary && stats.summary.trim()) {
    DOM.summaryStatus.textContent = 'Active Memory';
    DOM.summaryStatus.className = 'badge-mini active';
    DOM.summaryBox.textContent = stats.summary;
  } else {
    DOM.summaryStatus.textContent = 'Empty';
    DOM.summaryStatus.className = 'badge-mini';
    DOM.summaryBox.innerHTML = '<em>No messages summarized yet. Conversation is within active window.</em>';
  }

  if (stats.contextSentCount !== undefined) {
    DOM.contextPreview.textContent = JSON.stringify({
      strategy: stats.strategy,
      messagesInFlight: stats.contextSentCount,
      hasPrecedingSummary: Boolean(stats.summary),
      truncatedFromHistory: stats.olderMessages ?? 0,
    }, null, 2);
  }
}

// Append a message bubble to chat
function appendMessage(role, text, isError = false) {
  if (DOM.welcomeCard && DOM.welcomeCard.parentNode) {
    DOM.welcomeCard.style.display = 'none';
  }

  const row = document.createElement('div');
  row.className = `message-row ${role} ${isError ? 'error' : ''}`;

  const avatar = document.createElement('div');
  avatar.className = `avatar ${role === 'user' ? 'user-avatar' : 'bot-avatar'}`;
  avatar.textContent = role === 'user' ? '👤' : (isError ? '⚠️' : '🤖');

  const wrap = document.createElement('div');
  wrap.className = 'bubble-wrap';

  const meta = document.createElement('div');
  meta.className = 'message-meta';
  const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const senderLabel = role === 'user' ? 'You' : DOM.personaSelect.options[DOM.personaSelect.selectedIndex].text.split(' ')[0];
  meta.textContent = `${senderLabel} • ${timeStr}`;

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;

  wrap.appendChild(meta);
  wrap.appendChild(bubble);

  row.appendChild(avatar);
  row.appendChild(wrap);

  DOM.messagesContainer.appendChild(row);
  DOM.messagesContainer.scrollTop = DOM.messagesContainer.scrollHeight;

  return bubble;
}

// Show typing indicator
function showTypingIndicator() {
  const row = document.createElement('div');
  row.className = 'message-row bot typing-row';
  row.id = 'typing-indicator';

  const avatar = document.createElement('div');
  avatar.className = 'avatar bot-avatar';
  avatar.textContent = '🤖';

  const wrap = document.createElement('div');
  wrap.className = 'bubble-wrap';

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.innerHTML = `
    <div class="typing-dots">
      <span></span><span></span><span></span>
    </div>
  `;

  wrap.appendChild(bubble);
  row.appendChild(avatar);
  row.appendChild(wrap);

  DOM.messagesContainer.appendChild(row);
  DOM.messagesContainer.scrollTop = DOM.messagesContainer.scrollHeight;
}

function removeTypingIndicator() {
  const indicator = document.getElementById('typing-indicator');
  if (indicator) indicator.remove();
}

// Handle Form Submission
DOM.chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = DOM.userInput.value.trim();
  if (!text) return;

  // Append user message
  appendMessage('user', text);
  DOM.userInput.value = '';
  DOM.userInput.style.height = 'auto';

  // Disable send button while waiting
  DOM.sendBtn.disabled = true;
  showTypingIndicator();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        conversationId,
        personaId: DOM.personaSelect.value,
        strategy: DOM.strategySelect.value,
      }),
    });

    const data = await res.json();
    removeTypingIndicator();

    if (!res.ok) {
      appendMessage('bot', data.error || 'Request failed. Please check server logs.', true);
      return;
    }

    appendMessage('bot', data.reply);

    // Update inspector
    if (data.stats) {
      updateInspectorMetrics(data.stats);
    }
  } catch (err) {
    removeTypingIndicator();
    appendMessage('bot', `Network error: ${err.message}. Is the server running?`, true);
  } finally {
    DOM.sendBtn.disabled = false;
    DOM.userInput.focus();
  }
});

// Initial boot
checkHealth();

