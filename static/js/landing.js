const output = document.getElementById("output");
const textarea = document.getElementById("query");
const chatHistory = document.getElementById("chatHistory");
const chatInput = document.getElementById("chatInput");

// Session-based conversation history
let conversationHistory = [];
let sessionId = generateSessionId();

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  // Keyboard shortcuts
  textarea.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      runQuery();
    }
  });

  chatInput.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      sendChatMessage();
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });

  // Auto-resize textareas
  textarea.addEventListener('input', autoResize);
  chatInput.addEventListener('input', autoResize);
});

function autoResize(e) {
  e.target.style.height = 'auto';
  e.target.style.height = e.target.scrollHeight + 'px';
}

function generateSessionId() {
  return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Execute SQL Query
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

// Check SQL Syntax
function checkSyntax() {
  const query = textarea.value.trim();
  if (!query) {
    showError("Please enter a query to check");
    return;
  }

  // Add user message to chat
  removeWelcomeMessage();
  addChatMessage('user', 'Check and fix this SQL syntax: ' + query);
  
  const thinkingId = addLoadingMessage();

  // Build the prompt for syntax checking
  const messages = [
    ...conversationHistory,
    {
      role: 'user',
      content: `Please check this SQL query for syntax errors and suggest corrections. If it's correct, just confirm. If there are errors, provide the corrected version. Query: ${query}`
    }
  ];

  fetch("/ai-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      messages: messages,
      sessionId: sessionId
    })
  })
  .then(res => res.json())
  .then(data => {
    removeLoadingMessage(thinkingId);
    
    if (!data.success) {
      addChatMessage('error', data.error || 'Failed to check syntax');
      showError(data.error || 'Syntax check failed');
      return;
    }

    // Update conversation history
    conversationHistory = data.history || conversationHistory;
    
    // Add AI response
    addChatMessage('ai', data.response, data.sql);
    
    // If corrected SQL is provided, update textarea
    if (data.sql && data.sql !== query) {
      textarea.value = data.sql;
      showSuccess("Query syntax corrected!");
    }
  })
  .catch(err => {
    removeLoadingMessage(thinkingId);
    addChatMessage('error', err.message);
    showError(err.message);
  });
}

// Send Chat Message
function sendChatMessage() {
  const text = chatInput.value.trim();
  if (!text) return;

  removeWelcomeMessage();
  
  // Add user message
  addChatMessage('user', text);
  
  // Clear input
  chatInput.value = '';
  chatInput.style.height = 'auto';
  
  // Show AI thinking
  const thinkingId = addLoadingMessage();

  // Build messages array with history
  const messages = [
    ...conversationHistory,
    { role: 'user', content: text }
  ];

  fetch("/ai-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      messages: messages,
      sessionId: sessionId
    })
  })
  .then(res => res.json())
  .then(data => {
    removeLoadingMessage(thinkingId);
    
    if (!data.success) {
      addChatMessage('error', data.error || 'Failed to get AI response');
      return;
    }

    // Update conversation history
    conversationHistory = data.history || conversationHistory;
    
    // Add AI response with optional SQL
    addChatMessage('ai', data.response, data.sql);
  })
  .catch(err => {
    removeLoadingMessage(thinkingId);
    addChatMessage('error', err.message);
  });
}

// Quick message helper
function sendQuickMessage(message) {
  chatInput.value = message;
  sendChatMessage();
}

// Add Chat Message
function addChatMessage(type, content, sql = null) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${type}`;
  
  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';
  
  if (type === 'ai') {
    // Format AI response with potential SQL
    contentDiv.innerHTML = formatAIResponse(content);
    
    // If SQL is provided, add action buttons
    if (sql) {
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'query-actions';
      
      const addBtn = document.createElement('button');
      addBtn.className = 'btn-action';
      addBtn.innerHTML = `
        <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 5v14M5 12h14"/>
        </svg>
        Add to Editor
      `;
      addBtn.onclick = () => addToEditor(sql);
      
      const executeBtn = document.createElement('button');
      executeBtn.className = 'btn-action';
      executeBtn.innerHTML = `
        <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        Execute Query
      `;
      executeBtn.onclick = () => executeGeneratedQuery(sql);
      
      actionsDiv.appendChild(addBtn);
      actionsDiv.appendChild(executeBtn);
      messageDiv.appendChild(contentDiv);
      messageDiv.appendChild(actionsDiv);
    } else {
      messageDiv.appendChild(contentDiv);
    }
  } else if (type === 'error') {
    contentDiv.innerHTML = `
      <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: inline-block; vertical-align: middle; margin-right: 6px;">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      ${escapeHtml(content)}
    `;
    messageDiv.appendChild(contentDiv);
  } else {
    contentDiv.textContent = content;
    messageDiv.appendChild(contentDiv);
  }
  
  chatHistory.appendChild(messageDiv);
  scrollChatToBottom();
}

function formatAIResponse(text) {
  // Convert markdown-style code blocks to HTML
  text = text.replace(/```sql\n?([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  text = text.replace(/```\n?([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  
  // Convert inline code
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // Convert line breaks
  text = text.replace(/\n/g, '<br>');
  
  return text;
}

function addToEditor(sql) {
  textarea.value = sql;
  textarea.style.height = 'auto';
  textarea.style.height = textarea.scrollHeight + 'px';
  textarea.focus();
  
  // Show confirmation
  showSuccess("Query added to editor");
}

function executeGeneratedQuery(sql) {
  textarea.value = sql;
  runQuery();
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
  scrollChatToBottom();
  
  return loadingDiv.id;
}

function removeLoadingMessage(id) {
  const loadingDiv = document.getElementById(id);
  if (loadingDiv) {
    loadingDiv.remove();
  }
}

function removeWelcomeMessage() {
  const welcomeMsg = chatHistory.querySelector('.welcome-message');
  if (welcomeMsg) {
    welcomeMsg.remove();
  }
}

function clearChat() {
  chatHistory.innerHTML = `
    <div class="welcome-message">
      <div class="welcome-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
          <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
          <line x1="12" y1="22.08" x2="12" y2="12"/>
        </svg>
      </div>
      <h3>Welcome to AI Assistant</h3>
      <p>I can help you with SQL queries, database operations, and answer your questions. I remember our conversation context!</p>
      <div class="quick-actions">
        <button onclick="sendQuickMessage('Create a table for user management')" class="quick-btn">Create Table</button>
        <button onclick="sendQuickMessage('Show me all tables')" class="quick-btn">List Tables</button>
        <button onclick="sendQuickMessage('Help me write a JOIN query')" class="quick-btn">JOIN Query</button>
      </div>
    </div>
  `;
  conversationHistory = [];
  sessionId = generateSessionId();
}

function scrollChatToBottom() {
  chatHistory.scrollTop = chatHistory.scrollHeight;
}

// Output Display Functions
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
    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
    ${escapeHtml(message)}
  </div>`;
}

function showSuccess(message) {
  output.innerHTML = `<div class="success-message">
    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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