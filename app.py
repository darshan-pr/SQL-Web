import os
from dotenv import load_dotenv
from flask import Flask, render_template, request, jsonify
from flask_mysqldb import MySQL

import google.generativeai as genai
import re
import json
from typing import List, Dict, Any
import traceback
from decimal import Decimal
from datetime import date, datetime

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
# Custom JSON Encoder for MySQL Data Types
# -------------------------------------------------
class CustomJSONEncoder(json.JSONEncoder):
    """Custom JSON encoder that handles MySQL data types"""
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        elif isinstance(obj, (date, datetime)):
            return obj.isoformat()
        elif isinstance(obj, bytes):
            return obj.decode('utf-8', errors='replace')
        return super().default(obj)

app.json_encoder = CustomJSONEncoder

def safe_json_serialize(data):
    """Safely serialize data to JSON-compatible format"""
    if isinstance(data, dict):
        return {k: safe_json_serialize(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [safe_json_serialize(item) for item in data]
    elif isinstance(data, Decimal):
        return float(data)
    elif isinstance(data, (date, datetime)):
        return data.isoformat()
    elif isinstance(data, bytes):
        return data.decode('utf-8', errors='replace')
    else:
        return data

# -------------------------------------------------
# Gemini Configuration with Function Calling
# -------------------------------------------------
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    print("⚠️  WARNING: GEMINI_API_KEY not found in environment variables!")
    print("⚠️  AI features will not work until you set the API key.")
    model = None
else:
    try:
        genai.configure(api_key=GEMINI_API_KEY)
        
        # Define function declarations for the AI
        list_tables_func = genai.protos.FunctionDeclaration(
            name='list_tables',
            description='Get a list of all tables in the current database. Use this to discover what tables exist.',
            parameters=genai.protos.Schema(
                type=genai.protos.Type.OBJECT,
                properties={}
            )
        )
        
        describe_table_func = genai.protos.FunctionDeclaration(
            name='describe_table',
            description='Get the complete structure/schema of a specific table including columns, data types, keys, constraints, and indexes.',
            parameters=genai.protos.Schema(
                type=genai.protos.Type.OBJECT,
                properties={
                    'table_name': genai.protos.Schema(
                        type=genai.protos.Type.STRING,
                        description='The name of the table to describe'
                    )
                },
                required=['table_name']
            )
        )
        
        get_foreign_keys_func = genai.protos.FunctionDeclaration(
            name='get_foreign_keys',
            description='Get all foreign key relationships for a specific table.',
            parameters=genai.protos.Schema(
                type=genai.protos.Type.OBJECT,
                properties={
                    'table_name': genai.protos.Schema(
                        type=genai.protos.Type.STRING,
                        description='The name of the table to get foreign keys for'
                    )
                },
                required=['table_name']
            )
        )
        
        preview_table_data_func = genai.protos.FunctionDeclaration(
            name='preview_table_data',
            description='Get a preview of actual data from a table. Default shows 5 rows, max 50 rows. Use this to see sample records.',
            parameters=genai.protos.Schema(
                type=genai.protos.Type.OBJECT,
                properties={
                    'table_name': genai.protos.Schema(
                        type=genai.protos.Type.STRING,
                        description='The name of the table to preview'
                    ),
                    'limit': genai.protos.Schema(
                        type=genai.protos.Type.INTEGER,
                        description='Number of rows to return (default 5, max 50)'
                    )
                },
                required=['table_name']
            )
        )
        
        execute_select_query_func = genai.protos.FunctionDeclaration(
            name='execute_select_query',
            description='Execute a SELECT query to retrieve specific data. ONLY SELECT queries allowed. Automatically limited to 100 rows for safety.',
            parameters=genai.protos.Schema(
                type=genai.protos.Type.OBJECT,
                properties={
                    'query': genai.protos.Schema(
                        type=genai.protos.Type.STRING,
                        description='The SELECT query to execute'
                    ),
                    'purpose': genai.protos.Schema(
                        type=genai.protos.Type.STRING,
                        description='Brief explanation of why you\'re running this query'
                    )
                },
                required=['query', 'purpose']
            )
        )
        
        get_table_relationships_func = genai.protos.FunctionDeclaration(
            name='get_table_relationships',
            description='Get all foreign key relationships in the entire database. Shows how tables are connected.',
            parameters=genai.protos.Schema(
                type=genai.protos.Type.OBJECT,
                properties={}
            )
        )
        
        count_records_func = genai.protos.FunctionDeclaration(
            name='count_records',
            description='Get the count of records in a table, optionally with a WHERE condition.',
            parameters=genai.protos.Schema(
                type=genai.protos.Type.OBJECT,
                properties={
                    'table_name': genai.protos.Schema(
                        type=genai.protos.Type.STRING,
                        description='The name of the table'
                    ),
                    'where_clause': genai.protos.Schema(
                        type=genai.protos.Type.STRING,
                        description='Optional WHERE clause (without the WHERE keyword)'
                    )
                },
                required=['table_name']
            )
        )
        
        search_records_func = genai.protos.FunctionDeclaration(
            name='search_records',
            description='Search for specific records in a table by name or other text fields. Returns up to 20 matching records.',
            parameters=genai.protos.Schema(
                type=genai.protos.Type.OBJECT,
                properties={
                    'table_name': genai.protos.Schema(
                        type=genai.protos.Type.STRING,
                        description='The name of the table to search in'
                    ),
                    'search_column': genai.protos.Schema(
                        type=genai.protos.Type.STRING,
                        description='The column name to search in'
                    ),
                    'search_value': genai.protos.Schema(
                        type=genai.protos.Type.STRING,
                        description='The value to search for'
                    )
                },
                required=['table_name', 'search_column', 'search_value']
            )
        )
        
        # Create tool with all function declarations
        sql_tool = genai.protos.Tool(
            function_declarations=[
                list_tables_func,
                describe_table_func,
                get_foreign_keys_func,
                preview_table_data_func,
                execute_select_query_func,
                get_table_relationships_func,
                count_records_func,
                search_records_func
            ]
        )
        
        # Initialize the model with tools - using standard model for better compatibility
        model = genai.GenerativeModel(
            'gemini-2.5-pro',  # Using stable model
            tools=[sql_tool],
            generation_config={
                "temperature": 0.7,
                "top_p": 0.95,
                "top_k": 40,
                "max_output_tokens": 8192,
            },
            system_instruction="""You are an expert SQL database assistant with access to database tools. You help users understand and interact with their database.

CRITICAL RULES:
1. ALWAYS use your tools to answer questions - don't guess!
2. When users ask about tables, use list_tables() immediately
3. When users ask to see records, use preview_table_data() with limit=5
4. When users ask about table structure, use describe_table()
5. Explain what you're doing before calling tools
6. Be conversational and helpful

IMPORTANT:
- Default to 5 rows when previewing data
- All dates and decimals will be properly formatted
- If you can't modify the database (INSERT/UPDATE/DELETE/CREATE), offer to write the SQL for them
- Always check what actually exists before answering

RESPONSE FORMAT:
- Briefly explain what you'll do
- Call the appropriate tools
- Provide clear, actionable results
- Offer to help with follow-up questions"""
        )
        
        print("✓ Gemini AI configured successfully!")
        print(f"✓ Using model: gemini-1.5-pro")
        
    except Exception as e:
        print(f"❌ Failed to configure Gemini AI: {e}")
        traceback.print_exc()
        model = None

# -------------------------------------------------
# Conversation Session Storage
# -------------------------------------------------
conversation_sessions = {}

# -------------------------------------------------
# Database Tool Functions with JSON Serialization
# -------------------------------------------------

def tool_list_tables():
    """Get all tables in the database"""
    try:
        cur = mysql.connection.cursor()
        cur.execute("SHOW TABLES")
        tables = [row[0] for row in cur.fetchall()]
        cur.close()
        
        result = {
            "success": True,
            "tables": tables,
            "count": len(tables),
            "message": f"Found {len(tables)} tables in the database"
        }
        return safe_json_serialize(result)
    except Exception as e:
        return {"success": False, "error": str(e)}

def tool_describe_table(table_name: str):
    """Get table structure"""
    try:
        cur = mysql.connection.cursor()
        cur.execute(f"DESCRIBE `{table_name}`")
        columns = []
        
        for row in cur.fetchall():
            columns.append({
                "field": row[0],
                "type": row[1],
                "null": row[2],
                "key": row[3],
                "default": str(row[4]) if row[4] is not None else None,
                "extra": row[5]
            })
        
        cur.close()
        
        result = {
            "success": True,
            "table": table_name,
            "columns": columns,
            "column_count": len(columns),
            "message": f"Table '{table_name}' has {len(columns)} columns"
        }
        return safe_json_serialize(result)
    except Exception as e:
        return {"success": False, "error": str(e)}

def tool_get_foreign_keys(table_name: str):
    """Get foreign keys for a table"""
    try:
        cur = mysql.connection.cursor()
        query = f"""
        SELECT 
            COLUMN_NAME,
            REFERENCED_TABLE_NAME,
            REFERENCED_COLUMN_NAME
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = '{table_name}'
        AND REFERENCED_TABLE_NAME IS NOT NULL
        """
        cur.execute(query)
        
        foreign_keys = []
        for row in cur.fetchall():
            foreign_keys.append({
                "column": row[0],
                "references_table": row[1],
                "references_column": row[2]
            })
        
        cur.close()
        
        result = {
            "success": True,
            "table": table_name,
            "foreign_keys": foreign_keys,
            "count": len(foreign_keys),
            "message": f"Found {len(foreign_keys)} foreign keys in '{table_name}'"
        }
        return safe_json_serialize(result)
    except Exception as e:
        return {"success": False, "error": str(e)}

def tool_preview_table_data(table_name: str, limit: int = 5):
    """Preview table data - default 5 rows"""
    try:
        # Default to 5, clamp between 1 and 50
        if limit is None:
            limit = 5
        limit = min(max(1, int(limit)), 50)
        
        cur = mysql.connection.cursor()
        cur.execute(f"SELECT * FROM `{table_name}` LIMIT {limit}")
        
        columns = [d[0] for d in cur.description]
        rows = cur.fetchall()
        
        # Convert rows to dictionaries with safe serialization
        data = []
        for row in rows:
            row_dict = {}
            for col, val in zip(columns, row):
                row_dict[col] = safe_json_serialize(val)
            data.append(row_dict)
        
        cur.close()
        
        result = {
            "success": True,
            "table": table_name,
            "data": data,
            "row_count": len(data),
            "limit": limit,
            "columns": columns,
            "message": f"Retrieved {len(data)} rows from '{table_name}'"
        }
        return safe_json_serialize(result)
    except Exception as e:
        return {"success": False, "error": str(e)}

def tool_execute_select_query(query: str, purpose: str):
    """Execute a SELECT query with automatic LIMIT"""
    try:
        # Safety check
        query_upper = query.strip().upper()
        if not query_upper.startswith("SELECT"):
            return {
                "success": False,
                "error": "Only SELECT queries are allowed for safety"
            }
        
        # Add LIMIT if not present (for safety)
        if "LIMIT" not in query_upper:
            query = query.rstrip(';') + " LIMIT 100"
        
        cur = mysql.connection.cursor()
        cur.execute(query)
        
        columns = [d[0] for d in cur.description] if cur.description else []
        rows = cur.fetchall()
        
        # Convert rows to dictionaries with safe serialization
        data = []
        for row in rows:
            row_dict = {}
            for col, val in zip(columns, row):
                row_dict[col] = safe_json_serialize(val)
            data.append(row_dict)
        
        cur.close()
        
        result = {
            "success": True,
            "purpose": purpose,
            "query": query,
            "data": data,
            "row_count": len(data),
            "columns": columns,
            "message": f"Query executed successfully. Retrieved {len(data)} rows."
        }
        return safe_json_serialize(result)
    except Exception as e:
        return {"success": False, "error": str(e)}

def tool_get_table_relationships():
    """Get all table relationships"""
    try:
        cur = mysql.connection.cursor()
        query = """
        SELECT 
            TABLE_NAME,
            COLUMN_NAME,
            REFERENCED_TABLE_NAME,
            REFERENCED_COLUMN_NAME
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
        AND REFERENCED_TABLE_NAME IS NOT NULL
        """
        cur.execute(query)
        
        relationships = []
        for row in cur.fetchall():
            relationships.append({
                "from_table": row[0],
                "from_column": row[1],
                "to_table": row[2],
                "to_column": row[3]
            })
        
        cur.close()
        
        result = {
            "success": True,
            "relationships": relationships,
            "count": len(relationships),
            "message": f"Found {len(relationships)} foreign key relationships"
        }
        return safe_json_serialize(result)
    except Exception as e:
        return {"success": False, "error": str(e)}

def tool_count_records(table_name: str, where_clause: str = ""):
    """Count records in a table"""
    try:
        cur = mysql.connection.cursor()
        
        if where_clause:
            query = f"SELECT COUNT(*) FROM `{table_name}` WHERE {where_clause}"
        else:
            query = f"SELECT COUNT(*) FROM `{table_name}`"
        
        cur.execute(query)
        count = cur.fetchone()[0]
        cur.close()
        
        result = {
            "success": True,
            "table": table_name,
            "count": int(count),
            "where": where_clause if where_clause else None,
            "message": f"Table '{table_name}' has {count} records"
        }
        return safe_json_serialize(result)
    except Exception as e:
        return {"success": False, "error": str(e)}

def tool_search_records(table_name: str, search_column: str, search_value: str):
    """Search for records"""
    try:
        cur = mysql.connection.cursor()
        query = f"SELECT * FROM `{table_name}` WHERE `{search_column}` LIKE %s LIMIT 20"
        cur.execute(query, (f"%{search_value}%",))
        
        columns = [d[0] for d in cur.description]
        rows = cur.fetchall()
        
        # Convert rows to dictionaries with safe serialization
        data = []
        for row in rows:
            row_dict = {}
            for col, val in zip(columns, row):
                row_dict[col] = safe_json_serialize(val)
            data.append(row_dict)
        
        cur.close()
        
        result = {
            "success": True,
            "table": table_name,
            "search_column": search_column,
            "search_value": search_value,
            "data": data,
            "found": len(data),
            "message": f"Found {len(data)} matching records"
        }
        return safe_json_serialize(result)
    except Exception as e:
        return {"success": False, "error": str(e)}

# -------------------------------------------------
# Routes
# -------------------------------------------------

@app.route("/")
def index():
    return render_template("landing.html")

@app.route("/terminal")
def terminal():
    return render_template("terminal.html")

def find_function_call_in_parts(parts):
    """Helper to find function call in response parts"""
    for part in parts:
        if hasattr(part, 'function_call') and part.function_call:
            return part.function_call
    return None

@app.route("/ai-chat", methods=["POST"])
def ai_chat():
    """
    AI Chat endpoint with robust function calling support
    """
    if model is None:
        return jsonify({
            "success": False,
            "error": "Gemini AI is not configured. Please check your API key."
        }), 500
    
    try:
        data = request.json
        messages = data.get("messages", [])
        session_id = data.get("sessionId", "default")
        
        if not messages:
            return jsonify({
                "success": False,
                "error": "No messages provided"
            }), 400
        
        # Get or create conversation session
        if session_id not in conversation_sessions:
            conversation_sessions[session_id] = []
        
        # Get current message
        current_message = messages[-1]["content"]
        
        # Build conversation history for Gemini
        history = []
        for msg in conversation_sessions[session_id]:
            role = "user" if msg["role"] == "user" else "model"
            history.append({
                "role": role,
                "parts": [msg["content"]]
            })
        
        print(f"\n{'='*60}")
        print(f"🤖 AI CHAT REQUEST")
        print(f"📝 Message: {current_message[:100]}...")
        print(f"💬 Session: {session_id}")
        print(f"📚 History length: {len(history)}")
        print(f"{'='*60}\n")
        
        # Start chat session with history
        chat = model.start_chat(history=history)
        
        # Send message and handle function calling
        response = chat.send_message(current_message)
        
        # Track tool calls and thinking for transparency
        tool_calls = []
        thinking_steps = []
        max_iterations = 15
        iterations = 0
        
        # Handle function calls robustly
        while iterations < max_iterations:
            # Check if response has function call
            function_call = None
            
            try:
                if response.candidates and len(response.candidates) > 0:
                    candidate = response.candidates[0]
                    if candidate.content and candidate.content.parts:
                        function_call = find_function_call_in_parts(candidate.content.parts)
                
                if not function_call:
                    # No more function calls, break the loop
                    break
                
                iterations += 1
                function_name = function_call.name
                function_args = dict(function_call.args) if function_call.args else {}
                
                print(f"\n🔧 Tool Call #{iterations}: {function_name}")
                print(f"📋 Args: {json.dumps(function_args, indent=2)}")
                
                # Add thinking step for tool call
                thinking_steps.append({
                    "step": len(thinking_steps) + 1,
                    "action": f"Using tool: {function_name}",
                    "args": function_args
                })
                
                # Execute the function
                result = None
                try:
                    if function_name == "list_tables":
                        result = tool_list_tables()
                    elif function_name == "describe_table":
                        result = tool_describe_table(**function_args)
                    elif function_name == "get_foreign_keys":
                        result = tool_get_foreign_keys(**function_args)
                    elif function_name == "preview_table_data":
                        result = tool_preview_table_data(**function_args)
                    elif function_name == "execute_select_query":
                        result = tool_execute_select_query(**function_args)
                    elif function_name == "get_table_relationships":
                        result = tool_get_table_relationships()
                    elif function_name == "count_records":
                        result = tool_count_records(**function_args)
                    elif function_name == "search_records":
                        result = tool_search_records(**function_args)
                    else:
                        result = {"success": False, "error": f"Unknown function: {function_name}"}
                except Exception as func_error:
                    print(f"❌ Error executing function: {func_error}")
                    result = {"success": False, "error": f"Function execution error: {str(func_error)}"}
                
                print(f"✓ Result: {str(result)[:200]}...")
                
                # Track tool call with serialized result
                tool_calls.append({
                    "function": function_name,
                    "args": function_args,
                    "result": safe_json_serialize(result)
                })
                
                # Send function response back to model
                try:
                    response = chat.send_message(
                        genai.protos.Content(
                            parts=[genai.protos.Part(
                                function_response=genai.protos.FunctionResponse(
                                    name=function_name,
                                    response=safe_json_serialize(result)
                                )
                            )]
                        )
                    )
                except Exception as response_error:
                    print(f"❌ Error sending function response: {response_error}")
                    break
                    
            except Exception as e:
                print(f"❌ Error in function call loop: {e}")
                traceback.print_exc()
                break
        
        print(f"\n✓ Chat completed after {iterations} tool call(s)")
        print(f"{'='*60}\n")
        
        # Get final response text
        response_text = ""
        try:
            response_text = response.text
        except Exception as e:
            print(f"⚠️  Could not extract response text: {e}")
            # Try to extract from parts
            if response.candidates and len(response.candidates) > 0:
                for part in response.candidates[0].content.parts:
                    if hasattr(part, 'text') and part.text:
                        response_text += part.text
        
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
            "thinking": thinking_steps,
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
    """User-initiated query execution with JSON serialization"""
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
            
            # Convert rows with safe serialization
            data = []
            for row in rows:
                row_dict = {}
                for col, val in zip(columns, row):
                    row_dict[col] = safe_json_serialize(val)
                data.append(row_dict)
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
    print("🚀 SQL Terminal Pro - AI Edition (ROBUST)")
    print("="*60)
    print("✓ Flask server starting...")
    if model:
        print("✓ AI Assistant enabled with function calling")
        print("✓ Using Gemini 1.5 Pro for maximum reliability")
        print("✓ Enhanced error handling and JSON serialization")
    else:
        print("⚠️  AI Assistant disabled - check API key")
    print("="*60 + "\n")
    app.run(host="0.0.0.0", port=5000, debug=True)