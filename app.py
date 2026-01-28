import os
from dotenv import load_dotenv
from flask import Flask, render_template, request, jsonify
from flask_mysqldb import MySQL
import google.generativeai as genai
import re
import json
from typing import List, Dict, Any
import traceback

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
# Gemini Configuration with Extended Thinking
# -------------------------------------------------
try:
    genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
    
    # Use Gemini 2.0 Flash for fast thinking with function calling
    model = genai.GenerativeModel(
        "gemini-2.5-pro",  # Latest thinking model
        tools=[
            {
                "function_declarations": [
                    {
                        "name": "list_tables",
                        "description": "Get a list of all tables in the current database. Use this to discover what tables exist.",
                        "parameters": {
                            "type": "object",
                            "properties": {},
                        }
                    },
                    {
                        "name": "describe_table",
                        "description": "Get the complete structure/schema of a specific table including columns, data types, keys, constraints, and indexes. Essential for understanding table structure before generating queries.",
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
                        "description": "Get all foreign key relationships for a specific table. Use this to understand how tables are related.",
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
                        "description": "Get a preview of actual data from a table (up to specified limit). Use this to see what data exists, understand data formats, and find actual IDs/values.",
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
                        "name": "execute_select_query",
                        "description": "Execute a SELECT query to retrieve specific data from the database. Use this to search for records, check if data exists, or gather information needed for your response. ONLY SELECT queries are allowed - no INSERT, UPDATE, DELETE, etc.",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "query": {
                                    "type": "string",
                                    "description": "The SELECT query to execute. Must start with SELECT."
                                },
                                "purpose": {
                                    "type": "string",
                                    "description": "Brief explanation of why you're running this query"
                                }
                            },
                            "required": ["query", "purpose"]
                        }
                    },
                    {
                        "name": "get_table_relationships",
                        "description": "Get all foreign key relationships in the entire database. Use this to understand the complete database schema and how all tables connect.",
                        "parameters": {
                            "type": "object",
                            "properties": {},
                        }
                    },
                    {
                        "name": "count_records",
                        "description": "Get the count of records in a table, optionally with a WHERE condition. Useful for checking data volume and answering 'how many' questions.",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "table_name": {
                                    "type": "string",
                                    "description": "The name of the table"
                                },
                                "where_clause": {
                                    "type": "string",
                                    "description": "Optional WHERE clause (without the WHERE keyword). Example: 'status = \"active\"'",
                                    "default": ""
                                }
                            },
                            "required": ["table_name"]
                        }
                    },
                    {
                        "name": "search_records",
                        "description": "Search for specific records in a table by name or other text fields. Returns matching records with their IDs. Very useful for finding the ID of a specific person, product, etc.",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "table_name": {
                                    "type": "string",
                                    "description": "The name of the table to search in"
                                },
                                "search_column": {
                                    "type": "string",
                                    "description": "The column name to search in (e.g., 'name', 'email', 'title')"
                                },
                                "search_value": {
                                    "type": "string",
                                    "description": "The value to search for (will use LIKE %value%)"
                                }
                            },
                            "required": ["table_name", "search_column", "search_value"]
                        }
                    }
                ]
            }
        ],
        generation_config={
            "temperature": 1,
            "top_p": 0.95,
            "top_k": 40,
            "max_output_tokens": 8192,
        }
    )
    print("✓ Gemini 2.0 Flash Thinking configured successfully")
except Exception as e:
    print(f"✗ Gemini configuration error: {e}")
    model = None

# Session storage for conversation history
conversation_sessions = {}

