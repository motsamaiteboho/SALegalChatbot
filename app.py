from flask import Flask, render_template, request, jsonify
import json
from pathlib import Path
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_community.vectorstores import FAISS
from langchain.schema import Document
from langchain.chains import RetrievalQA
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.retrievers.multi_query import MultiQueryRetriever
from dotenv import load_dotenv
import os

app = Flask(__name__)

# 🧹 Fix newline/whitespace in API key
key = os.getenv("OPENAI_API_KEY")
if key:
    key = key.strip()
    os.environ["OPENAI_API_KEY"] = key
# ====================================
# Load FAISS index (FAST, NO chunking)
# ====================================
embeddings = OpenAIEmbeddings(model="text-embedding-ada-002")

vectorstore = FAISS.load_local(
    "faiss_index",
    embeddings,
    allow_dangerous_deserialization=True
)

retriever = vectorstore.as_retriever(search_kwargs={"k": 5})

# LLM for multi-query
llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

# Multi-query wrapper (optional)
multi_retriever = MultiQueryRetriever.from_llm(
    retriever=retriever,
    llm=llm
)

print("✅ Loaded FAISS index and retriever successfully!")

# ====================================
# Flask route for chat
# ====================================
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/ask", methods=["POST"])
def ask():
    data = request.get_json() or {}
    user_query = data.get("query", "").strip()

    if not user_query:
        return jsonify({"answer": "Please enter a question.", "sources": []})

    # --- 1) Multi-query expansion over local FAISS index ---
    docs = multi_retriever.get_relevant_documents(user_query)

    # --- 2) Simple fallback: plain retriever with bigger k (no chunked_docs any more) ---
    if not docs:
        # Try again with standard retriever & a larger top-k
        docs = retriever.get_relevant_documents(user_query)

    # --- 3) Build context for model (may still be empty) ---
    # Include court, date and SAFLII URL in the "Source:" line so the model sees them.
    context_parts = []
    for d in docs:
        m = d.metadata or {}
        case_name = m.get("case_name") or "Unknown case"
        citation = m.get("neutral_citation") or ""
        court = m.get("court") or ""
        jd = m.get("judgment_date") or ""
        saflii_url = m.get("saflii_case_url") or m.get("saflii_url") or ""

        header = f"Source: {case_name} ({citation})"
        if court or jd:
            header += f" – {court} {jd}".strip()
        if saflii_url:
            header += f"\nSAFLII: {saflii_url}"

        snippet = d.page_content[:800] + "..."
        context_parts.append(f"{header}\n{snippet}")

    context = "\n\n".join(context_parts)

    prompt = f"""
    You are a South African legal research assistant.

    First, decide whether the user's question is:
    (A) a South African legal question (doctrinal, case-law or practical), or

    If it is (A), you may answer even if the context is limited, but:
    - You may ONLY cite cases that appear in the Context metadata below.
    - Ignore case names inside the raw judgment text. Only cite cases from metadata.
    - Prefer to base your answer on the SAFLII context below.
    - If the context does not clearly cover the issue, you may still answer using general
    South African legal principles, and you should say that no specific SAFLII cases
    could be identified from the provided context.

    The Context section below contains the available cases and their neutral citations.
    You MUST obey the following when writing your answer:

    1. Always answer in South African legal style, citing case law where relevant.
    2. Write a single, coherent narrative answer in professional South African legal style.
    Do NOT use headings, bullet lists or numbered lists.
    3. Whenever you state a specific legal rule, test, or conclusion that is grounded
    in a case, explicitly weave the case into the sentence, e.g.:
    "According to Atamelang Bus Transport (Pty) Ltd v MEC for Community Safety
    [2025] ZANWHC 191, the court held that ..."
    or
    "Similarly, in NUM obo Employees v CCMA [2011] ZALAC 7 the Labour Appeal Court confirmed that ...".
    4. Never invent new cases, new citations, or paraphrase existing cases into new forms. You may only use cases exactly as provided.
    5. When you refer to a case from the Context, ALWAYS include its neutral citation
    exactly as shown there (e.g. "Case v Case [2011] ZASCA 3").
    6. Do NOT add a separate "Sources" or "References" section; just integrate cases
    naturally into the narrative.
    7. Ignore case names inside the raw judgment text. Only cite cases from metadata.

    IMPORTANT: The Context contains two levels of authority:

    (1) METADATA CASES: These are the judgments for which you have
        metadata entries (case_name, neutral_citation, court, date).
        These are your PRIMARY authorities.

    (2) EMBEDDED CASES: These are cases mentioned inside the raw text of
        the metadata cases (for example, "as held in Minister of Safety and
        Security v Van Duivenboden", quoted inside another judgment).

    RULES:

    - You must ALWAYS treat the metadata case as the primary authority.
    - When you rely on a legal rule that appears in the raw text of a
    metadata case, you MUST cite that metadata case.
    - If the raw text also mentions another case (an embedded case),
    you MAY mention that case too, but you MUST show that you know
    it only through the metadata case, e.g.:

    "In D_D v SAFAMCO Enterprises (Pty) Ltd [2025] ZAWCHC 535 the Court,
    relying on Minister of Safety and Security v Van Duivenboden, held
    that negligence alone is not inherently unlawful."

    You are NOT allowed to present embedded cases as if you have read their
    judgments directly. They must always be anchored to the metadata case
    that quotes them.
    ---
    Context:
    {context}

    Question:
    {user_query}
    """


    response = llm.invoke(prompt)
    answer = response.content if hasattr(response, "content") else str(response)

    refusal_line = "I'm only able to assist with South African legal questions based on SAFLII case law."
    if refusal_line in answer:
        return jsonify({"answer": refusal_line, "sources": []})

    # If we truly have no docs even after fallback → answer but say no sources
    if not docs:
        answer += "\n\n_No specific SAFLII case excerpts could be retrieved for this query._"
        return jsonify({"answer": answer, "sources": []})

    # --- 4) Build sources payload for the side drawer (dedup per case) ---
    sources = []
    seen_keys = set()

    for d in docs:
        m = d.metadata or {}
        key = (m.get("case_name"), m.get("neutral_citation"))
        if key in seen_keys:
            continue
        seen_keys.add(key)

        sources.append({
            "case_name": m.get("case_name"),
            "citation": m.get("neutral_citation"),
            "court": m.get("court"),
            "judgment_date": m.get("judgment_date"),
            "saflii_url": m.get("saflii_case_url") or m.get("saflii_url"),
            "pdf_url": m.get("pdf_url"),
            # short preview of the chunk
            "summary": d.page_content[:400] + "..."
        })

    return jsonify({"answer": answer, "sources": sources})


if __name__ == "__main__":
    app.run(debug=True)
