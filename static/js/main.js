// =======================
// DOM ELEMENTS
// =======================
const messagesDiv = document.getElementById("messages");
const loading = document.getElementById("loading");
const queryInput = document.getElementById("query");
const historyList = document.getElementById("historyList");
const sourcesList = document.getElementById("sourcesList");
const newConversationBtn = document.getElementById("newConversationBtn");
const chatForm = document.getElementById("chatForm");
const sendBtn = document.getElementById("sendBtn");
const chatContent = document.querySelector(".content");

let emptyState = document.getElementById("emptyState");

// =======================
// STATE
// =======================
const chatHistory = [];
let isThinking = false;

// Modal handles
let sourceModalInstance = null;
let sourceModalTitle = null;
let sourceModalMeta = null;
let sourceModalBody = null;
let sourceModalLinks = null;

// =======================
// UI HELPERS
// =======================

function scrollToBottom() {
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function hideEmptyState() {
  if (emptyState) {
    emptyState.remove();
    emptyState = null;

    // Remove centering once chat actually starts
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
  div.className = "d-flex flex-column align-items-center chat-empty";

  div.innerHTML = `
    <h5 class="mb-2">Welcome to South African Case-Law Assistant</h5>
    <p class="text-secondary-emphasis mb-0">
      Ask questions on South African law of delict
    </p>

    <div class="d-flex align-items-start gap-2 pt-4">
      <button
        type="button"
        class="btn btn-sm text-dark example-question"
      >
        When is a statement defamatory in South African law?
      </button>

      <button
        type="button"
        class="btn btn-sm text-dark example-question"
      >
        What must a plaintiff prove to succeed in delict?
      </button>

      <button
        type="button"
        class="btn btn-sm text-dark example-question"
      >
        How do courts determine wrongfulness in negligence?
      </button>
    </div>
  `;

  messagesDiv.appendChild(div);
  emptyState = div;

  // Center layout again for a fresh session
  if (chatContent) {
    chatContent.classList.add("center-content");
  }

  // Re-bind example-question button events
  document.querySelectorAll(".example-question").forEach((btn) => {
    btn.addEventListener("click", () => {
      queryInput.value = btn.textContent.trim();
      updateSendState();
      sendMessage();
    });
  });
}



function updateSendState() {
  const trimmed = queryInput.value.trim();
  const isEmpty = trimmed.length === 0;
  sendBtn.disabled = isEmpty || isThinking;
}

function setThinking(on) {
  isThinking = on;
  loading.style.display = on ? "flex" : "none";
  updateSendState();
}

// =======================
// MODAL HELPERS
// =======================

function initSourceModal() {
  let modalEl = document.getElementById("sourceModal");

  if (!modalEl) {
    modalEl = document.createElement("div");
    modalEl.id = "sourceModal";
    modalEl.className = "modal fade";
    modalEl.tabIndex = -1;
    modalEl.setAttribute("aria-hidden", "true");
    modalEl.innerHTML = `
      <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
        <div class="modal-content source-modal">
          <div class="modal-header border-0 pb-2">
            <div class="text-white">
              <h5 class="modal-title mb-1" id="sourceModalTitle"></h5>
              <div id="sourceModalMeta" class="source-modal-meta small"></div>
            </div>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>

          <div class="modal-body bg-white text-dark pt-0">
            <p id="sourceModalBody" class="source-modal-body small mb-3"></p>

            <div id="sourceModalLinks"
                 class="mt-2 d-flex flex-wrap gap-2 align-items-center">
            </div>
          </div>

          <div class="modal-footer border-0 pt-0">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
              Close
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modalEl);
  }

  sourceModalTitle = document.getElementById("sourceModalTitle");
  sourceModalMeta = document.getElementById("sourceModalMeta");
  sourceModalBody = document.getElementById("sourceModalBody");
  sourceModalLinks = document.getElementById("sourceModalLinks");

  // Bootstrap 5 modal instance
  // eslint-disable-next-line no-undef
  sourceModalInstance = new bootstrap.Modal(modalEl);
}

function openSourceModal(source) {
  if (!sourceModalInstance) {
    initSourceModal();
  }

  const caseName = source.case_name || "Case details";
  const citation = source.neutral_citation || source.citation || "";
  const court = source.court || "";
  const date = source.judgment_date || "";
  const summary = source.summary || "No summary available for this source.";

  sourceModalTitle.textContent = caseName;

  const metaParts = [];
  if (citation) metaParts.push(citation);
  if (court) metaParts.push(court);
  if (date) metaParts.push(date);

  sourceModalMeta.textContent = metaParts.join(" • ");
  sourceModalBody.textContent = summary;

  sourceModalLinks.innerHTML = "";
  if (source.saflii_url) {
    const a = document.createElement("a");
    a.href = source.saflii_url;
    a.target = "_blank";
    a.className = "btn btn-sm btn-primary";
    a.textContent = "View on SAFLII";
    sourceModalLinks.appendChild(a);
  }
  if (source.pdf_url) {
    const a = document.createElement("a");
    a.href = source.pdf_url;
    a.target = "_blank";
    a.className = "btn btn-sm btn-primary";
    a.textContent = "Open PDF";
    sourceModalLinks.appendChild(a);
  }

  sourceModalInstance.show();
}

// =======================
// INLINE CITATIONS HELPERS
// =======================

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// More flexible citation tagging
function applyInlineCitations(answerText, sources) {
  if (!answerText || !sources || sources.length === 0) return answerText;

  let annotated = answerText;

  sources.forEach((s, index) => {
    const n = index + 1;
    const citation = s.neutral_citation || s.citation;
    if (!citation) return;

    // Allow extra spaces and optional surrounding parentheses
    const flexiblePattern =
      "\\(?\\s*" + escapeRegExp(citation) + "\\s*\\)?";

    const pattern = new RegExp(
      flexiblePattern + "(?!\\s*\\[\\d+\\])",
      "g"
    );

    const marker = `<button type="button" class="btn btn-link p-0 citation-link" data-source-index="${index}">[${n}]</button>`;

    // Replace the *whole matched portion* with cleaned citation + marker
    annotated = annotated.replace(
      pattern,
      `${citation} ${marker}`
    );
  });

  return annotated;
}

// =======================
// MESSAGE RENDERING
// =======================

function addUserMessage(text) {
  hideEmptyState();

  const wrapper = document.createElement("div");
  wrapper.classList.add("message", "user-msg");
  wrapper.innerHTML = `
    <div class="bubble user-bubble">${text.replace(/\n/g, "<br>")}</div>
  `;
  messagesDiv.appendChild(wrapper);
  scrollToBottom();
}

function addBotMessage(html, sourcesForMessage = null) {
  hideEmptyState();

  const wrapper = document.createElement("div");
  wrapper.classList.add("message", "bot-msg");
  wrapper.innerHTML = `
    <div class="bubble bot-bubble">${html}</div>
    <div class="mt-2">
      <button
        class="btn btn-secondary"
        type="button"
        data-bs-toggle="offcanvas"
        data-bs-target="#sourcesDrawer"
      >
        📚 Sources
      </button>
    </div>
  `;
  messagesDiv.appendChild(wrapper);

  // Wire up inline citation click events for THIS message only
  if (sourcesForMessage && sourcesForMessage.length) {
    const citationButtons = wrapper.querySelectorAll(".citation-link");
    citationButtons.forEach((btn) => {
      const idx = parseInt(btn.dataset.sourceIndex, 10);
      if (!Number.isNaN(idx) && sourcesForMessage[idx]) {
        btn.addEventListener("click", () => {
          openSourceModal(sourcesForMessage[idx]);
        });
      }
    });
  }

  scrollToBottom();
}

// =======================
// HISTORY & SOURCES
// =======================

function renderHistory() {
  historyList.innerHTML = "";

  if (chatHistory.length === 0) {
    historyList.innerHTML =
      `<div class="p-2 text-secondary-emphasis">No questions yet.</div>`;
    return;
  }

  chatHistory.forEach((item, index) => {
    const snippet =
      item.query.length > 60 ? item.query.slice(0, 60) + "…" : item.query;

    const el = document.createElement("button");
    el.type = "button";
    el.className = "list-group-item list-group-item-action small text-start";

    el.innerHTML = `
      <strong>Query #${index + 1}</strong>
      <div class="text-secondary-emphasis">${snippet}</div>
      <div class="text-muted small">${item.time}</div>
    `;

    historyList.appendChild(el);
  });
}

function renderSources(sources) {
  sourcesList.innerHTML = "";

  if (!sources || sources.length === 0) {
    sourcesList.innerHTML =
      `<p class="text-secondary-emphasis">No sources yet.</p>`;
    return;
  }

  sources.forEach((s, index) => {
    const n = index + 1;

    const caseName = s.case_name || "Unknown Case";
    const citation = s.neutral_citation || s.citation || "";
    const court = s.court ? `<span class="small">${s.court}</span>` : "";
    const date = s.judgment_date
      ? `<span class="small"> • ${s.judgment_date}</span>`
      : "";

    const safliiBtn = s.saflii_url
      ? `<a href="${s.saflii_url}" target="_blank"
           class="btn btn-sm btn-primary me-2">View on SAFLII</a>`
      : "";

    const pdfBtn = s.pdf_url
      ? `<a href="${s.pdf_url}" target="_blank"
           class="btn btn-sm btn-primary">Open PDF</a>`
      : "";

    const card = document.createElement("div");
    card.className = "card mb-2 shadow-sm border-0";

    card.innerHTML = `
      <div class="card-body p-3">
        <div class="d-flex align-items-start mb-1">
          <span class="badge rounded-pill bg-info me-2">[${n}]</span>
          <div>
            <strong>${caseName}</strong><br>
            <span class="small">${citation}</span><br>
            ${court}${date}
          </div>
        </div>
        <p class="small mt-2 text-body-secondary">${s.summary || ""}</p>

        <div class="mt-2 d-flex flex-wrap gap-2">
          ${safliiBtn}
          ${pdfBtn}
        </div>
      </div>
    `;

    sourcesList.appendChild(card);
  });
}

function resetConversation() {
  addEmptyState();
  renderHistory();
  renderSources([]);
  queryInput.value = "";
  setThinking(false);
  updateSendState();
}

// =======================
// MAIN SEND FUNCTION
// =======================

async function sendMessage() {
  const query = queryInput.value.trim();
  if (!query || isThinking) return;

  setThinking(true);

  addUserMessage(query);
  queryInput.value = "";
  updateSendState();

  try {
    const res = await fetch("/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });

    const data = await res.json();
    const sources = data.sources || [];
    const rawAnswer = data.answer || "";

    // Inject clickable [1], [2], ... based on neutral_citation / citation
    const answerWithCitations = applyInlineCitations(rawAnswer, sources);

    // Markdown → HTML
    const htmlAnswer = marked.parse(answerWithCitations);

    addBotMessage(htmlAnswer, sources);

    const timeStr = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    chatHistory.push({
      query,
      answer: rawAnswer,
      sources,
      time: timeStr,
    });

    renderHistory();
    renderSources(sources);
  } catch (err) {
    console.error(err);
    addBotMessage(
      `<span class="text-danger">⚠️ Error connecting to server. Please try again.</span>`
    );
  } finally {
    setThinking(false);
    scrollToBottom();
  }
}

// =======================
// EVENT LISTENERS
// =======================

// Form submit (Send button)
if (chatForm) {
  chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    sendMessage();
  });
}

// Enter = send, Shift+Enter = newline
queryInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Enable/disable send button based on input
queryInput.addEventListener("input", updateSendState);
updateSendState(); // initial state

// New conversation button
if (newConversationBtn) {
  newConversationBtn.addEventListener("click", () => {
    resetConversation();
  });
}

// Example question buttons
document.querySelectorAll(".example-question").forEach((btn) => {
  btn.addEventListener("click", () => {
    queryInput.value = btn.textContent.trim();
    updateSendState();
    sendMessage();
  });
});
