const output = document.getElementById("output");
const textarea = document.getElementById("query");
const chatHistory = document.getElementById("chatHistory");
const chatInput = document.getElementById("chatInput");

// Session-based conversation history
let conversationHistory = [];
let sessionId = generateSessionId();

// Table preview cache
let tablePreviewCache = {};
let availableTables = [];

// Collapsible panel states
let panelStates = {
  queryEditor: false,  // Closed by default
  queryResults: false, // Closed by default
  aiAssistant: true    // Open by default
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  // Keyboard shortcuts
  textarea.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      runQuery(true);
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
  
  initCollapsiblePanels();
  setInitialPanelStates();
  initResizablePanels();
  loadAvailableTables();
});

function setInitialPanelStates() {
  const isMobile = window.innerWidth <= 768;
  
  if (isMobile) {
    panelStates.queryEditor = false;
    panelStates.queryResults = false;
    panelStates.aiAssistant = true;
  } else {
    panelStates.queryEditor = true;
    panelStates.queryResults = true;
    panelStates.aiAssistant = true;
  }
  
  updatePanelStates();
}

function initCollapsiblePanels() {
  const terminalPanel = document.querySelector('.terminal-panel');
  const terminalHeader = terminalPanel.querySelector('.panel-header');
  const terminalTitle = terminalHeader.querySelector('.panel-title');
  
  const terminalToggle = document.createElement('button');
  terminalToggle.className = 'panel-toggle';
  terminalToggle.innerHTML = `
    <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
  `;
  terminalToggle.onclick = () => togglePanel('queryEditor');
  terminalTitle.insertBefore(terminalToggle, terminalTitle.firstChild);
  
  const outputPanel = document.querySelector('.output-panel');
  const outputHeader = outputPanel.querySelector('.panel-header');
  const outputTitle = outputHeader.querySelector('.panel-title');
  
  const outputToggle = document.createElement('button');
  outputToggle.className = 'panel-toggle';
  outputToggle.innerHTML = `
    <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
  `;
  outputToggle.onclick = () => togglePanel('queryResults');
  outputTitle.insertBefore(outputToggle, outputTitle.firstChild);
  
  const chatPanel = document.querySelector('.chat-panel');
  const chatHeader = chatPanel.querySelector('.panel-header');
  const chatTitle = chatHeader.querySelector('.panel-title');
  
  const chatToggle = document.createElement('button');
  chatToggle.className = 'panel-toggle';
  chatToggle.innerHTML = `
    <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
  `;
  chatToggle.onclick = () => togglePanel('aiAssistant');
  chatTitle.insertBefore(chatToggle, chatTitle.firstChild);
}

function togglePanel(panelName) {
  panelStates[panelName] = !panelStates[panelName];
  updatePanelStates();
}

function updatePanelStates() {
  const terminalPanel = document.querySelector('.terminal-panel');
  const outputPanel = document.querySelector('.output-panel');
  const chatPanel = document.querySelector('.chat-panel');
  
  if (panelStates.queryEditor) {
    terminalPanel.classList.add('panel-expanded');
    terminalPanel.classList.remove('panel-collapsed');
  } else {
    terminalPanel.classList.add('panel-collapsed');
    terminalPanel.classList.remove('panel-expanded');
  }
  
  if (panelStates.queryResults) {
    outputPanel.classList.add('panel-expanded');
    outputPanel.classList.remove('panel-collapsed');
  } else {
    outputPanel.classList.add('panel-collapsed');
    outputPanel.classList.remove('panel-expanded');
  }
  
  if (panelStates.aiAssistant) {
    chatPanel.classList.add('panel-expanded');
    chatPanel.classList.remove('panel-collapsed');
  } else {
    chatPanel.classList.add('panel-collapsed');
    chatPanel.classList.remove('panel-expanded');
  }
}

function autoResize(e) {
  e.target.style.height = 'auto';
  e.target.style.height = e.target.scrollHeight + 'px';
}

