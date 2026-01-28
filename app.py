import os
from dotenv import load_dotenv
from flask import Flask, render_template, request, jsonify
from flask_mysqldb import MySQL
import google.generativeai as genai
import re

# -------------------------------------------------
# Load environment variables
# -------------------------------------------------
load_dotenv()

app = Flask(__name__)

# -------------------------------------------------
# Optional secret key (ONLY if provided)
# -------------------------------------------------
secret_key = os.getenv("SECRET_KEY")
if secret_key:
    app.secret_key = secret_key

# -------------------------------------------------
# MySQL Configuration
# -------------------------------------------------
app.config["MYSQL_HOST"] = os.getenv("MYSQL_HOST")
app.config["MYSQL_USER"] = os.getenv("MYSQL_USER")
app.config["MYSQL_PASSWORD"] = os.getenv("MYSQL_PASSWORD")
app.config["MYSQL_DB"] = os.getenv("MYSQL_DB")

mysql = MySQL(app)

# -------------------------------------------------
# Gemini Configuration
# -------------------------------------------------
try:
    genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
    model = genai.GenerativeModel("gemini-2.5-flash")
except Exception as e:
    print(f"Gemini configuration error: {e}")
    model = None

# Session storage for conversation history
conversation_sessions = {}

SYSTEM_PROMPT = """You are an expert MySQL database assistant and SQL teacher.

Your role:
1. Help users write, understand, and optimize SQL queries
2. Explain database concepts in a clear, educational way in concise responses
3. Remember context from previous messages in the conversation
4. Provide practical examples and suggestions
5. Be encouraging and supportive for learners
6. if user interacts with casual conversation, respond in friendly manner don't striclty limit to SQL only

When generating SQL:
- Write safe, optimized MySQL queries
- NEVER generate DROP DATABASE or destructive operations without explicit user request
- Include comments to explain complex parts
- Suggest best practices
- If user ask to be in simple terms, explain concepts in an easy-to-understand way in consize responses

When responding:
- If the user asks for a query, provide it in a ```sql code block
- Explain what the query does in consize way
- Suggest what they might want to do next
- If appropriate, teach them about the concepts involved

Remember: You're both a helpful assistant AND a patient teacher. Help users learn while solving their problems."""

# -------------------------------------------------
# Routes
# -------------------------------------------------

@app.route("/")
def landing():
    return render_template("landing.html")

@app.route("/terminal")
def terminal():
    return render_template("terminal.html")

@app.route("/ai-chat", methods=["POST"])
def ai_chat():
    try:
        if not model:
            return jsonify({
                "success": False, 
                "error": "Gemini AI is not configured. Please check your API key."
            }), 500
        
        data = request.json
        messages = data.get("messages", [])
        session_id = data.get("sessionId", "default")
        
        if not messages:
            return jsonify({"success": False, "error": "No messages provided"}), 400
        
        # Get or create session history
        if session_id not in conversation_sessions:
            conversation_sessions[session_id] = []
        
        # Build the full conversation context
        conversation_context = SYSTEM_PROMPT + "\n\n"
        
        # Add previous conversation history
        for msg in messages[:-1]:  # All except the last message
            role = msg.get("role", "user")
            content = msg.get("content", "")
            conversation_context += f"\n{role.upper()}: {content}\n"
        
        # Add the current user message
        current_message = messages[-1].get("content", "")
        conversation_context += f"\nUSER: {current_message}\n\nASSISTANT:"
        
        # Generate response
        response = model.generate_content(conversation_context)
        response_text = response.text
        
        # Extract SQL if present
        sql_query = extract_sql_from_response(response_text)
        
        # Generate contextual suggestions
        suggestions = generate_suggestions(current_message, response_text, sql_query)
        
        # Update session history
        conversation_sessions[session_id] = messages
        conversation_sessions[session_id].append({
            "role": "assistant",
            "content": response_text
        })
        
        # Clean up old sessions (keep last 100)
        if len(conversation_sessions) > 100:
            oldest_key = min(conversation_sessions.keys())
            del conversation_sessions[oldest_key]
        
        return jsonify({
            "success": True,
            "response": response_text,
            "sql": sql_query,
            "suggestions": suggestions,
            "history": conversation_sessions[session_id]
        })
    
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

def extract_sql_from_response(text):
    """Extract SQL query from markdown code blocks"""
    # Try to find SQL code block
    sql_pattern = r"```sql\n(.*?)```"
    match = re.search(sql_pattern, text, re.DOTALL | re.IGNORECASE)
    
    if match:
        return match.group(1).strip()
    
    # Try to find any code block
    code_pattern = r"```\n(.*?)```"
    match = re.search(code_pattern, text, re.DOTALL)
    
    if match:
        code = match.group(1).strip()
        # Check if it looks like SQL
        if any(keyword in code.upper() for keyword in ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP']):
            return code
    
    return None

def generate_suggestions(user_message, response, sql_query):
    """Generate contextual suggestions for next steps"""
    suggestions = []
    lower_message = user_message.lower()
    
    # Based on user intent
    if 'create' in lower_message and 'table' in lower_message:
        suggestions.extend([
            "Show me the table structure",
            "Insert sample data into this table",
            "Create an index for better performance"
        ])
    elif 'select' in lower_message or sql_query and sql_query.upper().startswith('SELECT'):
        suggestions.extend([
            "How can I optimize this query?",
            "Add pagination to this query",
            "Explain the execution plan"
        ])
    elif 'join' in lower_message:
        suggestions.extend([
            "What's the difference between INNER and LEFT JOIN?",
            "Show me a complex multi-table JOIN example",
            "How do I optimize JOIN queries?"
        ])
    elif 'index' in lower_message:
        suggestions.extend([
            "When should I use indexes?",
            "Show me how to analyze index usage",
            "What are composite indexes?"
        ])
    else:
        # Generic helpful suggestions
        suggestions.extend([
            "Explain database normalization",
            "Show me query optimization techniques",
            "Help me with a complex JOIN query",
            "Teach me about transactions"
        ])
    
    # Return top 4 suggestions
    return suggestions[:4]

@app.route("/run", methods=["POST"])
def run_query():
    query = request.json.get("query", "").strip()

    if not query:
        return jsonify({"success": False, "error": "Empty query."})

    # Safety layer
    blocked = [
        "drop database",
        "truncate database"
    ]
    if any(word in query.lower() for word in blocked):
        return jsonify({"success": False, "error": "Dangerous query blocked for safety."})

    try:
        cur = mysql.connection.cursor()
        cur.execute(query)

        if query.lower().startswith("select") or query.lower().startswith("show") or query.lower().startswith("describe"):
            columns = [d[0] for d in cur.description]
            rows = cur.fetchall()
            data = [dict(zip(columns, row)) for row in rows]
        else:
            mysql.connection.commit()
            data = f"Query executed successfully. Rows affected: {cur.rowcount}"

        cur.close()
        return jsonify({"success": True, "data": data})

    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

# -------------------------------------------------
# App Entry
# -------------------------------------------------
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
