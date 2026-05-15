// =======================
// DOM ELEMENTS
// =======================
const messagesDiv = document.getElementById("messages");
const loading = document.getElementById("loading");
const queryInput = document.getElementById("query");
const historyList = document.getElementById("historyList");
const sourcesList = document.getElementById("sourcesList");
const vectorStoreList = document.getElementById("vectorStoreList");
const vectorStoreBtn = document.getElementById("vectorStoreBtn");
const newConversationBtn = document.getElementById("newConversationBtn");
const chatForm = document.getElementById("chatForm");
const sendBtn = document.getElementById("sendBtn");
const chatContent = document.querySelector(".content");

let emptyState = document.getElementById("emptyState");
let activeHistoryIndex = null;

// =======================
// STATE
// =======================
const chatHistory = [];
let isThinking = false;
let mode = "case_law";
let vectorStoreLoaded = false;
const modeLabel = document.getElementById("modeLabel");
const modeToggleBtn = document.getElementById("modeToggleBtn");
const promptTypeSelect = document.getElementById("promptTypeSelect");
let promptType = "fewshot";

if (promptTypeSelect) {
  promptTypeSelect.addEventListener("change", () => {
    promptType = promptTypeSelect.value || "fewshot";
  });
}

function setMode(selectedMode) {
  mode = selectedMode;
  if (modeLabel) {
    modeLabel.textContent = mode === "general" ? "General" : "Case-Law";
  }

  if (modeToggleBtn) {
    modeToggleBtn.textContent = mode === "general" ? "Mode: General" : "Mode: Case-Law";
  }

  // Clear active history when switching modes for a clean screen
  activeHistoryIndex = null;
  addEmptyState();
  renderHistory();
}

setMode("case_law");

// Modal handles
let sourceModalInstance = null;
let sourceModalTitle = null;
let sourceModalMeta = null;
let sourceModalBody = null;
let sourceModalLinks = null;
let debugModalInstance = null;
let debugModalTitle = null;
let debugModalPrompt = null;
let debugModalDetails = null;

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

