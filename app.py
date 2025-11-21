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
def ask():
    data = request.get_json()
    user_query = data.get("query", "")

    # --- Multi-query expansion ---
    expanded_docs = multi_retriever.get_relevant_documents(user_query)

    # --- Hybrid retrieval (optional if you added before) ---
    # docs = hybrid_retrieval(query=user_query, retriever=retriever, keyword_docs=expanded_docs)
    # If hybrid not used, just use expanded_docs:
    docs = expanded_docs

    # --- Build context for model ---
    context = "\n\n".join([
        f"Source: {d.metadata.get('case_name')} ({d.metadata.get('neutral_citation')})\n{d.page_content[:600]}..."
        for d in docs
    ])

    prompt = f"""
    You are a South African legal research assistant.

    Before answering, you MUST first determine whether the user's question is:
    1. A legal question, AND
    2. Specifically related to South African law, AND
    3. Answerable using the provided SAFLII case-law context.

    If the question is NOT legal, NOT related to South African law, or the context does NOT contain relevant legal material, you must politely refuse by saying:

    "I'm only able to assist with South African legal questions based on SAFLII case law."

    Do NOT attempt to answer non-legal, scientific, medical, technical, or general-knowledge questions.

    Only proceed if the question is legal AND contextually linked to SAFLII.

    ---

    Context:
    {context}

    Question:
    {user_query}

    If the question is valid and relevant, summarize the retrieved SAFLII cases in a structured, professional legal style.

    For each case, include:
    - **Case Name** (with neutral citation)
    - **Court and Date**
    - **Concise Summary** integrating the legal issue, holding, reasoning, and outcome.

    Write the answer in a continuous narrative in clean Markdown using bold labels
    (e.g., **Case:**, **Court and Date:**, **Summary:**).
    Avoid headings, bullet points, or numbered lists.
    """

    response = llm.invoke(prompt)
    answer = response.content if hasattr(response, "content") else str(response)

    # If the model refused OR no docs were retrieved → no sources
    irrelevant = (
        "I'm only able to assist with South African legal questions" in answer
        or not docs
    )

    if irrelevant:
        return jsonify({"answer": answer, "sources": []})

    # Otherwise attach the retrieved chunks
    sources = []
    for d in docs:
        sources.append({
            "case_name": d.metadata.get("case_name"),
            "citation": d.metadata.get("neutral_citation"),
            "snippet": d.page_content[:400] + "..."
        })

    return jsonify({"answer": answer, "sources": sources})


if __name__ == "__main__":
    app.run(debug=True)
