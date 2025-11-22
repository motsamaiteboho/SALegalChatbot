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
# 1. Load documents once on startup
# ====================================
with open("metadata/case_metadata_core_with_paths.json", "r", encoding="utf-8") as f:
    cases_metadata = json.load(f)

docs = []
for case in cases_metadata:
    raw_path = case.get("cleaned_text_path")
    if not raw_path:
        continue

    # 1) Normalise Windows-style backslashes to POSIX-style
    normalized_path = raw_path.replace("\\", "/")

    # 2) Build a Path relative to the app root
    text_path = Path(normalized_path)

    try:
        # 3) Skip if the file doesn't actually exist on the slug
        if not text_path.is_file():
            continue

        text = text_path.read_text(encoding="utf-8")
        docs.append(Document(page_content=text, metadata=case))

    except OSError:
        # Handles cases like "filename too long" or invalid paths on Linux
        # Just skip those problematic entries
        continue

print(f"✅ Loaded {len(docs)} documents and {len(docs)} raw texts.")


splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=150)
chunked_docs = [Document(page_content=chunk, metadata=d.metadata)
                for d in docs for chunk in splitter.split_text(d.page_content)]

print(f"✅ Loaded {len(docs)} documents and {len(chunked_docs)} chunks.")

embeddings = OpenAIEmbeddings(model="text-embedding-ada-002")
vectorstore = FAISS.from_documents(chunked_docs, embeddings)
retriever = vectorstore.as_retriever(search_kwargs={"k": 5})

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

# Multi-query retriever (for better coverage)
multi_retriever = MultiQueryRetriever.from_llm(retriever=retriever, llm=llm)

# ====================================
# Flask route for chat
# ====================================
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/ask", methods=["POST"])
@app.route("/ask", methods=["POST"])
def ask():
    data = request.get_json()
    user_query = data.get("query", "").strip()

    if not user_query:
        return jsonify({"answer": "Please enter a question.", "sources": []})

    # --- Multi-query expansion ---
    expanded_docs = multi_retriever.get_relevant_documents(user_query)

    # --- If vector retrieval fails, use keyword fallback on all chunks ---
    docs = expanded_docs
    if not docs:
        docs = keyword_fallback(user_query, chunked_docs)

    # --- Build context for model (may still be empty) ---
    context = "\n\n".join([
        f"Source: {d.metadata.get('case_name')} ({d.metadata.get('neutral_citation')})\n{d.page_content[:600]}..."
        for d in docs
    ])

    prompt = f"""
    You are a South African legal research assistant.

    First, decide whether the user's question is:
    (A) a South African legal question (doctrinal, case-law or practical), or

    
    If it is (A), you may answer even if the context is limited, but:
    - Prefer to base your answer on the SAFLII context below where relevant.
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
       "Similarly, in NUM obo Employees v CCMA [2011] ZALAC 7 the Labour Appeal Court confirmed that ..."
    4. Only mention case names and citations that appear in the Context metadata
       (the 'Source: ... (citation)' lines). Do NOT invent new cases or citations.
       If you cannot confidently tie a point to a specific case from the context,
       speak generally (e.g. "South African courts have held that ...") without naming a case.
    5. Do NOT add a separate "Sources" or "References" section; just integrate cases
       naturally into the narrative.

    ---
    Context:
    {context}

    Question:
    {user_query}
    """

    response = llm.invoke(prompt)
    answer = response.content if hasattr(response, "content") else str(response)

    # If the model refused → no sources
    refusal_line = "I'm only able to assist with South African legal questions based on SAFLII case law."
    if refusal_line in answer:
        return jsonify({"answer": refusal_line, "sources": []})

    # If we truly have no docs even after fallback → answer but say no sources
    if not docs:
        answer += "\n\n_No specific SAFLII case excerpts could be retrieved for this query._"
        return jsonify({"answer": answer, "sources": []})

    # Otherwise attach the retrieved chunks as sources for the side drawer
    sources = []
    for d in docs:
        sources.append({
            "case_name": d.metadata.get("case_name"),
            "citation": d.metadata.get("neutral_citation"),
            # treat this as a "summary" or preview in the drawer
            "summary": d.page_content[:400] + "..."
        })

    return jsonify({"answer": answer, "sources": sources})

def keyword_fallback(query, documents, limit=5):
    """
    Very simple keyword-based fallback if vector retrieval returns nothing.
    Looks for overlaps between query words and document text.
    """
    keywords = [w.lower() for w in query.split() if len(w) > 3]
    matches = []

    for d in documents:
        text = d.page_content.lower()
        score = sum(1 for k in keywords if k in text)
        if score > 0:
            matches.append((score, d))

    matches.sort(key=lambda x: x[0], reverse=True)
    return [d for _, d in matches[:limit]]


if __name__ == "__main__":
    app.run(debug=True)