function generateSessionId() {
  return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

async function loadAvailableTables() {
  try {
    const response = await fetch("/ai-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        messages: [{ role: 'user', content: 'List all tables in the database' }],
        sessionId: 'preview_' + Date.now()
      })
    });
    
    const data = await response.json();
    if (data.success && data.tool_calls) {
      for (const call of data.tool_calls) {
        if (call.function === 'list_tables' && call.result && call.result.tables) {
          availableTables = call.result.tables;
          break;
        }
      }
    }
  } catch (err) {
    console.error('Failed to load tables:', err);
  }
}

async function previewTable(tableName) {
  panelStates.queryResults = true;
  updatePanelStates();
  
  if (tablePreviewCache[tableName]) {
    displayTablePreview(tableName, tablePreviewCache[tableName]);
    return;
  }
  
  showLoading(`Loading preview of ${tableName}...`);
  
  try {
    const response = await fetch("/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: `SELECT * FROM ${tableName} LIMIT 100` })
    });
    
    const data = await response.json();
    if (data.success && Array.isArray(data.data)) {
      tablePreviewCache[tableName] = data.data;
      displayTablePreview(tableName, data.data);
    } else {
      showError(data.error || 'Failed to preview table');
    }
  } catch (err) {
    showError('Network error: ' + err.message);
  }
}

function displayTablePreview(tableName, data) {
  if (!data || data.length === 0) {
    output.innerHTML = `<div class="output-empty">Table "${tableName}" is empty</div>`;
    return;
  }

  const cols = Object.keys(data[0]);
  let html = `
    <div style="padding: 12px 20px; background: var(--bg-tertiary); border-bottom: 1px solid var(--border-primary); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
      <div>
        <strong style="color: var(--accent-light);">Table Preview:</strong> ${escapeHtml(tableName)} 
        <span style="color: var(--text-muted); font-size: 0.9rem;">(${data.length} rows)</span>
      </div>
      <button onclick="refreshTablePreview('${tableName}')" class="btn-refresh" style="padding: 6px 12px; font-size: 0.8rem; display: flex; align-items: center; gap: 6px;">
        <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="23 4 23 10 17 10"></polyline>
          <polyline points="1 20 1 14 7 14"></polyline>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
        </svg>
        Refresh
      </button>
    </div>
    <table><thead><tr>`;
  
  cols.forEach(c => {
    html += `<th>${escapeHtml(c)}</th>`;
  });
  html += '</tr></thead><tbody>';

  data.forEach(r => {
    html += '<tr>';
    cols.forEach(c => {
      const value = r[c] !== null && r[c] !== undefined ? r[c] : '<em style="color: var(--text-muted)">NULL</em>';
      html += `<td>${escapeHtml(String(value))}</td>`;
    });
    html += '</tr>';
  });

  html += '</tbody></table>';
  output.innerHTML = html;
}

function refreshTablePreview(tableName) {
  delete tablePreviewCache[tableName];
  previewTable(tableName);
}

function runQuery(useSelection = false) {
  let query = '';
  
  if (useSelection) {
    const selectedText = textarea.value.substring(
      textarea.selectionStart,
      textarea.selectionEnd
    ).trim();
    
    if (selectedText) {
      query = selectedText;
    } else {
      query = textarea.value.trim();
    }
  } else {
    query = textarea.value.trim();
  }
  
  if (!query) {
    showError("Please enter a query");
    return;
  }

  panelStates.queryResults = true;
  updatePanelStates();

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

function checkSyntax() {
  const query = textarea.value.trim();
  if (!query) {
    showError("Please enter a query to check");
    return;
  }

  removeWelcomeMessage();
  addChatMessage('user', 'Check and fix this SQL syntax: ' + query);
  
  const thinkingId = addLoadingMessage();

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

    conversationHistory = data.history || conversationHistory;
    
    if (data.tool_calls && data.tool_calls.length > 0) {
      addToolCallsMessage(data.tool_calls);
    }
    
    addChatMessage('ai', data.response);
  })
  .catch(err => {
    removeLoadingMessage(thinkingId);
    addChatMessage('error', err.message);
    showError(err.message);
  });
}

