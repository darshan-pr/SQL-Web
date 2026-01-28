const output = document.getElementById("output");
const textarea = document.getElementById("query");
const chatPanel = document.getElementById("chatPanel");
const chatHistory = document.getElementById("chatHistory");

let chatMessages = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  // Keyboard shortcut: Ctrl/Cmd + Enter to run query
  textarea.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      runQuery();
    }
  });

  // Auto-resize textarea
  textarea.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = this.scrollHeight + 'px';
  });
});

function runQuery() {
  const query = textarea.value.trim();
  if (!query) {
    showError("Please enter a query");
    return;
  }

  showLoading("Executing query...");

  fetch("/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query })
  })
  .then(res => res.json())
  .then(data => {
    if (!data.success) {
      showError(data.error);
      return;
    }

    if (Array.isArray(data.data)) {
      renderTable(data.data);
    } else {
      showSuccess(data.data);
    }
  })
  .catch(err => {
    showError("Network error: " + err.message);
  });
}

function askAI() {
  const text = textarea.value.trim();
  if (!text) {
    showError("Please enter a question or description");
    return;
  }

  // Show chat panel
  chatPanel.style.display = 'flex';
  
  // Add user message to chat
  addChatMessage('user', text);
  
  // Show AI thinking
  const thinkingId = addLoadingMessage();

  fetch("/ai-query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: text })
  })
  .then(res => {
    if (!res.ok) {
      return res.json().then(err => {
        throw new Error(err.error || 'AI request failed');
      });
    }
    return res.json();
  })
  .then(data => {
    removeLoadingMessage(thinkingId);
    
    if (!data.success) {
      addChatMessage('error', data.error || 'Failed to generate SQL');
      showError(data.error || 'AI request failed');
      return;
    }

    // Add AI response to chat
    addChatMessage('ai', data.sql);
    
    // Update textarea with generated SQL
    textarea.value = data.sql;
    
    // Show in output panel
    output.innerHTML = `<pre><code>${escapeHtml(data.sql)}</code></pre>`;
  })
  .catch(err => {
    removeLoadingMessage(thinkingId);
    addChatMessage('error', err.message);
    showError(err.message);
  });
}

function addChatMessage(type, content) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${type}`;
  
  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';
  
  if (type === 'ai' || type === 'error') {
    contentDiv.innerHTML = `<code>${escapeHtml(content)}</code>`;
  } else {
    contentDiv.textContent = content;
  }
  
  messageDiv.appendChild(contentDiv);
  chatHistory.appendChild(messageDiv);
  
  // Scroll to bottom
  chatHistory.scrollTop = chatHistory.scrollHeight;
  
  chatMessages.push({ type, content });
}

function addLoadingMessage() {
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'loading-message';
  loadingDiv.id = 'loading-' + Date.now();
  
  loadingDiv.innerHTML = `
    <span>AI thinking</span>
    <div class="loading-dots">
      <div class="loading-dot"></div>
      <div class="loading-dot"></div>
      <div class="loading-dot"></div>
    </div>
  `;
  
  chatHistory.appendChild(loadingDiv);
  chatHistory.scrollTop = chatHistory.scrollHeight;
  
  return loadingDiv.id;
}

function removeLoadingMessage(id) {
  const loadingDiv = document.getElementById(id);
  if (loadingDiv) {
    loadingDiv.remove();
  }
}

function clearChat() {
  chatHistory.innerHTML = '';
  chatMessages = [];
  chatPanel.style.display = 'none';
}

function renderTable(rows) {
  if (!rows.length) {
    output.innerHTML = '<div class="output-empty">Query returned no rows</div>';
    return;
  }

  const cols = Object.keys(rows[0]);
  let html = '<table><thead><tr>';
  
  cols.forEach(c => {
    html += `<th>${escapeHtml(c)}</th>`;
  });
  html += '</tr></thead><tbody>';

  rows.forEach(r => {
    html += '<tr>';
    cols.forEach(c => {
      const value = r[c] !== null ? r[c] : '<em>NULL</em>';
      html += `<td>${escapeHtml(String(value))}</td>`;
    });
    html += '</tr>';
  });

  html += '</tbody></table>';
  output.innerHTML = html;
}

function showLoading(message) {
  output.innerHTML = `
    <div style="display: flex; align-items: center; gap: 12px; padding: 20px;">
      <div class="loading"></div>
      <span>${escapeHtml(message)}</span>
    </div>
  `;
}

function showError(message) {
  output.innerHTML = `<div class="error-message">
    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 18px; height: 18px; display: inline-block; margin-right: 8px;">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
    ${escapeHtml(message)}
  </div>`;
}

function showSuccess(message) {
  output.innerHTML = `<div class="success-message">
    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 18px; height: 18px; display: inline-block; margin-right: 8px;">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
    ${escapeHtml(message)}
  </div>`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}