function initDebugModal() {
  let modalEl = document.getElementById("debugModal");

  if (!modalEl) {
    modalEl = document.createElement("div");
    modalEl.id = "debugModal";
    modalEl.className = "modal fade";
    modalEl.tabIndex = -1;
    modalEl.setAttribute("aria-hidden", "true");
    modalEl.innerHTML = `
      <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
        <div class="modal-content source-modal">
          <div class="modal-header border-0 pb-2">
            <div class="text-white">
              <h5 class="modal-title mb-1" id="debugModalTitle">Prompt & Context</h5>
            </div>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>

          <div class="modal-body bg-white text-dark pt-0">
            <div class="mb-3">
              <h6>Prompt</h6>
              <pre id="debugModalPrompt" class="small bg-light p-2 rounded"></pre>
            </div>
            <div class="mb-3">
              <h6>Retrieval details</h6>
              <div id="debugModalDetails" class="small bg-light p-2 rounded"></div>
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

  debugModalTitle = document.getElementById("debugModalTitle");
  debugModalPrompt = document.getElementById("debugModalPrompt");
  debugModalDetails = document.getElementById("debugModalDetails");

  // eslint-disable-next-line no-undef
  debugModalInstance = new bootstrap.Modal(modalEl);
}

function openDebugModal(debugInfo) {
  if (!debugModalInstance) {
    initDebugModal();
  }

  debugModalPrompt.textContent = debugInfo.prompt || "No prompt available.";

  if (debugInfo.retrievalSummary) {
    const summary = debugInfo.retrievalSummary;
    if (summary.mode === "general") {
      debugModalDetails.innerHTML = `<p>${summary.note || "General mode uses LLM knowledge without local retrieval."}</p>`;
    } else {
      const docs = summary.top_documents || [];
      const listItems = docs
        .map(
          (doc) =>
            `<li><strong>${doc.case_name || "Unknown"}</strong>${doc.citation ? ` (${doc.citation})` : ""}${doc.court ? ` — ${doc.court}` : ""}${doc.judgment_date ? ` • ${doc.judgment_date}` : ""}</li>`
        )
        .join("");
      debugModalDetails.innerHTML = `
        <p>Retrieved ${summary.retrieved_documents || docs.length} document(s).</p>
        <ul>${listItems}</ul>
      `;
    }
  } else {
    debugModalDetails.innerHTML = "<p>No retrieval details available.</p>";
  }

  debugModalInstance.show();
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

function addBotMessage(html, sourcesForMessage = null, retrievalSummary = null, debugInfo = null) {
  hideEmptyState();

  const wrapper = document.createElement("div");
  wrapper.classList.add("message", "bot-msg");
  wrapper.innerHTML = `
    <div class="bubble bot-bubble">${html}</div>
    ${retrievalSummary ? `
      <div class="mt-2 small text-secondary-emphasis">
        ${renderRetrievalSummary(retrievalSummary)}
      </div>
    ` : ""}
    ${debugInfo && debugInfo.prompt ? `
      <div class="mt-2">
        <button
          class="btn btn-outline-secondary btn-sm"
          type="button"
          id="debugBtn-${Math.random().toString(36).slice(2)}"
        >
          🔍 View prompt/context
        </button>
      </div>
    ` : ""}
    ${sourcesForMessage && sourcesForMessage.length ? `
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
    ` : ""}
  `;
  if (debugInfo && debugInfo.prompt) {
    const btn = wrapper.querySelector("button[id^='debugBtn-']");
    if (btn) {
      btn.addEventListener("click", () => {
        openDebugModal(debugInfo);
      });
    }
  }

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

  messagesDiv.appendChild(wrapper);
  scrollToBottom();
}

function renderRetrievalSummary(summary) {
  if (!summary) return "";

  if (summary.mode === "general") {
    return summary.note || "General mode uses LLM knowledge without local retrieval.";
  }

  const lines = [];
  if (typeof summary.retrieved_documents === "number") {
    lines.push(`Retrieved ${summary.retrieved_documents} document(s)`);
  }
  if (summary.top_documents && summary.top_documents.length > 0) {
    const topDocs = summary.top_documents
      .slice(0, 3)
      .map((doc) => `${doc.case_name || "Unknown"}${doc.citation ? ` (${doc.citation})` : ""}`)
      .join("; ");
    lines.push(`Top docs: ${topDocs}`);
  }

  return lines.join(" \u2022 ");
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

    const modes = [];
    if (item.promptType) {
      const promptTag =
        item.promptType === "zeroshot"
          ? "Zero-shot"
          : item.promptType === "concise"
          ? "Concise"
          : item.promptType === "citation"
          ? "Citation-aware"
          : "Few-shot";
      modes.push(promptTag);
    }
    if (item.responses) {
      if (item.responses.case_law) modes.push("Case-Law");
      if (item.responses.general) modes.push("General");
    }

    const el = document.createElement("button");
    el.type = "button";
    el.className = `list-group-item list-group-item-action small text-start ${
      activeHistoryIndex === index ? "active" : ""
    }`;

    el.innerHTML = `
      <strong>Query #${index + 1}</strong>
      <div class="text-secondary-emphasis">${snippet}</div>
      <div class="text-muted small">${item.time}${modes.length ? ` • ${modes.join(", ")}` : ""}</div>
    `;

    el.addEventListener("click", () => {
      loadHistoryItem(index);
    });

    historyList.appendChild(el);
  });
}

function loadHistoryItem(index) {
  if (index < 0 || index >= chatHistory.length) return;

  activeHistoryIndex = index;
  const item = chatHistory[index];

  // Auto-switch mode if current mode doesn't have a cached response
  let targetMode = mode;
  if (item.responses && !item.responses[mode]) {
    // Find the first available mode with a cached response
    if (item.responses.case_law) {
      targetMode = "case_law";
    } else if (item.responses.general) {
      targetMode = "general";
    }
    
    // Switch mode if needed
    if (targetMode !== mode) {
      mode = targetMode;
      if (modeLabel) {
        modeLabel.textContent = mode === "general" ? "General" : "Case-Law";
      }
      if (modeToggleBtn) {
        modeToggleBtn.textContent = mode === "general" ? "Mode: General" : "Mode: Case-Law";
      }
    }
  }

  // Show the Q&A in the chat
  messagesDiv.innerHTML = "";

  addUserMessage(item.query);

  // Get the response for the target mode from the cached responses
  if (item.responses && item.responses[targetMode]) {
    const response = item.responses[targetMode];
    const answerWithCitations = applyInlineCitations(
      response.answer,
      response.sources
    );
    const htmlAnswer = marked.parse(answerWithCitations);

    addBotMessage(htmlAnswer, response.sources, response.retrievalSummary, {
      prompt: response.prompt,
      retrievalSummary: response.retrievalSummary,
    });

    renderSources(response.sources);
  } else {
    // No response cached for this mode (shouldn't happen now)
    addBotMessage(
      `<em>No response available for this question.</em>`,
      [],
      null,
      null
    );
    renderSources([]);
  }

  renderHistory(); // Update active state
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
  // Do NOT clear chatHistory - preserve it for the History drawer
  activeHistoryIndex = null;
  renderHistory(); // Re-render to show all preserved history
  renderSources([]);
  queryInput.value = "";
  setThinking(false);
  updateSendState();
}

// =======================
// VECTOR STORE PREVIEW
// =======================

async function loadVectorStorePreview() {
  if (vectorStoreLoaded || !vectorStoreList) return;

  vectorStoreList.innerHTML =
    '<div class="text-center py-3">Loading vector store preview...</div>';

  try {
    const res = await fetch("/vectorstore");
    const data = await res.json();
    const preview = data.preview || [];

    if (preview.length === 0) {
      vectorStoreList.innerHTML =
        '<div class="text-secondary-emphasis">No vector store entries found.</div>';
      return;
    }

    vectorStoreList.innerHTML = "";

    preview.forEach((item, index) => {
      const card = document.createElement("div");
      card.className = "card mb-3 shadow-sm border-0";
      card.innerHTML = `
        <div class="card-body p-3">
          <div class="d-flex align-items-start mb-1">
            <span class="badge rounded-pill bg-info me-2">#${index + 1}</span>
            <div>
              <strong>${item.case_name || "Unknown case"}</strong><br>
              <span class="small">${item.citation || "No citation"}</span><br>
              ${item.court ? `<span class="small">${item.court}</span><br>` : ""}
              ${item.judgment_date ? `<span class="small">${item.judgment_date}</span>` : ""}
            </div>
          </div>
          <p class="small text-muted mb-2"><strong>FAISS ID:</strong> ${item.faiss_id} · <strong>Doc ID:</strong> ${item.doc_id}</p>
          <p class="small text-body-secondary mb-2">${item.snippet || "No preview available."}</p>
          <div class="d-flex flex-wrap gap-2">
            ${item.saflii_url ? `<a href="${item.saflii_url}" target="_blank" class="btn btn-sm btn-primary">SAFLII</a>` : ""}
          </div>
        </div>
      `;
      vectorStoreList.appendChild(card);
    });

    vectorStoreLoaded = true;
  } catch (err) {
    console.error(err);
    vectorStoreList.innerHTML =
      '<div class="text-danger">Unable to load vector store preview. Please refresh the page.</div>';
  }
}

// =======================
// REGENERATE CHAT IN NEW MODE
// =======================

async function regenerateChatInMode() {
  setThinking(true);

  // Clear messages but keep empty state hidden
  messagesDiv.innerHTML = "";

  try {
    // Iterate through each chat history entry
    for (const historyItem of chatHistory) {
      const query = historyItem.query;

      addUserMessage(query);

      // Check if response already cached for this mode
      if (!historyItem.responses) {
        historyItem.responses = {};
      }

      let sources = [];
      let rawAnswer = "";

      let retrievalSummary = null;
      let promptText = null;
      if (historyItem.responses[mode]) {
        // Use cached response
        const cachedResponse = historyItem.responses[mode];
        rawAnswer = cachedResponse.answer;
        sources = cachedResponse.sources;
        retrievalSummary = cachedResponse.retrievalSummary || null;
        promptText = cachedResponse.prompt || null;
      } else {
        // Fetch new response for this mode
        const res = await fetch("/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, mode, prompt_type: promptType }),
        });

        const data = await res.json();
        sources = data.sources || [];
        rawAnswer = data.answer || "";
        retrievalSummary = data.retrieval_summary || null;
        promptText = data.prompt || null;

        // Cache the response
        historyItem.responses[mode] = {
          answer: rawAnswer,
          sources: sources,
          retrievalSummary,
          prompt: promptText,
        };
      }

      const answerWithCitations = applyInlineCitations(rawAnswer, sources);
      const htmlAnswer = marked.parse(answerWithCitations);

      addBotMessage(htmlAnswer, sources, retrievalSummary, {
        prompt: promptText,
        retrievalSummary,
      });
    }

    renderHistory();
    renderSources(chatHistory.length > 0 ? chatHistory[chatHistory.length - 1].responses[mode].sources : []);
  } catch (err) {
    console.error(err);
    addBotMessage(
      `<span class="text-danger">⚠️ Error regenerating chat in new mode. Please try again.</span>`
    );
  } finally {
    setThinking(false);
    scrollToBottom();
  }
}
// MAIN SEND FUNCTION
// =======================

async function sendMessage() {
  const query = queryInput.value.trim();
  if (!query || isThinking) return;

  setThinking(true);
  activeHistoryIndex = null; // Clear active history when sending new message

  addUserMessage(query);
  queryInput.value = "";
  updateSendState();

  try {
    const res = await fetch("/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, mode, prompt_type: promptType }),
    });

    const data = await res.json();
    const sources = data.sources || [];
    const rawAnswer = data.answer || "";
    const retrievalSummary = data.retrieval_summary || null;
    const promptText = data.prompt || null;

    // Inject clickable [1], [2], ... based on neutral_citation / citation
    const answerWithCitations = applyInlineCitations(rawAnswer, sources);

    // Markdown → HTML
    const htmlAnswer = marked.parse(answerWithCitations);

    addBotMessage(htmlAnswer, sources, retrievalSummary, {
      prompt: promptText,
      retrievalSummary,
    });

    const timeStr = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    const historyEntry = {
      query,
      time: timeStr,
      promptType,
      responses: {},
    };

    historyEntry.responses[mode] = {
      answer: rawAnswer,
      sources,
      retrievalSummary,
      prompt: promptText,
    };

    chatHistory.push(historyEntry);

    activeHistoryIndex = chatHistory.length - 1; // Set active to latest
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

// Mode toggle button
if (modeToggleBtn) {
  modeToggleBtn.addEventListener("click", () => {
    setMode(mode === "general" ? "case_law" : "general");
  });
}

// Vector store preview button
if (vectorStoreBtn) {
  vectorStoreBtn.addEventListener("click", () => {
    loadVectorStorePreview();
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
    activeHistoryIndex = null; // Clear active history when starting new message
    sendMessage();
  });
});
