# SQL Terminal Pro - Enhanced AI-Powered Database Console

A modern, AI-enhanced SQL terminal with conversational assistance, context-aware suggestions, and mobile-responsive design.

## 🎯 Key Features

### 1. **Conversational AI Assistant**
- **Session-based memory**: AI remembers your entire conversation context
- **Natural language to SQL**: Describe what you need, get optimized queries
- **Educational responses**: Learn SQL concepts while solving problems
- **Context-aware suggestions**: AI suggests next steps based on your queries

### 2. **Interactive Query Management**
- **AI Check & Fix**: Click to validate and correct SQL syntax automatically
- **Execute from Chat**: Generate queries in chat and run them with one click
- **Add to Editor**: Move AI-generated queries to the editor for modification
- **Real-time Results**: See query results immediately in both panels

### 3. **Smart Result Display**
- **Full Results Panel**: Complete query results on the left side (desktop)
- **Chat Integration**: Compact results (5 rows max) shown in AI chat
- **Mobile Optimization**: Results appear in chat on mobile devices
- **Table Formatting**: Professional table display with proper styling

### 4. **Learning & Guidance**
- **What's Next Suggestions**: AI suggests follow-up actions after each query
- **Educational Explanations**: Understand WHY, not just HOW
- **Best Practices**: Learn SQL optimization and database design
- **Quick Actions**: Pre-built prompts for common tasks

### 5. **Mobile Responsive**
- **Adaptive Layout**: Stack vertically on tablets/phones
- **Touch-Optimized**: Large buttons and touch targets
- **Collapsible Sections**: Hide what you don't need
- **Compact UI**: Efficient use of screen space

## 🏗️ Architecture

### Layout Structure
```
┌─────────────────────────────────────────────────┐
│              Header (Connected Status)           │
├──────────────────────────┬──────────────────────┤
│   Query Editor           │                      │
│   [SQL Input Area]       │   AI Assistant      │
│   [Execute Button]       │   (Conversational)   │
├──────────────────────────┤                      │
│   Query Results          │   [Chat History]    │
│   (Desktop Only)         │                      │
│                          │   [Input Box]        │
└──────────────────────────┴──────────────────────┘
```

### Mobile Layout
```
┌─────────────────────────┐
│   Header                │
├─────────────────────────┤
│   Query Editor          │
│   [Execute]             │
├─────────────────────────┤
│   AI Assistant          │
│   (Full Screen)         │
│   - Results in chat     │
│   - Suggestions         │
│   [Input Box]           │
└─────────────────────────┘
```

## 🚀 Setup Instructions

### Prerequisites
- Python 3.8+
- MySQL Database
- Google Gemini API Key

### Installation

1. **Clone and Install Dependencies**
```bash
pip install -r requirements.txt
```

2. **Configure Environment Variables**
Create a `.env` file:
```env
# MySQL Configuration
MYSQL_HOST=localhost
MYSQL_USER=your_username
MYSQL_PASSWORD=your_password
MYSQL_DB=your_database

# Gemini AI Configuration
GEMINI_API_KEY=your_gemini_api_key

# Optional
SECRET_KEY=your_flask_secret_key
```

3. **Run the Application**
```bash
python app.py
```

4. **Access the Interface**
```
Landing Page: http://localhost:5000/
Terminal:     http://localhost:5000/terminal
```

## 💡 How to Use

### Basic Workflow

1. **Start a Conversation**
   - Click quick action buttons or type a question
   - Example: "Create a users table with id, name, and email"

2. **Generate Queries**
   - AI provides SQL in code blocks
   - Click "Add to Editor" to modify
   - Click "Execute Query" to run immediately

3. **Review Results**
   - Full results appear in the left panel (desktop)
   - Compact results (5 rows) show in chat
   - AI suggests what to do next

4. **Learn as You Go**
   - Ask "Why?" questions
   - Request explanations
   - Get optimization tips

### AI Check & Fix Button

Instead of a traditional "Check Syntax" button, the **"AI Check & Fix"** button:
- Analyzes your query for errors
- Suggests optimizations
- Corrects syntax issues
- Updates the editor automatically
- Explains what was changed

### Example Conversations

**Create a Table:**
```
You: "Create a products table with id, name, price, and stock"
AI: [Generates CREATE TABLE query]
    [Shows buttons: Add to Editor | Execute Query]
    [Suggests: Insert sample data | Create index | etc.]
```

**Optimize a Query:**
```
You: "How can I make this SELECT faster?"
AI: [Analyzes current query in editor]
    [Suggests adding indexes]
    [Provides optimized version]
    [Explains the improvements]
```

