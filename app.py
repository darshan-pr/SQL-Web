import os
from dotenv import load_dotenv
from flask import Flask, render_template, request, jsonify
from flask_mysqldb import MySQL
import google.generativeai as genai
import re
import json
from typing import List, Dict, Any

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
# Gemini Configuration with Function Calling
# -------------------------------------------------
try:
    genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
    # Use Gemini 2.5 Pro for better reasoning
    model = genai.GenerativeModel(
        "gemini-2.0-flash-exp",
        tools=[
            {
                "function_declarations": [
                    {
                        "name": "list_tables",
                        "description": "Get a list of all tables in the current database",
                        "parameters": {
                            "type": "object",
                            "properties": {},
                        }
                    },
                    {
                        "name": "describe_table",
                        "description": "Get the structure/schema of a specific table including columns, data types, keys, and constraints",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "table_name": {
                                    "type": "string",
                                    "description": "The name of the table to describe"
                                }
                            },
                            "required": ["table_name"]
                        }
                    },
                    {
                        "name": "get_foreign_keys",
                        "description": "Get all foreign key relationships for a specific table",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "table_name": {
                                    "type": "string",
                                    "description": "The name of the table to get foreign keys for"
                                }
                            },
                            "required": ["table_name"]
                        }
                    },
                    {
                        "name": "preview_table_data",
                        "description": "Get a preview of data from a table (up to 10 rows) to understand what data exists",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "table_name": {
                                    "type": "string",
                                    "description": "The name of the table to preview"
                                },
                                "limit": {
                                    "type": "integer",
                                    "description": "Number of rows to return (default 10, max 50)",
                                    "default": 10
                                }
                            },
                            "required": ["table_name"]
                        }
                    },
                    {
                        "name": "execute_safe_query",
                        "description": "Execute a safe SELECT query to gather information from the database. Only SELECT queries are allowed.",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "query": {
                                    "type": "string",
                                    "description": "The SELECT query to execute"
                                }
                            },
                            "required": ["query"]
                        }
                    },
                    {
                        "name": "get_table_relationships",
                        "description": "Get all relationship information between tables in the database",
                        "parameters": {
                            "type": "object",
                            "properties": {},
                        }
                    },
                    {
                        "name": "count_records",
                        "description": "Get the count of records in a table, optionally with a WHERE condition",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "table_name": {
                                    "type": "string",
                                    "description": "The name of the table"
                                },
                                "where_clause": {
                                    "type": "string",
                                    "description": "Optional WHERE clause (without the WHERE keyword)",
                                    "default": ""
                                }
                            },
                            "required": ["table_name"]
                        }
                    }
                ]
            }
        ]
    )
except Exception as e:
    print(f"Gemini configuration error: {e}")
    model = None

# Session storage for conversation history
conversation_sessions = {}

SYSTEM_PROMPT = """You are an expert MySQL database assistant with the ability to interact with the database directly.

**IMPORTANT AGENTIC BEHAVIOR:**
You have access to tools that let you inspect and query the database. ALWAYS use these tools to understand the database before generating queries for the user.

**Your workflow should be:**
1. **Understand the request** - What is the user trying to do?
2. **Gather context** - Use tools to discover:
   - What tables exist (list_tables)
   - Table structures (describe_table)
   - Relationships between tables (get_foreign_keys, get_table_relationships)
   - What data actually exists (preview_table_data, execute_safe_query)
3. **Plan your approach** - Think through the steps needed
4. **Generate accurate queries** - Based on ACTUAL schema and data
5. **Explain clearly** - Help the user understand what you're doing
6. **Remember u cannot drop or delete anything without explicit permission**

**When generating INSERT/UPDATE queries:**
- ALWAYS check what IDs/values exist first using preview_table_data or execute_safe_query
- Verify foreign key relationships exist
- Use actual data from the database in examples

**For complex queries (JOINs, subqueries):**
- First inspect all involved tables
- Check foreign key relationships
- Verify data exists before creating the query
- Explain your reasoning

**Tool usage examples:**
- User asks to create an order → Check employees table first to see which employee IDs exist
- User asks for a JOIN → Inspect both tables and their relationships first
- User asks about data → Query the database directly to give accurate answers

Be proactive in using tools. Don't guess about schema or data - CHECK IT FIRST.

Remember: You're both a helpful assistant AND a patient teacher. Show your thinking process so users learn how to approach database problems."""

