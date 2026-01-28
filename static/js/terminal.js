const output = document.getElementById("output");
const textarea = document.getElementById("query");

const { motion } = window["framer-motion"];

motion.animate("#container", { opacity: [0, 1] }, { duration: 0.6 });

function runQuery() {
  const query = textarea.value.trim();
  if (!query) return;

  output.textContent = "Running...";

  fetch("/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query })
  })
  .then(res => res.json())
  .then(data => {
    if (!data.success) {
      output.innerHTML = `<span style="color:#f85149">${data.error}</span>`;
      return;
    }

    if (Array.isArray(data.data)) renderTable(data.data);
    else output.textContent = data.data;
  });
}

function askAI() {
  const text = textarea.value.trim();
  if (!text) return;

  output.textContent = "Gemini thinking 🤖...";

  fetch("/ai-query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: text })
  })
  .then(res => res.json())
  .then(data => {
    textarea.value = data.sql;
    output.innerHTML = `<pre>${data.sql}</pre>`;
  });
}

function renderTable(rows) {
  if (!rows.length) {
    output.textContent = "No rows.";
    return;
  }

  const cols = Object.keys(rows[0]);
  let html = "<table><tr>";
  cols.forEach(c => html += `<th>${c}</th>`);
  html += "</tr>";

  rows.forEach(r => {
    html += "<tr>";
    cols.forEach(c => html += `<td>${r[c]}</td>`);
    html += "</tr>";
  });

  html += "</table>";
  output.innerHTML = html;
}