function sendChatMessage() {
  const text = chatInput.value.trim();
  if (!text) return;

  removeWelcomeMessage();
  addChatMessage('user', text);
  
  chatInput.value = '';
  chatInput.style.height = 'auto';
  
  const thinkingId = addLoadingMessage();

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
      addChatMessage('error', data.error || 'Failed to process request');
      return;
    }

    conversationHistory = data.history || conversationHistory;
    
    if (data.tool_calls && data.tool_calls.length > 0) {
      addToolCallsMessage(data.tool_calls);
    }
    
    addChatMessage('ai', data.response);
  })
  .catch(err => {
    removeLoadingMessage(thinkingId);
    addChatMessage('error', err.message);
  });
}

function sendQuickMessage(message) {
  chatInput.value = message;
  sendChatMessage();
}

// COMPLETELY REWRITTEN: Extract and display SQL properly
function extractSQLQueries(text) {
  const queries = [];
  
  // Pattern 1: ```sql ... ``` blocks
  const sqlBlockPattern = /```sql\s*\n([\s\S]*?)```/gi;
  let match;
  
  while ((match = sqlBlockPattern.exec(text)) !== null) {
    const query = match[1].trim();
    if (query) {
      queries.push(query);
    }
  }
  
  // Pattern 2: ``` ... ``` blocks without sql tag (check if it's SQL)
  if (queries.length === 0) {
    const codeBlockPattern = /```\s*\n([\s\S]*?)```/gi;
    while ((match = codeBlockPattern.exec(text)) !== null) {
      const code = match[1].trim();
      if (code && /\b(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|SHOW|DESCRIBE)\b/i.test(code)) {
        queries.push(code);
      }
    }
  }
  
  // Pattern 3: Inline code with SQL keywords
  if (queries.length === 0) {
    const inlinePattern = /`([^`]+)`/g;
    while ((match = inlinePattern.exec(text)) !== null) {
      const code = match[1].trim();
      if (code && /\b(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i.test(code)) {
        queries.push(code);
      }
    }
  }
  
  return queries;
}

function removeSQLFromText(text) {
  // Remove all SQL code blocks
  text = text.replace(/```sql\s*\n[\s\S]*?```/gi, '');
  text = text.replace(/```\s*\n[\s\S]*?```/g, '');
  
  // Clean up extra whitespace
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.trim();
  
  return text;
}

function addChatMessage(type, content) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${type}`;
  
  if (type === 'ai') {
    // Extract SQL queries
    const sqlQueries = extractSQLQueries(content);
    
    // Remove SQL from main text content
    let textContent = removeSQLFromText(content);
    
    // Format text with markdown-like support
    let formattedContent = escapeHtml(textContent);
    
    // Bold text
    formattedContent = formattedContent.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Inline code
    formattedContent = formattedContent.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Headers (###, ##, #)
    formattedContent = formattedContent.replace(/^### (.+)$/gm, '<h3 style="margin: 16px 0 8px 0; font-size: 1.1rem; font-weight: 600;">$1</h3>');
    formattedContent = formattedContent.replace(/^## (.+)$/gm, '<h2 style="margin: 20px 0 10px 0; font-size: 1.2rem; font-weight: 600;">$1</h2>');
    formattedContent = formattedContent.replace(/^# (.+)$/gm, '<h1 style="margin: 24px 0 12px 0; font-size: 1.3rem; font-weight: 600;">$1</h1>');
    
    // Bullet points (lines starting with * or -)
    formattedContent = formattedContent.replace(/^\* (.+)$/gm, '<li style="margin-left: 20px;">$1</li>');
    formattedContent = formattedContent.replace(/^- (.+)$/gm, '<li style="margin-left: 20px;">$1</li>');
    
    // Wrap consecutive <li> in <ul>
    formattedContent = formattedContent.replace(/(<li[^>]*>.*?<\/li>\n?)+/g, '<ul style="margin: 8px 0; padding-left: 20px;">$&</ul>');
    
    // Double line breaks = paragraph breaks
    formattedContent = formattedContent.replace(/\n\n/g, '</p><p style="margin: 12px 0;">');
    formattedContent = '<p style="margin: 12px 0;">' + formattedContent + '</p>';
    
    // Single line breaks within paragraphs
    formattedContent = formattedContent.replace(/\n/g, '<br>');
    
    // Clean up empty paragraphs
    formattedContent = formattedContent.replace(/<p[^>]*>\s*<\/p>/g, '');
    
    messageDiv.innerHTML = `<div class="message-content">${formattedContent}</div>`;
    
    // Add SQL code blocks
    sqlQueries.forEach((sqlQuery, index) => {
      const codeBlock = document.createElement('div');
      codeBlock.className = 'code-block-container';
      
      // Create unique ID for this query
      const queryId = 'query_' + Date.now() + '_' + index;
      
      codeBlock.innerHTML = `
        <div class="code-header">
          <span class="code-lang">SQL</span>
          <div class="code-actions">
            <button onclick="copyQuery('${queryId}')" class="btn-code-action">
              <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              <span class="btn-text">Copy</span>
            </button>
            <button onclick="loadQuery('${queryId}')" class="btn-code-action">
              <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="16 18 22 12 16 6"></polyline>
                <polyline points="8 6 2 12 8 18"></polyline>
              </svg>
              <span class="btn-text">Load to Editor</span>
            </button>
            <button onclick="executeQuery('${queryId}')" class="btn-code-action btn-execute">
              <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
              <span class="btn-text">Execute</span>
            </button>
          </div>
        </div>
        <pre><code id="${queryId}">${escapeHtml(sqlQuery)}</code></pre>
      `;
      messageDiv.appendChild(codeBlock);
    });
  } else if (type === 'user') {
    messageDiv.innerHTML = `<div class="message-content">${escapeHtml(content)}</div>`;
  } else if (type === 'error') {
    messageDiv.innerHTML = `
      <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <div class="message-content">${escapeHtml(content)}</div>
    `;
  }
  
  chatHistory.appendChild(messageDiv);
  scrollChatToBottom();
}

function copyQuery(queryId) {
  const codeElement = document.getElementById(queryId);
  const text = codeElement.textContent;
  
  navigator.clipboard.writeText(text).then(() => {
    const btn = event.target.closest('button');
    const textSpan = btn.querySelector('.btn-text');
    
    if (textSpan) {
      const originalText = textSpan.textContent;
      textSpan.textContent = 'Copied!';
      setTimeout(() => {
        textSpan.textContent = originalText;
      }, 2000);
    }
  });
}

function loadQuery(queryId) {
  const codeElement = document.getElementById(queryId);
  const sql = codeElement.textContent;
  
  textarea.value = sql;
  panelStates.queryEditor = true;
  updatePanelStates();
  textarea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function executeQuery(queryId) {
  const codeElement = document.getElementById(queryId);
  const sql = codeElement.textContent;
  
  panelStates.queryResults = true;
  updatePanelStates();

  showLoading("Executing query...");

  fetch("/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql })
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

// FIXED: Tool calls collapsed by default
function addToolCallsMessage(toolCalls) {
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message tool-calls';
  
  const toolCallId = 'tool-calls-' + Date.now();
  
  let toolsHtml = `
    <div class="tool-calls-header" onclick="toggleToolCalls('${toolCallId}')" style="cursor: pointer; user-select: none;">
      <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
      </svg>
      AI Agent Actions (${toolCalls.length})
      <svg class="icon-xs chevron-toggle" id="chevron-${toolCallId}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left: auto; transition: transform 0.3s ease;">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    </div>
    <div class="tool-calls-container" id="${toolCallId}" style="display: none;">
  `;
  
  toolCalls.forEach((call, idx) => {
    const isSuccess = call.result && !call.result.error;
    const statusIcon = isSuccess ? '✓' : '✗';
    
    toolsHtml += `
      <div class="tool-call ${isSuccess ? 'success' : 'error'}">
        <div class="tool-call-header">
          <span class="tool-number">${idx + 1}</span>
          <span class="tool-name">${escapeHtml(call.function)}</span>
          <span class="tool-status">${statusIcon}</span>
        </div>
        <div class="tool-details">
          ${call.args ? `<div class="tool-args">Args: ${escapeHtml(JSON.stringify(call.args))}</div>` : ''}
          ${call.result ? `
            <div class="tool-result">
              ${isSuccess ? '<strong>Result:</strong>' : '<strong>Error:</strong>'}
              <pre>${escapeHtml(JSON.stringify(call.result, null, 2))}</pre>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  });
  
  toolsHtml += '</div>';
  messageDiv.innerHTML = toolsHtml;
  
  chatHistory.appendChild(messageDiv);
  scrollChatToBottom();
}

function toggleToolCalls(toolCallId) {
  const container = document.getElementById(toolCallId);
  const chevron = document.getElementById('chevron-' + toolCallId);
  
  if (container.style.display === 'none') {
    container.style.display = 'flex';
    if (chevron) chevron.style.transform = 'rotate(180deg)';
  } else {
    container.style.display = 'none';
    if (chevron) chevron.style.transform = 'rotate(0deg)';
  }
}

function addLoadingMessage() {
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'loading-message';
  loadingDiv.id = 'loading_' + Date.now();
  loadingDiv.innerHTML = `
    <div class="loading-spinner"></div>
    <span>AI is thinking...</span>
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
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          <circle cx="12" cy="11" r="1" fill="currentColor"/>
          <circle cx="8" cy="11" r="1" fill="currentColor"/>
          <circle cx="16" cy="11" r="1" fill="currentColor"/>
        </svg>
      </div>
      <h3>Welcome! I'm your SQL Assistant</h3>
      <p>I can help you write queries, optimize database operations, and learn SQL concepts. I remember our conversation, so feel free to ask follow-up questions!</p>
      <div class="quick-actions">
        <button onclick="sendQuickMessage('Create a users table with id, name, email, and created_at fields')" class="quick-btn">
          <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Create Table
        </button>
        <button onclick="sendQuickMessage('Show me all tables in the database')" class="quick-btn">
          <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="7"/>
            <rect x="14" y="3" width="7" height="7"/>
            <rect x="14" y="14" width="7" height="7"/>
            <rect x="3" y="14" width="7" height="7"/>
          </svg>
          List Tables
        </button>
        <button onclick="sendQuickMessage('Help me write a JOIN query between users and orders tables')" class="quick-btn">
          <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 1v6m0 6v6M1 12h6m6 0h6"/>
          </svg>
          JOIN Query
        </button>
      </div>
    </div>
  `;
  conversationHistory = [];
  sessionId = generateSessionId();
}

function scrollChatToBottom() {
  chatHistory.scrollTop = chatHistory.scrollHeight;
}

function renderTable(rows) {
  if (!rows.length) {
    output.innerHTML = '<div class="output-empty">Query returned no rows</div>';
    return;
  }

  const cols = Object.keys(rows[0]);
  
  let previewHtml = '';
  if (availableTables.length > 0) {
    previewHtml = `
      <div class="table-preview-dropdown">
        <button class="preview-dropdown-btn" onclick="togglePreviewDropdown()">
          <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <line x1="3" y1="9" x2="21" y2="9"/>
            <line x1="9" y1="21" x2="9" y2="9"/>
          </svg>
          Preview Tables
          <svg class="icon-xs chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
        <div class="preview-dropdown-content" id="previewDropdown">
          ${availableTables.map(table => `
            <button class="preview-dropdown-item" onclick="previewTable('${escapeHtml(table)}')">
              <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <line x1="3" y1="9" x2="21" y2="9"/>
                <line x1="9" y1="21" x2="9" y2="9"/>
              </svg>
              ${escapeHtml(table)}
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }
  
  let html = previewHtml + '<table><thead><tr>';
  
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

function togglePreviewDropdown() {
  const dropdown = document.getElementById('previewDropdown');
  const btn = dropdown.previousElementSibling;
  
  if (dropdown.classList.contains('show')) {
    dropdown.classList.remove('show');
    btn.classList.remove('active');
  } else {
    dropdown.classList.add('show');
    btn.classList.add('active');
  }
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.table-preview-dropdown')) {
    const dropdown = document.getElementById('previewDropdown');
    const btn = document.querySelector('.preview-dropdown-btn');
    if (dropdown) {
      dropdown.classList.remove('show');
      if (btn) btn.classList.remove('active');
    }
  }
});

function showLoading(message) {
  output.innerHTML = `
    <div style="display: flex; align-items: center; gap: 12px; padding: 20px;">
      <div class="loading-spinner"></div>
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

function initResizablePanels() {
  const leftSection = document.querySelector('.left-section');
  const terminalPanel = document.querySelector('.terminal-panel');
  const outputPanel = document.querySelector('.output-panel');
  
  const hResizer = document.createElement('div');
  hResizer.className = 'resizer horizontal-resizer';
  terminalPanel.appendChild(hResizer);
  
  let isResizingH = false;
  let startY = 0;
  let startHeight = 0;
  
  hResizer.addEventListener('mousedown', (e) => {
    isResizingH = true;
    startY = e.clientY;
    startHeight = terminalPanel.offsetHeight;
    document.body.style.cursor = 'row-resize';
    e.preventDefault();
  });
  
  hResizer.addEventListener('touchstart', (e) => {
    isResizingH = true;
    startY = e.touches[0].clientY;
    startHeight = terminalPanel.offsetHeight;
    e.preventDefault();
  }, { passive: false });
  
  document.addEventListener('mousemove', (e) => {
    if (!isResizingH) return;
    
    const delta = e.clientY - startY;
    const newHeight = startHeight + delta;
    const minHeight = 150;
    const maxHeight = leftSection.offsetHeight - 150;
    
    if (newHeight >= minHeight && newHeight <= maxHeight) {
      terminalPanel.style.flex = 'none';
      terminalPanel.style.height = newHeight + 'px';
    }
  });
  
  document.addEventListener('touchmove', (e) => {
    if (!isResizingH) return;
    
    const delta = e.touches[0].clientY - startY;
    const newHeight = startHeight + delta;
    const minHeight = 150;
    const maxHeight = leftSection.offsetHeight - 150;
    
    if (newHeight >= minHeight && newHeight <= maxHeight) {
      terminalPanel.style.flex = 'none';
      terminalPanel.style.height = newHeight + 'px';
    }
  }, { passive: false });
  
  document.addEventListener('mouseup', () => {
    if (isResizingH) {
      isResizingH = false;
      document.body.style.cursor = 'default';
    }
  });
  
  document.addEventListener('touchend', () => {
    if (isResizingH) {
      isResizingH = false;
    }
  });
  
  if (window.innerWidth > 968) {
    const mainGrid = document.querySelector('.main-grid');
    const chatSection = document.querySelector('.chat-section');
    
    const vResizer = document.createElement('div');
    vResizer.className = 'resizer vertical-resizer';
    leftSection.appendChild(vResizer);
    
    let isResizingV = false;
    let startX = 0;
    let startWidth = 0;
    
    vResizer.addEventListener('mousedown', (e) => {
      isResizingV = true;
      startX = e.clientX;
      startWidth = leftSection.offsetWidth;
      document.body.style.cursor = 'col-resize';
      e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
      if (!isResizingV) return;
      
      const delta = e.clientX - startX;
      const newWidth = startWidth + delta;
      const minWidth = 400;
      const maxWidth = window.innerWidth - 350;
      
      if (newWidth >= minWidth && newWidth <= maxWidth) {
        const chatWidth = window.innerWidth - newWidth;
        mainGrid.style.gridTemplateColumns = `${newWidth}px ${chatWidth}px`;
      }
    });
    
    document.addEventListener('mouseup', () => {
      if (isResizingV) {
        isResizingV = false;
        document.body.style.cursor = 'default';
      }
    });
  }
}