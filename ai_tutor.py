from langchain_openai import ChatOpenAI
import sqlite3
import json
import re
from dotenv import load_dotenv

load_dotenv()

# Using gpt-4o-mini for speed and cost-efficiency, perfect for a fast tutor
llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.3)

# -------- DB HELPERS -------- #
def get_db_conn():
    """Returns a connection to the SQLite database and ensures the sessions table exists."""
    conn = sqlite3.connect("chatbot.db", check_same_thread=False)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS tutor_sessions (
            thread_id TEXT PRIMARY KEY,
            state_json TEXT
        )
    """)
    conn.commit()
    return conn

def get_tutor_response_from_graph(thread_id: str, user_input: str, mode: str = "chat", is_story_mode: bool = False):
    """
    Main entry point for tutor responses. 
    Manages session state in SQLite to be fast and deployment-friendly.
    """
    conn = get_db_conn()
    c = conn.cursor()
    
    # Fetch existing state
    c.execute("SELECT state_json FROM tutor_sessions WHERE thread_id=?", (thread_id,))
    row = c.fetchone()
    
    if row and row[0]:
        state = json.loads(row[0])
    else:
        state = {
            "goal": "",
            "plan": [],
            "current_step": 0,
            "difficulty": "Beginner",
            "history": []
        }
        
    current_plan = state.get('plan') or []
    current_idx = state.get('current_step', 0)
    # Bounds check
    if current_idx >= len(current_plan) and len(current_plan) > 0:
        current_idx = len(current_plan) - 1
        
    current_step_name = current_plan[current_idx] if (current_plan and current_idx < len(current_plan)) else "Not started"
    
    style_instruction = "Be an encouraging, interactive tutor."
    if is_story_mode:
        style_instruction = "IMPORTANT: Use STORY MODE. Explain concepts through a running narrative, immersive analogies, or fictional scenarios. Keep the 'student' engaged in the story."
    
    if mode == "voice":
        style_instruction = """
        VOICE MODE: Be a knowledgeable and precise human companion. 
        Speak clearly in 3 to 4 well-structured sentences. 
        Focus on providing high-quality, accurate information while staying casual and friendly. 
        Avoid long-winded lecturing, but ensured the technical details are correct.
        Do not output formal 'Options' blocks in your spoken text.
        """

    history_str = ""
    history_entries = state.get('history', [])
    for entry in history_entries[-3:]:
        history_str += f"Student: {entry.get('user')}\nTutor: {entry.get('ai')}\n\n"

    # Precise indexing instructions to prevent UI desync
    prompt = f"""
    You are an advanced AI Tutor Manager. 
    CURRENT MODE: {mode} (voice = short/human, chat = detailed)
    STYLE: {style_instruction}
    
    [STRICT INDEXING RULE]
    - 'current_step' in JSON is a 0-based integer index.
    - Topic 1 = index 0, Topic 2 = index 1... 
    
    SESSION CONTEXT:
    - Overall Goal: "{state.get('goal', 'Undetermined')}"
    - Current Index (Last Turn): {current_idx}
    - Current Topic: "{current_step_name}"
    - Full Plan: {current_plan}
    - Difficulty: {state.get('difficulty', 'Beginner')}
    
    RECENT HISTORY:
    {history_str}
    
    NEW USER INPUT: "{user_input}"
    
    DECISION LOGIC:
    1. If user asks a question or chats naturally: 
       - KEEP 'current_step' index at {current_idx}.
       - Reply directly to the input.
    2. If user says "next", "continue", etc:
       - INCREMENT 'current_step' and teach the new topic.
    3. If new goal: Reset plan.

    REQUIRED OUTPUT FORMAT (Strict JSON):
    {{
      "intent": "question" | "next" | "goal" | "chat",
      "goal": "the overall goal",
      "plan": {current_plan if current_plan else '["Initial Step", "...", "...", "...", "..."]'},
      "current_step": integer,
      "response": "Your spoken response.",
      "difficulty": "student level"
    }}
    
    {'' if mode == "voice" else 'Note: Always end the response with **Options:** block.'}
    """
    
    try:
        response = llm.invoke(prompt)
        res_content = response.content
        
        json_match = re.search(r"\{.*\}", res_content, re.DOTALL)
        data = json.loads(json_match.group(0) if json_match else res_content)
        
        # Sync state
        state["goal"] = data.get("goal", state["goal"])
        state["plan"] = data.get("plan", state["plan"])
        state["current_step"] = data.get("current_step", state["current_step"])
        state["difficulty"] = data.get("difficulty", state["difficulty"])
        
        response_text = data.get("response", "I'm having a bit of trouble. Could you say that again?")
        
        # Even if we don't output Options in prompt, if LLM added them, we strip for voice
        if mode == "voice":
            response_text = response_text.split("**Options:**")[0].split("Options:")[0].strip()

        state["history"].append({"user": user_input, "ai": response_text})
        state["history"] = state["history"][-10:]
        
        c.execute("""
            INSERT INTO tutor_sessions (thread_id, state_json) 
            VALUES (?, ?) 
            ON CONFLICT(thread_id) DO UPDATE SET state_json=excluded.state_json
        """, (thread_id, json.dumps(state)))
        conn.commit()
        
        return {
            "response": response_text,
            "plan": state["plan"],
            "current_step": state["current_step"],
            "difficulty": state["difficulty"]
        }
    except Exception as e:
        print(f"Tutor Error: {e}")
        return {"response": "System busy."}