# -------------------------------------------------
# Database Tool Functions
# -------------------------------------------------

def list_tables() -> Dict[str, Any]:
    """Get list of all tables in database"""
    try:
        cur = mysql.connection.cursor()
        cur.execute("SHOW TABLES")
        tables = [row[0] for row in cur.fetchall()]
        cur.close()
        return {
            "success": True,
            "tables": tables,
            "count": len(tables)
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def describe_table(table_name: str) -> Dict[str, Any]:
    """Get table structure"""
    try:
        cur = mysql.connection.cursor()
        cur.execute(f"DESCRIBE `{table_name}`")
        columns = cur.fetchall()
        
        # Format the description
        schema = []
        for col in columns:
            schema.append({
                "field": col[0],
                "type": col[1],
                "null": col[2],
                "key": col[3],
                "default": col[4],
                "extra": col[5]
            })
        
        cur.close()
        return {
            "success": True,
            "table": table_name,
            "columns": schema
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def get_foreign_keys(table_name: str) -> Dict[str, Any]:
    """Get foreign key relationships for a table"""
    try:
        cur = mysql.connection.cursor()
        query = f"""
        SELECT 
            COLUMN_NAME,
            REFERENCED_TABLE_NAME,
            REFERENCED_COLUMN_NAME,
            CONSTRAINT_NAME
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = '{app.config["MYSQL_DB"]}'
        AND TABLE_NAME = '{table_name}'
        AND REFERENCED_TABLE_NAME IS NOT NULL
        """
        cur.execute(query)
        fks = cur.fetchall()
        
        relationships = []
        for fk in fks:
            relationships.append({
                "column": fk[0],
                "references_table": fk[1],
                "references_column": fk[2],
                "constraint_name": fk[3]
            })
        
        cur.close()
        return {
            "success": True,
            "table": table_name,
            "foreign_keys": relationships
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def preview_table_data(table_name: str, limit: int = 10) -> Dict[str, Any]:
    """Get preview of table data"""
    try:
        limit = min(limit, 50)  # Cap at 50 rows
        cur = mysql.connection.cursor()
        cur.execute(f"SELECT * FROM `{table_name}` LIMIT {limit}")
        
        columns = [d[0] for d in cur.description]
        rows = cur.fetchall()
        data = [dict(zip(columns, row)) for row in rows]
        
        cur.close()
        return {
            "success": True,
            "table": table_name,
            "data": data,
            "row_count": len(data)
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def execute_safe_query(query: str) -> Dict[str, Any]:
    """Execute only SELECT queries"""
    try:
        # Safety check - only allow SELECT
        if not query.strip().upper().startswith("SELECT"):
            return {
                "success": False,
                "error": "Only SELECT queries are allowed with this tool"
            }
        
        cur = mysql.connection.cursor()
        cur.execute(query)
        
        columns = [d[0] for d in cur.description]
        rows = cur.fetchall()
        data = [dict(zip(columns, row)) for row in rows]
        
        cur.close()
        return {
            "success": True,
            "data": data,
            "row_count": len(data)
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def get_table_relationships() -> Dict[str, Any]:
    """Get all foreign key relationships in database"""
    try:
        cur = mysql.connection.cursor()
        query = f"""
        SELECT 
            TABLE_NAME,
            COLUMN_NAME,
            REFERENCED_TABLE_NAME,
            REFERENCED_COLUMN_NAME,
            CONSTRAINT_NAME
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = '{app.config["MYSQL_DB"]}'
        AND REFERENCED_TABLE_NAME IS NOT NULL
        ORDER BY TABLE_NAME, COLUMN_NAME
        """
        cur.execute(query)
        relationships = cur.fetchall()
        
        formatted_relationships = []
        for rel in relationships:
            formatted_relationships.append({
                "table": rel[0],
                "column": rel[1],
                "references_table": rel[2],
                "references_column": rel[3],
                "constraint": rel[4]
            })
        
        cur.close()
        return {
            "success": True,
            "relationships": formatted_relationships,
            "count": len(formatted_relationships)
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def count_records(table_name: str, where_clause: str = "") -> Dict[str, Any]:
    """Count records in a table"""
    try:
        cur = mysql.connection.cursor()
        query = f"SELECT COUNT(*) FROM `{table_name}`"
        if where_clause:
            query += f" WHERE {where_clause}"
        
        cur.execute(query)
        count = cur.fetchone()[0]
        
        cur.close()
        return {
            "success": True,
            "table": table_name,
            "count": count,
            "where": where_clause if where_clause else "none"
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

# Map function names to actual functions
TOOL_FUNCTIONS = {
    "list_tables": list_tables,
    "describe_table": describe_table,
    "get_foreign_keys": get_foreign_keys,
    "preview_table_data": preview_table_data,
    "execute_safe_query": execute_safe_query,
    "get_table_relationships": get_table_relationships,
    "count_records": count_records
}

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
        
        # Build conversation history for Gemini
        chat_history = []
        
        # Add system prompt as first user message
        if not conversation_sessions[session_id]:
            chat_history.append({
                "role": "user",
                "parts": [SYSTEM_PROMPT]
            })
            chat_history.append({
                "role": "model",
                "parts": ["I understand. I'm an expert MySQL assistant with database inspection capabilities. I'll use tools to understand your database before generating queries, ensuring accuracy based on actual schema and data. How can I help you today?"]
            })
        
        # Add previous conversation
        for msg in conversation_sessions[session_id]:
            role = "user" if msg["role"] == "user" else "model"
            chat_history.append({
                "role": role,
                "parts": [msg["content"]]
            })
        
        # Add current message
        current_message = messages[-1].get("content", "")
        chat_history.append({
            "role": "user",
            "parts": [current_message]
        })
        
        # Start chat with history
        chat = model.start_chat(history=chat_history[:-1])
        
        # Send message and handle function calling
        response = chat.send_message(current_message)
        
        # Track tool calls for debugging
        tool_calls = []
        iterations = 0
        max_iterations = 10  # Prevent infinite loops
        
        # Handle function calling loop
        while response.candidates[0].content.parts[0].function_call and iterations < max_iterations:
            function_call = response.candidates[0].content.parts[0].function_call
            function_name = function_call.name
            function_args = dict(function_call.args)
            
            iterations += 1
            
            # Execute the function
            if function_name in TOOL_FUNCTIONS:
                result = TOOL_FUNCTIONS[function_name](**function_args)
                tool_calls.append({
                    "function": function_name,
                    "args": function_args,
                    "result": result
                })
                
                # Send function response back to model
                response = chat.send_message(
                    genai.protos.Content(
                        parts=[genai.protos.Part(
                            function_response=genai.protos.FunctionResponse(
                                name=function_name,
                                response=result
                            )
                        )]
                    )
                )
            else:
                break
        
        # Get final response text
        response_text = response.text
        
        # Extract SQL if present
        sql_query = extract_sql_from_response(response_text)
        
        # Update session history
        conversation_sessions[session_id].append({
            "role": "user",
            "content": current_message
        })
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
            "tool_calls": tool_calls,  # For debugging
            "history": conversation_sessions[session_id]
        })
    
    except Exception as e:
        import traceback
        traceback.print_exc()
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