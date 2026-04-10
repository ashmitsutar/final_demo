# 🔬 AI Research Assistant — Accessible Academic Study Environment

> **A Fully Hands-Free, Voice-Controlled, and Gaze-Navigable AI Research Tool.** Built for the modern academic and designed specifically for accessibility (blind and motor-impaired users).

---

## ♿ Our Accessibility Mission
**Research should have no barriers.** This project is engineered for:
*   **The Blind Student**: Complete removal of visual dependency. Study any paper, listen to complex methodologies, and hold intelligent discussions using **only your voice**.
*   **The Motor-Impaired Researcher (No Hands)**: Complete removal of mouse/keyboard dependency. Navigate, scroll through pages, and select items using **only head movements and blinks**.

## 🤝 Project Vision
*This project was created to bridge the gap between AI research tools and digital accessibility. We believe that physical or visual impairments should never be a barrier to high-level academic research. Our goal is to empower every mind to explore the frontiers of human knowledge, regardless of physical ability.*

---

## 🏆 Hackathon Submission Highlights

*   **Zero-Calibration Gaze Control**: Uses MediaPipe FaceMesh for jitter-free, zero-setup head-tracking.
*   **Always-On Voice Navigation**: Integrated "Hey Assistant" wake-word system with real-time browser STT.
*   **Context-Aware RAG AI Engine**: Fast document comprehension using LangGraph and Retrieval-Augmented Generation.
*   **Empathic Academic Tutor**: AI persona specifically structured to explain complex methodologies and equations clearly.
*   **Inclusive UI/UX**: Premium blurred backgrounds ("Glassmorphism"), aesthetic animations, and full keyboard/voice navigation support.

---

## ✨ Core Features

### 🎙️ Hands-Free Accessibility (Blind Mode)
*   **Voice Control & STT**: Navigate pages, open papers from your library, and ask research questions using only your voice.
*   **Audio Feedback**: AI answers are read aloud using high-quality browser TTS (Text-to-Speech) with Markdown-stripping for clear listening.
*   **Visual Indicators**: Real-time pulsing glow indicators that change color based on whether the mic is listening, processing, or idle.

### 👁️ Head-Tracking Gaze (Motor-Impairment Support)
*   **Invisible Mouse**: Use natural head movements to control the cursor.
*   **Blink-to-Click**: Intelligent blink detection (right/left eye) for zero-handed item selection.
*   **Dwell Scrolling**: Hover near the top or bottom of the screen to smoothly scroll through PDFs.

### 🧠 Intelligent Study Environment
*   **RAG AI Assistant**: Ask anything about your uploaded PDF. The AI retrieves relevant chunks and provides grounded, academic-grade answers.
*   **Personal Research Library**: Save papers, resume discussions, and revisit previous research threads.
*   **Trending Research**: Search the latest papers from Semantic Scholar and link them directly to your study environment in one click.

---

## 🛠️ Technology Stack
*   **Frontend**: HTML5, Vanilla CSS3 (Glassmorphism), JavaScript (ES6+).
*   **Backend**: Python 3.10+, FastAPI (Asynchronous handling).
*   **AI & Logic**: LangGraph, SQLite (Persistent conversation checkpointing).
*   **External APIs**: Semantic Scholar API (Trending papers proxy).
*   **Tracking & Speech**: MediaPipe FaceMesh, Speech API (STT & TTS).

---

## 🚀 Getting Started

### Prerequisites
*   Python 3.10 or higher.
*   Modern browser with Camera and Microphone access enabled.

### Installation
1.  **Clone the Repo**:
    ```bash
    git clone [your-repo-link]
    cd project2
    ```

2.  **Install Dependencies**:
    ```bash
    pip install -r requirements.txt
    ```

3.  **Setup Database**:
    ```bash
    python init_db.py
    ```

4.  **Launch Server**:
    ```bash
    python -m uvicorn main:app --port 9000 --reload
    ```

5.  **Access the App**:
    Open `http://localhost:9000` in your browser.

---

## 💡 Accessibility Shortcuts
*   **Shift + H**: Toggle Hands-Free / Voice Mode.
*   **Shift + G**: Toggle Head-Tracking / Gaze Mode.
*   **Spacebar**: Stop the current AI speech response.
*   **Arrow Keys**: Quick navigation between pages.
