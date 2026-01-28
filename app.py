import os
from dotenv import load_dotenv
from flask import Flask, render_template, request, jsonify
from flask_mysqldb import MySQL
import google.generativeai as genai

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
# Gemini Configuration - Using Latest Model
# -------------------------------------------------
try:
    genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
    model = genai.GenerativeModel("gemini-2.5-flash")
except Exception as e:
    print(f"Gemini configuration error: {e}")
    model = None

SYSTEM_PROMPT = """
You are an expert MySQL database assistant.

Rules:
1. Convert natural language into SAFE MySQL queries.
2. NEVER generate DROP DATABASE or destructive queries.
3. Prefer SELECT queries.
4. If modifying data, keep it minimal and safe.
5. Optimize queries when possible.
6. Return ONLY SQL, no explanation.
"""

# -------------------------------------------------
# Routes
# -------------------------------------------------

@app.route("/")
def landing():
    return render_template("landing.html")

@app.route("/terminal")
def terminal():
    return render_template("terminal.html")

@app.route("/ai-query", methods=["POST"])
def ai_query():
    try:
        if not model:
            return jsonify({"success": False, "error": "Gemini AI is not configured. Please check your API key."}), 500
        
        user_message = request.json.get("message", "").strip()

        if not user_message:
            return jsonify({"success": False, "error": "Empty message"}), 400

        prompt = f"{SYSTEM_PROMPT}\nUser: {user_message}"
        response = model.generate_content(prompt)

        sql = response.text.replace("```sql", "").replace("```", "").strip()
        return jsonify({"success": True, "sql": sql})
    
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

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
        return jsonify({"success": False, "error": "Dangerous query blocked."})

    try:
        cur = mysql.connection.cursor()
        cur.execute(query)

        if query.lower().startswith("select"):
            columns = [d[0] for d in cur.description]
            rows = cur.fetchall()
            data = [dict(zip(columns, row)) for row in rows]
        else:
            mysql.connection.commit()
            data = f"Query OK. Rows affected: {cur.rowcount}"

        cur.close()
        return jsonify({"success": True, "data": data})

    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

# -------------------------------------------------
# App Entry
# -------------------------------------------------
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)