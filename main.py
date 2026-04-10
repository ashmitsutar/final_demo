from fastapi import FastAPI, UploadFile, File, Form, Query, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
import shutil, os, tempfile
import urllib.request, urllib.parse, json

import requests
import model
import textExtraction
from textExtraction import load_user_pdf
import ai_tutor

from faster_whisper import WhisperModel

# -------- WHISPER -------- #
whisper_model = WhisperModel("base", device="cpu", compute_type="int8")

# -------- PIPER TTS CONFIG (with Env Var fallbacks for deployment) -------- #
PIPER_PATH = os.getenv("PIPER_PATH", "D:/piper/piper.exe")
MODEL_PATH = os.getenv("PIPER_MODEL_PATH", "D:/piper/voices/en_US-lessac-medium.onnx")
CONFIG_PATH = os.getenv("PIPER_CONFIG_PATH", "D:/piper/voices/en_US-lessac-medium.onnx.json")
ESPEAK_PATH = os.getenv("PIPER_ESPEAK_PATH", "D:/piper/espeak-ng-data")

app = FastAPI()

@app.middleware("http")
async def add_no_cache_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response

# -------- DB HELPERS -------- #
import sqlite3
def get_db_conn():
    conn = sqlite3.connect("chatbot.db", check_same_thread=False)
    return conn

# -------- STATIC -------- #
app.mount("/static", StaticFiles(directory="static"), name="static")

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# -------- ROUTES -------- #
@app.get("/")
def home():
    return FileResponse("templates/index.html")

@app.get("/study")
def study():
    return FileResponse("templates/study.html")

@app.get("/papers")
def papers():
    # Library - now for Discussions
    return FileResponse("templates/papers.html")

@app.get("/saved")
def saved_page():
    # Saved - now for Repository (Papers)
    return FileResponse("templates/saved.html")

@app.get("/trending")
def trending():
    return FileResponse("templates/trending.html")

@app.get("/commands")
def commands():
    return FileResponse("templates/commands.html")

@app.get("/tutor")
@app.get("/ai-tutor")
def tutor_page():
    return FileResponse("templates/tutor.html")

