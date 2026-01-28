const output = document.getElementById("output");
const textarea = document.getElementById("query");
const chatHistory = document.getElementById("chatHistory");
const chatInput = document.getElementById("chatInput");

// Session-based conversation history
let conversationHistory = [];
let sessionId = generateSessionId();
let lastExecutedQuery = null;

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
  lastExecutedQuery = query;

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
      
      // Also show results in chat if on mobile or if results are important
      if (window.innerWidth <= 768) {
        addQueryResultToChat(query, data.data);
      }
    } else {
      showSuccess(data.data);
    }
  })
  .catch(err => {
    showError("Network error: " + err.message);
  });
}

// Check and Fix SQL Syntax with AI
function checkSyntax() {
  const query = textarea.value.trim();
  if (!query) {
    showError("Please enter a query to check");
    return;
  }

  // Add user message to chat
  removeWelcomeMessage();
  addChatMessage('user', 'Please check and fix this SQL syntax: ' + query);
  
  const thinkingId = addLoadingMessage();

  // Build the prompt for syntax checking
  const messages = [
    ...conversationHistory,
    {
      role: 'user',
      content: `Please analyze this SQL query for syntax errors, optimization opportunities, and best practices. If there are issues, provide the corrected version. If it's correct, confirm and suggest any optimizations if applicable. 

Query: ${query}

Respond with:
1. Analysis of the query
2. Any issues found
3. Corrected/optimized version if needed`
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
    
    // If corrected SQL is provided and different, update textarea
    if (data.sql && data.sql !== query) {
      textarea.value = data.sql;
      autoResize({ target: textarea });
      showSuccess("Query updated with corrections!");
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
    
    // Add AI response with optional SQL and suggestions
    addChatMessage('ai', data.response, data.sql, data.suggestions);
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
function addChatMessage(type, content, sql = null, suggestions = null) {
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
    
    // Add suggestions if provided
    if (suggestions && suggestions.length > 0) {
      const suggestionsDiv = createSuggestionsPanel(suggestions);
      messageDiv.appendChild(suggestionsDiv);
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
  // Convert tables first (before other formatting)
  text = convertMarkdownTable(text);
  
  // Convert markdown-style code blocks to HTML
  text = text.replace(/```sql\n?([\s\S]*?)```/g, '<pre><code class="sql">$1</code></pre>');
  text = text.replace(/```\n?([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  
  // Convert inline code
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // Convert headers
  text = text.replace(/^### (.*$)/gm, '<h3>$1</h3>');
  text = text.replace(/^## (.*$)/gm, '<h2>$1</h2>');
  text = text.replace(/^# (.*$)/gm, '<h1>$1</h1>');
  
  // Convert bold and italic
  text = text.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  
  // Convert links
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  
  // Convert horizontal rules
  text = text.replace(/^---+$/gm, '<hr>');
  
  // Convert unordered lists
  text = text.replace(/^\* (.*$)/gm, '<li>$1</li>');
  text = text.replace(/^- (.*$)/gm, '<li>$1</li>');
  
  // Convert ordered lists
  text = text.replace(/^\d+\. (.*$)/gm, '<li>$1</li>');
  
  // Wrap consecutive list items
  text = text.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
  
  // Convert line breaks (but not in code blocks)
  text = text.replace(/\n/g, '<br>');
  
  return text;
}

function convertMarkdownTable(text) {
  // Simple table conversion - look for table patterns and convert them
  const tableRegex = /((?:\|[^\n]+\|\n?)+)(?:\n\|[-:| ]+\|\n)((?:\|[^\n]+\|\n?)+)/g;
  
  return text.replace(tableRegex, (match, headerLine, separatorLine, bodyLines) => {
    // Parse header
    const headers = headerLine.trim().split('|').filter(cell => cell.trim()).map(cell => cell.trim());
    
    // Parse body rows
    const bodyRows = bodyLines.trim().split('\n').map(row => 
      row.split('|').filter(cell => cell.trim()).map(cell => cell.trim())
    );
    
    // Build HTML table
    let html = '<table><thead><tr>';
    headers.forEach(header => {
      html += `<th>${header}</th>`;
    });
    html += '</tr></thead><tbody>';
    
    bodyRows.forEach(row => {
      html += '<tr>';
      row.forEach(cell => {
        html += `<td>${cell}</td>`;
      });
      html += '</tr>';
    });
    
    html += '</tbody></table>';
    return html;
  });
}

function createSuggestionsPanel(suggestions) {
  const panel = document.createElement('div');
  panel.className = 'suggestions';
  
  const title = document.createElement('div');
  title.className = 'suggestion-title';
  title.textContent = '💡 What\'s Next?';
  panel.appendChild(title);
  
  suggestions.forEach(suggestion => {
    const item = document.createElement('div');
    item.className = 'suggestion-item';
    item.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
      <span>${escapeHtml(suggestion)}</span>
    `;
    item.onclick = () => {
      chatInput.value = suggestion;
      sendChatMessage();
    };
    panel.appendChild(item);
  });
  
  return panel;
}

function addToEditor(sql) {
  textarea.value = sql;
  autoResize({ target: textarea });
  textarea.focus();
  
  // Show confirmation
  showSuccess("Query added to editor");
}

function executeGeneratedQuery(sql) {
  textarea.value = sql;
  
  // Add message about execution
  addChatMessage('user', 'Execute this query');
  const thinkingId = addLoadingMessage();
  
  fetch("/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql })
  })
  .then(res => res.json())
  .then(data => {
    removeLoadingMessage(thinkingId);
    
    if (!data.success) {
      addChatMessage('error', 'Query execution failed: ' + data.error);
      showError(data.error);
      return;
    }

    if (Array.isArray(data.data)) {
      // Show in results panel
      renderTable(data.data);
      
      // Show compact results in chat
      addQueryResultToChat(sql, data.data);
      
      // Generate suggestions based on results
      generateContextualSuggestions(sql, data.data);
    } else {
      addChatMessage('ai', '✅ ' + data.data);
      showSuccess(data.data);
    }
  })
  .catch(err => {
    removeLoadingMessage(thinkingId);
    addChatMessage('error', 'Network error: ' + err.message);
    showError(err.message);
  });
}

function addQueryResultToChat(query, data) {
  const resultDiv = document.createElement('div');
  resultDiv.className = 'message ai';
  
  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';
  
  const rowCount = data.length;
  const displayCount = Math.min(rowCount, 5);
  const hasMore = rowCount > 5;
  
  let html = `<strong>✅ Query executed successfully</strong><br><br>`;
  html += `Found ${rowCount} row${rowCount !== 1 ? 's' : ''}. ${hasMore ? `Showing first ${displayCount}:` : ''}`;
  
  if (data.length > 0) {
    html += '<div class="ai-result-table">';
    html += '<table><thead><tr>';
    
    const cols = Object.keys(data[0]);
    cols.forEach(c => {
      html += `<th>${escapeHtml(c)}</th>`;
    });
    html += '</tr></thead><tbody>';

    data.slice(0, displayCount).forEach(r => {
      html += '<tr>';
      cols.forEach(c => {
        const value = r[c] !== null ? r[c] : '<em>NULL</em>';
        html += `<td>${escapeHtml(String(value))}</td>`;
      });
      html += '</tr>';
    });

    html += '</tbody></table></div>';
    
    if (hasMore) {
      html += `<br><em>+ ${rowCount - displayCount} more rows in results panel</em>`;
    }
  }
  
  contentDiv.innerHTML = html;
  resultDiv.appendChild(contentDiv);
  
  chatHistory.appendChild(resultDiv);
  scrollChatToBottom();
}

function generateContextualSuggestions(query, data) {
  const suggestions = [];
  const lowerQuery = query.toLowerCase();
  
  // Smart suggestions based on query type
  if (lowerQuery.includes('select')) {
    suggestions.push('Add a WHERE clause to filter results');
    suggestions.push('Sort results with ORDER BY');
    if (!lowerQuery.includes('limit')) {
      suggestions.push('Add LIMIT to restrict rows returned');
    }
  }
  
  if (lowerQuery.includes('create table')) {
    suggestions.push('Insert sample data into this table');
    suggestions.push('Create an index for better performance');
  }
  
  if (lowerQuery.includes('insert')) {
    suggestions.push('Verify the data with a SELECT query');
    suggestions.push('Insert more records');
  }
  
  if (data && data.length > 0) {
    suggestions.push('Explain what this data means');
    if (data.length > 10) {
      suggestions.push('Help me analyze patterns in this data');
    }
  }
  
  // Always add learning suggestion
  suggestions.push('Teach me about SQL optimization');
  
  if (suggestions.length > 0) {
    // Add a small delay for better UX
    setTimeout(() => {
      const messageDiv = document.createElement('div');
      messageDiv.className = 'message ai';
      
      const suggestionsPanel = createSuggestionsPanel(suggestions.slice(0, 4));
      messageDiv.appendChild(suggestionsPanel);
      
      chatHistory.appendChild(messageDiv);
      scrollChatToBottom();
    }, 500);
  }
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
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          <circle cx="12" cy="11" r="1"/>
          <circle cx="8" cy="11" r="1"/>
          <circle cx="16" cy="11" r="1"/>
        </svg>
      </div>
      <h3>Welcome! I'm your SQL Assistant</h3>
      <p>I can help you write queries, optimize database operations, and learn SQL concepts. I remember our conversation, so feel free to ask follow-up questions!</p>
      <div class="quick-actions">
        <button onclick="sendQuickMessage('Create a users table with id, name, email, and created_at fields')" class="quick-btn">
          <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          Create Table
        </button>
        <button onclick="sendQuickMessage('Show me all tables in the database')" class="quick-btn">
          <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"/>
          </svg>
          List Tables
        </button>
        <button onclick="sendQuickMessage('Help me write a JOIN query between users and orders tables')" class="quick-btn">
          <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/>
            <circle cx="6" cy="12" r="3"/>
            <circle cx="18" cy="12" r="3"/>
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

// Output Display Functions
function renderTable(rows) {
  if (!rows.length) {
    output.innerHTML = '<div class="output-empty"><svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg><p>Query returned no rows</p></div>';
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