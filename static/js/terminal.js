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
    
    // Show thinking process if available
    if (data.thinking && data.thinking.length > 0) {
      addThinkingMessage(data.thinking);
    }
    
    // Show tool calls if any
    if (data.tool_calls && data.tool_calls.length > 0) {
      addToolCallsMessage(data.tool_calls);
    }
    
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
    
    // Show thinking process if available (like real Gemini)
    if (data.thinking && data.thinking.length > 0) {
      addThinkingMessage(data.thinking);
    }
    
    // Show tool calls if any (agentic behavior visualization)
    if (data.tool_calls && data.tool_calls.length > 0) {
      addToolCallsMessage(data.tool_calls);
    }
    
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

// Add Thinking Process Display (like real Gemini)
function addThinkingMessage(thinkingSteps) {
  const thinkDiv = document.createElement('div');
  thinkDiv.className = 'thinking-message';
  
  let thinkHtml = `
    <div class="thinking-header">
      <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="3"/>
        <path d="M12 1v6m0 6v6m5.6-11.6l-4.2 4.2m-2.8 2.8l-4.2 4.2M23 12h-6m-6 0H5m16.6-5.6l-4.2 4.2m-2.8 2.8l-4.2 4.2"/>
      </svg>
      <span>💭 AI Thinking Process</span>
    </div>
    <div class="thinking-steps">
  `;
  
  thinkingSteps.forEach((step, index) => {
    if (step.thought) {
      thinkHtml += `
        <div class="thinking-step">
          <span class="thinking-number">${index + 1}</span>
          <div class="thinking-content">${escapeHtml(step.thought)}</div>
        </div>
      `;
    } else if (step.action) {
      thinkHtml += `
        <div class="thinking-step action">
          <span class="thinking-number">→</span>
          <div class="thinking-content">
            <strong>${escapeHtml(step.action)}</strong>
            ${step.args ? `<div class="thinking-args">${escapeHtml(JSON.stringify(step.args))}</div>` : ''}
          </div>
        </div>
      `;
    }
  });
  
  thinkHtml += '</div>';
  thinkDiv.innerHTML = thinkHtml;
  chatHistory.appendChild(thinkDiv);
  scrollChatToBottom();
}

// Add Tool Calls Visualization
function addToolCallsMessage(toolCalls) {
  const toolDiv = document.createElement('div');
  toolDiv.className = 'tool-calls-message';
  
  let toolHtml = `
    <div class="tool-header">
      <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
      </svg>
      <span>🔧 AI Agent Actions (${toolCalls.length})</span>
    </div>
    <div class="tool-list">
  `;
  
  toolCalls.forEach((call, index) => {
    const isSuccess = call.result.success;
    
    toolHtml += `
      <div class="tool-call ${isSuccess ? 'success' : 'error'}">
        <div class="tool-call-header">
          <span class="tool-number">${index + 1}</span>
          <span class="tool-name">${formatToolName(call.function)}</span>
          ${isSuccess ? '<span class="tool-status">✓</span>' : '<span class="tool-status">✗</span>'}
        </div>
        <div class="tool-details">
          ${Object.keys(call.args).length > 0 ? `<div class="tool-args"><strong>Parameters:</strong> ${escapeHtml(JSON.stringify(call.args))}</div>` : ''}
          <div class="tool-result">
            <strong>Result:</strong>
            <pre>${escapeHtml(formatToolResult(call.result))}</pre>
          </div>
        </div>
      </div>
    `;
  });
  
  toolHtml += '</div>';
  toolDiv.innerHTML = toolHtml;
  chatHistory.appendChild(toolDiv);
  scrollChatToBottom();
}

function formatToolName(name) {
  return name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function formatToolResult(result) {
  if (!result.success) {
    return `Error: ${result.error}`;
  }
  
  // Format based on result type
  if (result.tables) {
    return `Found ${result.count} tables: ${result.tables.join(', ')}`;
  }
  if (result.columns) {
    return `Table: ${result.table}\nColumns: ${result.columns.length}\n` + 
           result.columns.map(c => `  - ${c.field} (${c.type})`).join('\n');
  }
  if (result.foreign_keys) {
    if (result.foreign_keys.length === 0) {
      return `No foreign keys found`;
    }
    return `Foreign keys:\n` + result.foreign_keys.map(fk => 
      `  ${fk.column} → ${fk.references_table}.${fk.references_column}`
    ).join('\n');
  }
  if (result.data) {
    const limit = result.limit || result.row_count;
    return `Retrieved ${result.row_count} rows${limit ? ` (showing ${limit})` : ''} from ${result.table || 'query'}`;
  }
  if (result.count !== undefined) {
    return `Count: ${result.count} records`;
  }
  if (result.relationships) {
    return `Found ${result.count} relationships`;
  }
  
  return JSON.stringify(result, null, 2);
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
  
  // Convert **bold**
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  
  // Convert *italic*
  text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  
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
    <div class="loading-spinner"></div>
    <span>AI thinking and analyzing database...</span>
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
          <circle cx="12" cy="11" r="1"/>
          <circle cx="8" cy="11" r="1"/>
          <circle cx="16" cy="11" r="1"/>
        </svg>
      </div>
      <h3>Welcome! I'm your AI SQL Assistant</h3>
      <p>I can help you write queries, inspect database structure, and analyze data. I'll show you my thinking process and the tools I use!</p>
      <div class="quick-actions">
        <button onclick="sendQuickMessage('Show me all tables in my database')" class="quick-btn">
          <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"/>
          </svg>
          List Tables
        </button>
        <button onclick="sendQuickMessage('Show me sample data from the Employees table')" class="quick-btn">
          <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <line x1="3" y1="9" x2="21" y2="9"/>
            <line x1="9" y1="21" x2="9" y2="9"/>
          </svg>
          Preview Data
        </button>
        <button onclick="sendQuickMessage('Help me create a JOIN query')" class="quick-btn">
          <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/>
            <circle cx="6" cy="12" r="3"/>
            <circle cx="18" cy="12" r="3"/>
          </svg>
          Create JOIN
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