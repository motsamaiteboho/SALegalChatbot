const messagesDiv = document.getElementById("messages");
const loading = document.getElementById("loading");
const queryInput = document.getElementById("query");
const historyList = document.getElementById("historyList");
const sourcesList = document.getElementById("sourcesList");
const newConversationBtn = document.getElementById("newConversationBtn");
let emptyState = document.getElementById("emptyState");

const chatHistory = [];
const chatContent = document.querySelector(".content");

// Hide empty state (if present)
function hideEmptyState() {
  if (emptyState) {
    emptyState.remove();
    emptyState = null;

    // remove centering once chat actually starts
    if (chatContent) {
      chatContent.classList.remove("center-content");
    }
  }
}

// Recreate empty state for new conversation
function addEmptyState() {
  messagesDiv.innerHTML = "";

  const div = document.createElement("div");
  div.id = "emptyState";
  div.className = "chat-empty";
  div.innerHTML = `
    <h5 class="mb-2">Welcome to South African Case-Law Assistant</h5>
    <p class="text-secondary-emphasis mb-0">
      Ask questions on South African law of delict
    </p>
  `;

  messagesDiv.appendChild(div);
  emptyState = div;

  // center layout again for fresh session
  if (chatContent) {
    chatContent.classList.add("center-content");
  }
}

// Add user bubble
function addUserMessage(text) {
  hideEmptyState();

  const wrapper = document.createElement("div");
  wrapper.classList.add("message", "user-msg");
  wrapper.innerHTML = `
    <div class="bubble user-bubble">${text.replace(/\n/g, "<br>")}</div>
  `;
  messagesDiv.appendChild(wrapper);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Add bot bubble
function addBotMessage(html) {
  hideEmptyState();

  const wrapper = document.createElement("div");
  wrapper.classList.add("message", "bot-msg");
  wrapper.innerHTML = `
    <div class="bubble bot-bubble">${html}</div>
    <div>
     <button
        class="btn btn-secondary "
        data-bs-toggle="offcanvas"
        data-bs-target="#sourcesDrawer"
    >
    📚 Sources
    </button>
    </div>
  `;
  messagesDiv.appendChild(wrapper);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Drawer history list
function renderHistory() {
  historyList.innerHTML = "";

  if (chatHistory.length === 0) {
    historyList.innerHTML = `<div class="p-2 text-secondary-emphasis">No questions yet.</div>`;
    return;
  }

  chatHistory.forEach((item, index) => {
    const snippet =
      item.query.length > 60 ? item.query.slice(0, 60) + "…" : item.query;

    const el = document.createElement("button");
    el.type = "button";
    el.className =
      "list-group-item list-group-item-action small text-start";

    el.innerHTML = `
      <strong>Query #${index + 1}</strong>
      <div class="text-secondary-emphasis">${snippet}</div>
    `;

    historyList.appendChild(el);
  });
}

// Render sources/summaries
function renderSources(sources) {
  sourcesList.innerHTML = "";

  if (!sources || sources.length === 0) {
    sourcesList.innerHTML = `<p class="text-secondary-emphasis">No sources returned.</p>`;
    return;
  }

  sources.forEach((s) => {
    const caseName = s.case_name || "Unknown Case";
    const citation = s.citation || "";
    const court = s.court ? `<span class="small">${s.court}</span>` : "";
    const date = s.judgment_date ? `<span class="small"> • ${s.judgment_date}</span>` : "";
    const safliiUrl = s.saflii_url ? `<a href="${s.saflii_url}" target="_blank" class="small">View on SAFLII</a>` : "";
    const pdfUrl = s.pdf_url ? `<a href="${s.pdf_url}" target="_blank" class="small ms-3">Open PDF</a>` : "";

    const card = document.createElement("div");
    card.className = "card mb-2 shadow-sm border-0";

    card.innerHTML = `
      <div class="card-body p-3">
        <strong>${caseName}</strong><br>
        <span class="small">${citation}</span><br>
        ${court}${date}
        <p class="small mt-2 text-body-secondary">${s.summary}</p>
        <div class="mt-2">
          ${safliiUrl}
          ${pdfUrl}
        </div>
      </div>
    `;

    sourcesList.appendChild(card);
  });
}

// Main send function
async function sendMessage() {
  const query = queryInput.value.trim();
  if (!query) return;

  addUserMessage(query);
  queryInput.value = "";

  // show loader only while request in flight
  loading.style.display = "flex";

  try {
    const res = await fetch("/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });

    const data = await res.json();
    const htmlAnswer = marked.parse(data.answer || "");

    addBotMessage(htmlAnswer);

    const timeStr = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    chatHistory.push({
      query,
      answer: data.answer,
      sources: data.sources,
      time: timeStr,
    });

    renderHistory();
    renderSources(data.sources);
  } catch (err) {
    addBotMessage(
      `<span class="text-danger">⚠️ Error connecting to server.</span>`
    );
  } finally {
    loading.style.display = "none";
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }
}

// ENTER to send
queryInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// New conversation button
if (newConversationBtn) {
  newConversationBtn.addEventListener("click", () => {
    chatHistory.length = 0;
    renderHistory();
    renderSources([]); // reset sources text
    addEmptyState();
  });
}