**Learn Concepts:**
```
You: "Explain JOINs to me"
AI: [Comprehensive explanation]
    [Provides examples]
    [Suggests: Try writing a JOIN query]
```

## 🎨 Features in Detail

### Session-Based Context Memory
The AI maintains conversation history per session, allowing:
- Follow-up questions without repeating context
- Reference to previous queries
- Building on earlier suggestions
- Natural, flowing conversations

### Contextual Suggestions
After each action, AI suggests relevant next steps:
- After CREATE TABLE → "Insert sample data"
- After SELECT → "Add WHERE clause to filter"
- After JOIN → "Optimize with indexes"
- Always → "Teach me about [concept]"

### Query Execution from Chat
When AI generates a query:
1. **Add to Editor**: Copies SQL to editor for review/modification
2. **Execute Query**: Runs immediately and shows results in chat
3. Results include:
   - Success/error message
   - Row count
   - First 5 rows in formatted table
   - "See all results in panel" link (desktop)

### Mobile Optimization
On screens < 768px:
- Single column layout
- Results panel hidden (results show in chat)
- Larger touch targets
- Simplified header
- Full-screen AI chat
- Auto-focus optimizations

## 🔧 Technical Details

### File Structure
```
/
├── app.py                 # Flask backend with AI integration
├── requirements.txt       # Python dependencies
├── templates/
│   ├── landing.html      # Landing page
│   └── terminal.html     # Main terminal interface
└── static/
    ├── css/
    │   ├── base.css      # Design system variables
    │   ├── landing.css   # Landing page styles
    │   └── terminal.css  # Terminal styles (responsive)
    └── js/
        ├── landing.js    # Landing page interactions
        └── terminal.js   # Terminal logic & AI chat
```

### API Endpoints

**POST /ai-chat**
- Maintains conversation context
- Extracts SQL from responses
- Generates contextual suggestions
- Returns: response, sql, suggestions, history

**POST /run**
- Executes SQL queries safely
- Returns results or row count
- Blocks dangerous operations

### Conversation History Management
```python
conversation_sessions = {
  "session_123": [
    {"role": "user", "content": "Create a table"},
    {"role": "assistant", "content": "CREATE TABLE..."},
    {"role": "user", "content": "Insert data"},
    # ... continues
  ]
}
```

## 🎓 Learning Mode

The AI is designed as both an assistant and a teacher:

**Teaching Features:**
- Explains concepts in simple terms
- Provides examples for every topic
- Suggests practice exercises
- Encourages good database practices
- Patient with beginners

**Example Teaching Interaction:**
```
You: "What's an index?"
AI: "An index is like a book's table of contents - it helps the 
    database find data faster without scanning everything.
    
    For example, if you search for users by email frequently:
    CREATE INDEX idx_email ON users(email);
    
    Would you like me to:
    - Show you when to use indexes
    - Explain different index types
    - Create an index for your table"
```

## 📱 Responsive Breakpoints

- **Desktop**: > 968px - Full split view
- **Tablet**: 768px - 968px - Adjusted proportions  
- **Mobile**: < 768px - Single column, chat-focused

## 🔐 Safety Features

1. **Query Validation**: Blocks DROP DATABASE and similar operations
2. **Safe Defaults**: LIMIT clauses suggested for large results
3. **Error Handling**: Clear error messages with guidance
4. **Session Isolation**: Each session's history is separate

## 🚧 Future Enhancements

Potential additions:
- [ ] Export results to CSV/Excel
- [ ] Query history with search
- [ ] Save favorite queries
- [ ] Database schema visualization
- [ ] Query execution plans
- [ ] Multi-database support
- [ ] Team collaboration features

## 📝 Notes

- The AI uses Google's Gemini 2.0 Flash model
- Conversation history is stored in-memory (resets on restart)
- Maximum 100 sessions kept at once
- SQL extraction uses regex pattern matching
- Mobile layout automatically detected via media queries

## 🐛 Troubleshooting

**AI not responding:**
- Check GEMINI_API_KEY in .env
- Verify API key is valid
- Check console for errors

**Database connection failed:**
- Verify MySQL is running
- Check credentials in .env
- Ensure database exists

**Mobile layout issues:**
- Clear browser cache
- Check viewport meta tag
- Test with dev tools responsive mode

## 📄 License

This project is open source and available under the MIT License.

---

Built with ❤️ using Flask, MySQL, and Google Gemini AI