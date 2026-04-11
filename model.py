from langgraph.graph import StateGraph, START, END
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.sqlite import SqliteSaver
from typing import TypedDict
import sqlite3
from dotenv import load_dotenv
import os
import requests

load_dotenv()

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.2)

user_db = None
last_paper_filename = "General Discussion"

conn = sqlite3.connect("chatbot.db", check_same_thread=False)
checkpointer = SqliteSaver(conn)

SERPER_API_KEY = os.getenv("SERPER_API_KEY")

# -------- STATE -------- #
class State(TypedDict):
    question: str
    context: str
    source: str
    history: str
    web_context: str
    confidence: str
    ans: str


# -------- RAG -------- #
def take_query(state: State):
    global user_db

    if user_db is None:
        return {"context": ""}

    docs = user_db.similarity_search(state["question"], k=6)

    context = ""
    for doc in docs:
        page = doc.metadata.get("page", "unknown")
        context += f"(Page {page}) {doc.page_content}\n\n"

    return {"context": context}


# -------- WEB SEARCH -------- #
def get_web_context(query):
    try:
        url = "https://google.serper.dev/search"

        payload = {
            "q": query + " facts explanation",
            "num": 4
        }

        headers = {
            "X-API-KEY": SERPER_API_KEY,
            "Content-Type": "application/json"
        }

        res = requests.post(url, json=payload, headers=headers)
        data = res.json()

        web_context = ""

        if "organic" in data:
            for r in data["organic"]:
                web_context += r.get("snippet", "") + "\n"

        return web_context

    except:
        return ""


# -------- AGENT DECISION -------- #
def decide_source(state: State):

    if len(state["context"].strip()) < 80:
        return {"source": "web"}

    prompt = f"""
Return ONLY ONE:
PDF / WEB / BOTH

Question: {state['question']}
"""

    res = llm.invoke(prompt).content.strip().upper()

    if "BOTH" in res:
        return {"source": "both"}
    elif "WEB" in res:
        return {"source": "web"}

    return {"source": "pdf"}


# -------- FETCH WEB IF NEEDED -------- #
def fetch_web(state: State):

    if state["source"] in ["web", "both"]:
        return {"web_context": get_web_context(state["question"])}

    return {"web_context": ""}


# -------- CONFIDENCE ENGINE -------- #
def compute_confidence(state: State):

    if state["source"] == "pdf":
        return {"confidence": "High"}

    if state["source"] == "both":
        return {"confidence": "Medium-High"}

    return {"confidence": "Medium"}


# -------- PROMPT -------- #
def build_prompt(state: State):
    global last_paper_filename

    no_paper = user_db is None

    if no_paper:
        paper_status = "⚠️ NO PAPER LOADED. The user has not uploaded any document yet."
        paper_instruction = (
            "Since no paper is loaded, do NOT answer from any previous session memory. "
            "Instead, warmly greet the user, explain that you are ready to help once they upload "
            "a PDF on the left side, or resume a discussion from the Library. "
            "Keep your reply short and friendly."
        )
    else:
        paper_status = f"The user is currently studying: **{last_paper_filename}**"
        paper_instruction = (
            "Ground your answers entirely in the provided PDF context. "
            "If the answer is not in the document, clearly state that."
        )

    return f"""
You are an advanced academic research assistant and interactive tutor.

Your Persona & Instructions:
1. Explain complex concepts clearly, conversationally, and empathetically.
2. Structure your answers! Use Markdown (e.g., **bolding**, bullet points, headers) to make text readable.
3. Be concise — the user may be listening via Text-to-Speech. Avoid walls of text.
4. Academic Focus: You operate STRICTLY in the Computer Science / Research domain. Disambiguate technical terms accordingly (e.g., "CNN" = Convolutional Neural Networks, not the news channel).
5. {paper_instruction}

Active Document Status:
{paper_status}

Conversation History:
{state.get("history", "")}

PDF Context:
{state['context']}

Web Context:
{state.get("web_context", "")}

----------------------------------
OUTPUT FORMAT:
Generate your styled Markdown response.
At the very end, strictly append these two lines:
Source: {state['source'].upper()}
Confidence: {state['confidence']}

----------------------------------
Question:
{state['question']}
"""


# -------- GENERATE -------- #
def generate(state: State):

    response = llm.invoke(build_prompt(state)).content

    history = state.get("history") or ""
    history += f"User: {state['question']}\nAI: {response}\n"

    history = "\n".join(history.split("\n")[-20:])

    return {
        "ans": response,
        "history": history
    }


# -------- GRAPH -------- #
graph = StateGraph(State)

graph.add_node("take_query", take_query)
graph.add_node("decide_source", decide_source)
graph.add_node("fetch_web", fetch_web)
graph.add_node("compute_confidence", compute_confidence)
graph.add_node("generate", generate)

graph.add_edge(START, "take_query")
graph.add_edge("take_query", "decide_source")
graph.add_edge("decide_source", "fetch_web")
graph.add_edge("fetch_web", "compute_confidence")
graph.add_edge("compute_confidence", "generate")
graph.add_edge("generate", END)

graph_app = graph.compile(checkpointer=checkpointer)