SYSTEM_PROMPT = """You are an expert MySQL database assistant with DIRECT ACCESS to the database through tools.

**CRITICAL AGENTIC BEHAVIOR - YOU MUST FOLLOW THIS:**

🔍 **ALWAYS INSPECT BEFORE GENERATING**
Before creating ANY query (especially INSERT, UPDATE, or complex SELECT), you MUST:
1. Call list_tables() if you don't know what tables exist
2. Call describe_table() to see the exact column names and types
3. Call preview_table_data() or search_records() to find actual IDs and values
4. Call get_foreign_keys() to understand relationships

🎯 **YOUR WORKFLOW FOR EVERY REQUEST:**

**For "show me tables" / "what tables exist":**
→ Call list_tables()
→ Optionally call get_table_relationships() to show connections
→ Present results clearly

**For "describe table X" / "show structure of X":**
→ Call describe_table(X)
→ Optionally call get_foreign_keys(X)
→ Present structure clearly

**For "insert data into orders for John" or similar:**
Step 1: Call describe_table('orders') → Learn required columns
Step 2: Call search_records('employees', 'name', 'John') → Find John's ID
Step 3: Call describe_table('employees') if needed → Verify columns
Step 4: Generate INSERT with ACTUAL IDs from step 2
Step 5: Explain what you found and what the INSERT does

**For "show me orders with customer names" (JOIN queries):**
Step 1: Call describe_table('orders')
Step 2: Call get_foreign_keys('orders') → See relationships
Step 3: Call describe_table('customers')
Step 4: Call preview_table_data('orders', 5) → Verify data exists
Step 5: Generate accurate JOIN based on actual schema

**For "how many X" questions:**
→ Call count_records(table, optional_where)
→ Or execute_select_query() with COUNT(*)
→ Give the actual number

**For data existence checks:**
→ Use search_records() to find specific records
→ Or execute_select_query() with WHERE clause
→ Confirm what exists before proceeding

🚫 **NEVER DO THIS:**
- ❌ Generate INSERT/UPDATE without checking what IDs exist
- ❌ Assume table structure - always call describe_table()
- ❌ Guess at foreign key values - always search for them
- ❌ Create queries without verifying the schema
- ❌ Say "I don't have access to your database" - YOU DO via tools!

✅ **ALWAYS DO THIS:**
- ✓ Use tools proactively to gather information
- ✓ Search for IDs before using them in queries
- ✓ Verify table structures before generating queries
- ✓ Check that data exists before assuming it does
- ✓ Show your reasoning process
- ✓ Explain what you discovered

🎓 **TEACHING MODE:**
When explaining, mention:
- What tools you used and why
- What you discovered from the database
- How the query works
- Best practices and alternatives

Remember: You're not just generating SQL - you're actively exploring the database to create ACCURATE, WORKING queries based on REAL data!"""

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
            "count": len(tables),
            "message": f"Found {len(tables)} tables in database"
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
            "columns": schema,
            "column_count": len(schema),
            "message": f"Table '{table_name}' has {len(schema)} columns"
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
            "foreign_keys": relationships,
            "count": len(relationships),
            "message": f"Found {len(relationships)} foreign key(s) in '{table_name}'"
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def preview_table_data(table_name: str, limit: int = 10) -> Dict[str, Any]:
    """Get preview of table data"""
    try:
        limit = min(max(1, limit), 50)  # Between 1 and 50
        cur = mysql.connection.cursor()
        cur.execute(f"SELECT * FROM `{table_name}` LIMIT {limit}")
        
        columns = [d[0] for d in cur.description]
        rows = cur.fetchall()
        data = [dict(zip(columns, row)) for row in rows]
        
        cur.close()
        return {
            "success": True,
            "table": table_name,
            "columns": columns,
            "data": data,
            "row_count": len(data),
            "message": f"Retrieved {len(data)} rows from '{table_name}'"
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def execute_select_query(query: str, purpose: str = "") -> Dict[str, Any]:
    """Execute only SELECT queries - AI can run queries autonomously"""
    try:
        # Safety check - only allow SELECT, SHOW, DESCRIBE
        query_upper = query.strip().upper()
        if not query_upper.startswith("SELECT") and not query_upper.startswith("SHOW") and not query_upper.startswith("DESCRIBE"):
            return {
                "success": False,
                "error": "Only SELECT, SHOW, and DESCRIBE queries are allowed with this tool"
            }
        
        cur = mysql.connection.cursor()
        cur.execute(query)
        
        columns = [d[0] for d in cur.description] if cur.description else []
        rows = cur.fetchall()
        data = [dict(zip(columns, row)) for row in rows] if columns else []
        
        cur.close()
        return {
            "success": True,
            "query": query,
            "purpose": purpose,
            "columns": columns,
            "data": data,
            "row_count": len(data),
            "message": f"Query executed successfully, returned {len(data)} rows"
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "query": query
        }

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
            "count": len(formatted_relationships),
            "message": f"Found {len(formatted_relationships)} foreign key relationship(s)"
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
            "where": where_clause if where_clause else "none",
            "message": f"Found {count} record(s) in '{table_name}'" + (f" where {where_clause}" if where_clause else "")
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def search_records(table_name: str, search_column: str, search_value: str) -> Dict[str, Any]:
    """Search for records by name or other text field"""
    try:
        cur = mysql.connection.cursor()
        # Use parameterized query for safety
        query = f"SELECT * FROM `{table_name}` WHERE `{search_column}` LIKE %s LIMIT 10"
        cur.execute(query, (f"%{search_value}%",))
        
        columns = [d[0] for d in cur.description]
        rows = cur.fetchall()
        data = [dict(zip(columns, row)) for row in rows]
        
        cur.close()
        return {
            "success": True,
            "table": table_name,
            "search_column": search_column,
            "search_value": search_value,
            "data": data,
            "found_count": len(data),
            "message": f"Found {len(data)} record(s) matching '{search_value}' in {search_column}"
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

# Map function names to actual functions
TOOL_FUNCTIONS = {
    "list_tables": list_tables,
    "describe_table": describe_table,
    "get_foreign_keys": get_foreign_keys,
    "preview_table_data": preview_table_data,
    "execute_select_query": execute_select_query,
    "get_table_relationships": get_table_relationships,
    "count_records": count_records,
    "search_records": search_records
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
                "parts": ["Understood! I'm your expert MySQL assistant with direct database access through tools. I'll ALWAYS inspect your database before generating queries to ensure accuracy. I can see your tables, check their structures, search for IDs, and verify data exists. Let's work together! What would you like to do?"]
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
        
        print(f"\n{'='*60}")
        print(f"🤖 AI Agent Processing: {current_message[:100]}...")
        print(f"{'='*60}")
        
        # Start chat with history
        chat = model.start_chat(history=chat_history[:-1])
        
        # Send message and handle function calling
        response = chat.send_message(current_message)
        
        # Track tool calls for debugging and UI visualization
        tool_calls = []
        iterations = 0
        max_iterations = 15  # Allow more iterations for complex reasoning
        
        # Handle function calling loop
        while iterations < max_iterations:
            # Check if there are function calls in the response
            parts = response.candidates[0].content.parts
            function_calls_in_response = [p for p in parts if hasattr(p, 'function_call') and p.function_call]
            
            if not function_calls_in_response:
                break
                
            iterations += 1
            print(f"\n🔧 Iteration {iterations}: Processing {len(function_calls_in_response)} tool call(s)")
            
            # Process all function calls in this response
            function_responses = []
            
            for part in function_calls_in_response:
                function_call = part.function_call
                function_name = function_call.name
                function_args = dict(function_call.args)
                
                print(f"   └─ Calling: {function_name}({json.dumps(function_args, default=str)})")
                
                # Execute the function
                if function_name in TOOL_FUNCTIONS:
                    result = TOOL_FUNCTIONS[function_name](**function_args)
                    tool_calls.append({
                        "function": function_name,
                        "args": function_args,
                        "result": result,
                        "iteration": iterations
                    })
                    
                    print(f"   └─ Result: {result.get('message', result.get('success', 'completed'))}")
                    
                    # Create function response
                    function_responses.append(
                        genai.protos.Part(
                            function_response=genai.protos.FunctionResponse(
                                name=function_name,
                                response=result
                            )
                        )
                    )
                else:
                    print(f"   └─ ⚠️  Unknown function: {function_name}")
            
            # Send all function responses back to model
            if function_responses:
                response = chat.send_message(
                    genai.protos.Content(parts=function_responses)
                )
        
        print(f"\n✓ Agent completed after {iterations} iteration(s)")
        print(f"✓ Total tool calls: {len(tool_calls)}")
        print(f"{'='*60}\n")
        
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
            "tool_calls": tool_calls,
            "iterations": iterations,
            "history": conversation_sessions[session_id]
        })
    
    except Exception as e:
        print(f"\n❌ Error in AI chat:")
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
    """User-initiated query execution (not AI)"""
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
    print("\n" + "="*60)
    print("🚀 SQL Terminal Pro - Agentic AI Edition")
    print("="*60)
    print("✓ Flask server starting...")
    print("✓ Agentic AI with autonomous query execution enabled")
    print("✓ Gemini 2.0 Flash Thinking mode active")
    print("="*60 + "\n")
    app.run(host="0.0.0.0", port=5000, debug=True)