@app.get("/trending-papers")
def trending_papers(query: str = Query("AI")):
    """Proxy for Semantic Scholar API to avoid browser CORS / rate-limit issues."""
    try:
        encoded = urllib.parse.quote(query)
        url = (
            f"https://api.semanticscholar.org/graph/v1/paper/search"
            f"?query={encoded}&limit=10&fields=title,authors,year,citationCount,externalIds"
        )
        req = urllib.request.Request(url, headers={"User-Agent": "AI-Research-Assistant/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            raw = resp.read().decode("utf-8")
        data = json.loads(raw)

        papers = []
        for p in data.get("data", []):
            paper_id = p.get("paperId", "")
            ss_url = f"https://www.semanticscholar.org/paper/{paper_id}" if paper_id else "#"
            doi = (p.get("externalIds") or {}).get("DOI", "")
            read_url = f"https://doi.org/{doi}" if doi else ss_url

            authors = p.get("authors", [])
            authors_str = ", ".join(a["name"] for a in authors[:3])
            if len(authors) > 3:
                authors_str += f" +{len(authors)-3} more"

            papers.append({
                "title":       p.get("title", "Untitled"),
                "authors":     authors_str or "Unknown Authors",
                "year":        p.get("year") or "N/A",
                "citations":   p.get("citationCount", 0),
                "url":         read_url,
                "ss_url":      ss_url,
            })

        return JSONResponse({"papers": papers})
    except Exception as e:
        return JSONResponse({"error": str(e), "papers": []}, status_code=500)

@app.get("/list-papers")
def list_papers():
    files = os.listdir(UPLOAD_DIR)
    return {"papers": [f for f in files if f.endswith(".pdf")]}

# -------- SAVED PAPERS -------- #
@app.post("/save-paper")
async def save_paper(filename: str = Form(...), title: str = Form(...)):
    try:
        conn = get_db_conn()
        c = conn.cursor()
        c.execute("INSERT OR IGNORE INTO saved_papers (title, filename) VALUES (?, ?)", (title, filename))
        conn.commit()
        return {"status": "saved"}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

@app.get("/list-saved-papers")
async def list_saved_papers():
    conn = get_db_conn()
    c = conn.cursor()
    c.execute("SELECT title, filename FROM saved_papers ORDER BY added_at DESC")
    rows = c.fetchall()
    return {"papers": [{"title": r[0], "filename": r[1]} for r in rows]}

@app.post("/remove-saved-paper")
async def remove_saved_paper(filename: str = Form(...)):
    conn = get_db_conn()
    c = conn.cursor()
    c.execute("DELETE FROM saved_papers WHERE filename = ?", (filename,))
    conn.commit()
    return {"status": "removed"}

@app.get("/study-search")
async def study_search(query: str):
    """Fuzzy search for a paper by title and return its filename."""
    conn = get_db_conn()
    c = conn.cursor()
    # Simple like search for now, could be improved with fuzzy matching
    c.execute("SELECT filename FROM saved_papers WHERE title LIKE ? LIMIT 1", (f"%{query}%",))
    row = c.fetchone()
    if row:
        return {"filename": row[0]}
    
    # Also search in general uploads
    files = os.listdir(UPLOAD_DIR)
    for f in files:
        if query.lower() in f.lower():
            return {"filename": f}
            
    return {"filename": None}

# -------- DISCUSSIONS (FOR LIBRARY) -------- #
@app.get("/list-discussions")
async def list_discussions():
    conn = get_db_conn()
    c = conn.cursor()
    # Ensure table exists
    c.execute("""CREATE TABLE IF NOT EXISTS discussions (
        thread_id TEXT PRIMARY KEY,
        paper_name TEXT,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    )""")
    c.execute("SELECT thread_id, paper_name, last_updated FROM discussions ORDER BY last_updated DESC")
    rows = c.fetchall()
    return {"discussions": [{"id": r[0], "paper": r[1], "date": r[2]} for r in rows]}

@app.post("/remove-discussion")
async def remove_discussion(thread_id: str = Form(...)):
    conn = get_db_conn()
    c = conn.cursor()
    c.execute("DELETE FROM discussions WHERE thread_id = ?", (thread_id,))
    # Also clear checkpoints if possible
    c.execute("DELETE FROM checkpoints WHERE thread_id = ?", (thread_id,))
    conn.commit()
    return {"status": "removed"}
import subprocess, uuid
from fastapi.responses import Response

@app.post("/tts")
async def tts(data: dict):
    text = data.get("text", "")
    if not text:
        return Response(status_code=400)

    # Clean text for safe execution
    text = text.replace('"', '').replace("'", "")

    output_file = os.path.join(tempfile.gettempdir(), f"tts_{uuid.uuid4().hex}.wav")

    try:
        process = subprocess.Popen(
            [
                PIPER_PATH,
                "-m", MODEL_PATH,
                "-c", CONFIG_PATH,
                "-f", output_file,
                "--espeak_data", ESPEAK_PATH
            ],
            stdin=subprocess.PIPE,
            text=True
        )

        process.communicate(text + "\n")

        if os.path.exists(output_file):
            with open(output_file, "rb") as f:
                audio = f.read()
            os.remove(output_file)
            return Response(content=audio, media_type="audio/wav")
        else:
            return Response(status_code=500)
    except Exception as e:
        print(f"TTS error: {e}")
        return Response(status_code=500)

# -------- CHAT -------- #
class Query(BaseModel):
    message: str
    thread_id: str

def run_chat(user_text, thread_id):
    state = {
        "question": user_text,
        "context": "",
        "source": "",
        "web_context": "",
        "confidence": "",
        "ans": ""
    }

    config = {"configurable": {"thread_id": thread_id}}
    result = model.graph_app.invoke(state, config=config)

    return result["ans"]

@app.post("/chat")
def chat(query: Query):
    ans = run_chat(query.message, query.thread_id)
    
    # Save/Update discussion metadata
    try:
        conn = get_db_conn()
        c = conn.cursor()
        c.execute("""CREATE TABLE IF NOT EXISTS discussions (
            thread_id TEXT PRIMARY KEY,
            paper_name TEXT,
            last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
        )""")
        paper_name = getattr(model, 'last_paper_filename', 'General Discussion')
        
        c.execute("""
            INSERT INTO discussions (thread_id, paper_name, last_updated)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(thread_id) DO UPDATE SET 
                last_updated=CURRENT_TIMESTAMP,
                paper_name=excluded.paper_name
        """, (query.thread_id, paper_name))
        conn.commit()
    except Exception as e:
        print(f"Chat metadata error: {e}")

    return {"response": ans}

class TutorQueryObj(BaseModel):
    message: str
    thread_id: str
    mode: str = "chat"
    is_story_mode: bool = False

@app.post("/tutor-chat")
def tutor_chat_endpoint(query: TutorQueryObj):
    try:
        ans_state = ai_tutor.get_tutor_response_from_graph(
            query.thread_id, 
            query.message, 
            mode=query.mode, 
            is_story_mode=query.is_story_mode
        )
        if isinstance(ans_state, dict):
            return {
                "response": ans_state.get("response", "Error getting response."),
                "plan": ans_state.get("plan", []),
                "current_step": ans_state.get("current_step", 0),
                "difficulty": ans_state.get("difficulty", "Beginner")
            }
        else:
            return {"response": str(ans_state)}
    except Exception as e:
        print(f"Tutor chat error: {e}")
        return {"response": "Error in tutor response."}

@app.get("/thread-info/{thread_id}")
def get_thread_info(thread_id: str):
    try:
        conn = get_db_conn()
        c = conn.cursor()
        c.execute("SELECT paper_name FROM discussions WHERE thread_id=?", (thread_id,))
        row = c.fetchone()
        if row:
            return {"paper_name": row[0]}
        return {"paper_name": None}
    except Exception as e:
        print(f"Error fetching thread info: {e}")
        return {"paper_name": None}

# -------- VOICE (WHISPER) -------- #
@app.post("/voice-chat")
async def voice_chat(file: UploadFile = File(...)):
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp:
        temp.write(await file.read())
        temp_path = temp.name

    segments, _ = whisper_model.transcribe(temp_path)
    os.remove(temp_path)

    user_text = "".join([seg.text for seg in segments]).strip()

    return {"user_text": user_text}

# -------- UPLOAD -------- #
@app.post("/remove-file")
async def remove_file(filename: str = Form(...)):
    try:
        path = os.path.join(UPLOAD_DIR, filename)
        if os.path.exists(path):
            os.remove(path)
        
        # Also remove from saved_papers if it exists there
        conn = get_db_conn()
        c = conn.cursor()
        c.execute("DELETE FROM saved_papers WHERE filename = ?", (filename,))
        conn.commit()
        
        return {"status": "removed"}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    filename = file.filename.replace(" ", "_")
    path = os.path.join(UPLOAD_DIR, filename)

    with open(path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    return {"filename": filename}

# -------- ADD FROM URL -------- #
@app.get("/add-paper-from-url")
async def add_paper_from_url(url: str, title: str = None):
    try:
        # Generate filename from title or URL
        if title:
            filename = title.replace(" ", "_").replace("/", "_") + ".pdf"
        else:
            filename = url.split("/")[-1]
            if not filename.endswith(".pdf"):
                filename = "document.pdf"
        
        path = os.path.join(UPLOAD_DIR, filename)

        # Download PDF
        response = requests.get(url, stream=True, timeout=15)
        response.raise_for_status()

        with open(path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)

        # Process automatically
        model.user_db = load_user_pdf(path)

        return {"status": "ready", "filename": filename}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

# -------- PROCESS -------- #
@app.post("/process_pdf")
async def process_pdf(filename: str = Form(...)):
    file_path = os.path.join(UPLOAD_DIR, filename)
    model.user_db = load_user_pdf(file_path)
    model.last_paper_path = file_path
    model.last_paper_filename = filename
    return {"status": "ready"}

# -------- CLEAR CONTEXT -------- #
@app.post("/clear-context")
async def clear_context():
    """Wipes the loaded paper from memory so AI starts fresh with no document."""
    model.user_db = None
    model.last_paper_filename = "General Discussion"
    return {"status": "cleared"}
