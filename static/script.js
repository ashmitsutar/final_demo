let uploadedFile = null;
let currentPageList = []; // Numeric lookup for the current page
let confirmationCallback = null; // Used for "Yes / No" confirmation prompts
let currentThreadId = new URLSearchParams(window.location.search).get('thread');

// -------- UPLOAD PDF --------
async function uploadPDF() {
    const fileInput = document.getElementById("pdf-upload");
    const file = fileInput.files[0];

    if (!file) return alert("Select PDF");

    const formData = new FormData();
    formData.append("file", file);

    const uploadBtn = document.querySelector(".upload-control button");
    const ogText = uploadBtn.innerText;
    uploadBtn.innerText = "Uploading...";
    uploadBtn.disabled = true;

    try {
        const res = await fetch("/upload", {
            method: "POST",
            body: formData
        });

        const data = await res.json();
        uploadedFile = data.filename;

        await fetch("/process_pdf", {
            method: "POST",
            body: new URLSearchParams({
                filename: uploadedFile
            })
        });

        uploadBtn.innerText = "Loaded!";
        speakText("PDF loaded successfully.");

        setTimeout(() => {
            uploadBtn.innerText = ogText;
            uploadBtn.disabled = false;
        }, 2000);

        loadPDF(`/uploads/${uploadedFile}`);

    } catch (err) {
        console.error("Upload error", err);
        uploadBtn.innerText = "Error";
        uploadBtn.disabled = false;
    }
}

async function uploadFromLibrary() {
    const fileInput = document.getElementById("lib-upload");
    if (!fileInput) return;
    const file = fileInput.files[0];

    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
        speakText("Uploading new paper to your repository.");
        const res = await fetch("/upload", {
            method: "POST",
            body: formData
        });

        const data = await res.json();
        const filename = data.filename;

        await fetch("/process_pdf", {
            method: "POST",
            body: new URLSearchParams({ filename: filename })
        });

        speakText("Paper processed and added to repository.");
        loadRepositoryList();
    } catch (err) {
        console.error("Library upload error", err);
        speakText("Sorry, there was an error uploading the paper.");
    }
}


// -------- LOAD PDF --------
async function loadPDF(url) {
    const container = document.getElementById("pdf-container");
    if (!container) return;

    container.innerHTML = "<p>Loading PDF...</p>";

    try {
        const pdf = await pdfjsLib.getDocument(url).promise;
        container.innerHTML = "";

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const canvas = document.createElement("canvas");
            const context = canvas.getContext("2d");
            const viewport = page.getViewport({ scale: 1.2 });

            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;
            container.appendChild(canvas);
        }
        if (typeof isHandsFreeON !== 'undefined' && isHandsFreeON) {
            speakText("Successful");
        }
    } catch (err) {
        console.error("PDF load error:", err);
        container.innerHTML = "<p>Error loading PDF</p>";
        if (typeof isHandsFreeON !== 'undefined' && isHandsFreeON) {
            speakText("Error");
        }
    }
}

// -------- MARKDOWN STRIPPER (for clean TTS) --------
function stripMarkdown(text) {
    if (!text) return '';
    return text
        // Remove code blocks (``` or ~~~)
        .replace(/```[\s\S]*?```/g, '')
        .replace(/~~~[\s\S]*?~~~/g, '')
        // Remove inline code `code`
        .replace(/`[^`]*`/g, '')
        // Remove headings (# ## ### etc.)
        .replace(/^#{1,6}\s+/gm, '')
        // Remove bold+italic ***text*** or ___text___
        .replace(/\*{3}([^*]+)\*{3}/g, '$1')
        .replace(/_{3}([^_]+)_{3}/g, '$1')
        // Remove bold **text** or __text__
        .replace(/\*{2}([^*]+)\*{2}/g, '$1')
        .replace(/_{2}([^_]+)_{2}/g, '$1')
        // Remove italic *text* or _text_
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/_([^_]+)_/g, '$1')
        // Remove horizontal rules
        .replace(/^[-*_]{3,}\s*$/gm, '')
        // Remove blockquotes >
        .replace(/^>\s*/gm, '')
        // Remove bullet list markers (- * + at line start)
        .replace(/^[\s]*[-*+]\s+/gm, '')
        // Remove numbered list markers (1. 2. etc.)
        .replace(/^[\s]*\d+\.\s+/gm, '')
        // Remove links [text](url) → text
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        // Remove image tags ![alt](url)
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '')
        // Remove HTML tags
        .replace(/<[^>]+>/g, '')
        // Collapse multiple blank lines
        .replace(/\n{3,}/g, '\n\n')
        // Trim
        .trim();
}

// -------- BROWSER NATIVE TEXT TO SPEECH --------
let currentSpeakingBtn = null;

function stopSpeech() {
    window.speechSynthesis.cancel();
    if (currentSpeakingBtn) {
        currentSpeakingBtn.innerHTML = "🔊";
        currentSpeakingBtn = null;
    }
}

function speakText(text, btn) {
    if (!text) return;

    // Strip all markdown symbols so TTS doesn't read **, ##, -- etc.
    const cleanText = stripMarkdown(text);
    if (!cleanText) return;

    console.log("Browser TTS Speaking:", cleanText);

    // Stop any existing speech
    stopSpeech();

    if (btn) {
        btn.innerHTML = "⌛";
        currentSpeakingBtn = btn;
    }

    const utterance = new SpeechSynthesisUtterance(cleanText);

    // Aesthetic settings for browser voice
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onstart = () => {
        if (btn) btn.innerHTML = "🛑";
        document.querySelectorAll('.voice-visualizer').forEach(v => v.classList.add('speaking'));
    };

    utterance.onend = () => {
        if (btn) btn.innerHTML = "🔊";
        currentSpeakingBtn = null;
        document.querySelectorAll('.voice-visualizer').forEach(v => v.classList.remove('speaking'));
    };

    utterance.onerror = (e) => {
        console.error("TTS Error:", e);
        if (btn) btn.innerHTML = "🔊";
        currentSpeakingBtn = null;
        document.querySelectorAll('.voice-visualizer').forEach(v => v.classList.remove('speaking'));
    };

    window.speechSynthesis.speak(utterance);
}

// -------- VOICE INDICATOR --------
// States: listening → RED, processing/executing → YELLOW, on/done → GREEN flash, off → grey
function updateVoiceIndicator(state) {
    const ind = document.getElementById("voice-indicator");
    const container = document.getElementById("voice-status-container");
    const text = document.getElementById("voice-status-text");
    if (!ind || !container || !text) return;

    // Set data-state attribute — CSS uses this for color
    ind.dataset.state = state;
    container.dataset.state = state;

    if (state === 'listening') {
        container.classList.add('on');
        text.innerText = "LISTENING";
    } else if (state === 'processing') {
        container.classList.add('on');
        text.innerText = "PROCESSING";
    } else if (state === 'executing') {
        container.classList.add('on');
        text.innerText = "EXECUTING";
    } else if (state === 'on') {
        container.classList.add('on');
        text.innerText = "DONE";
        // Briefly show green "done" state then switch to standby after 1.2s
        setTimeout(() => {
            if (ind.dataset.state === 'on') {
                ind.dataset.state = 'standby';
                container.dataset.state = 'standby';
                text.innerText = "ACTIVE";
            }
        }, 1200);
    } else if (state === 'off') {
        container.classList.remove('on');
        ind.dataset.state = 'off';
        container.dataset.state = 'off';
        text.innerText = "OFFLINE";
    }
}

// -------- NAVIGATION FEEDBACK --------
function navigateTo(url, name) {
    if (isHandsFreeON) {
        speakText("Navigating to " + name);
        updateVoiceIndicator('executing');
        setTimeout(() => window.location.href = url, 1200);
    } else {
        window.location.href = url;
    }
}

// -------- KEYBOARD NAVIGATION --------
const pages = [
    { url: "/", name: "Home" },
    { url: "/study", name: "Study" },
    { url: "/papers", name: "Library" },
    { url: "/saved", name: "Repository" },
    { url: "/trending", name: "Trending" }
];

document.addEventListener("keydown", (e) => {
    // Shift + H to toggle Hands-Free
    if (e.shiftKey && e.code === "KeyH") {
        e.preventDefault();
        toggleHandsFree();
        return;
    }

    // Shift + G to toggle Gaze
    if (e.shiftKey && e.code === "KeyG") {
        e.preventDefault();
        if (typeof toggleGaze === 'function') toggleGaze();
        return;
    }

    // Spacebar to stop speech
    if (e.code === "Space") {
        if (window.speechSynthesis.speaking) {
            e.preventDefault();
            stopSpeech();
            updateVoiceIndicator('on');
            return;
        }
    }

    if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA") return;

    let currentIndex = pages.findIndex(p => p.url === window.location.pathname);
    if (currentIndex === -1) currentIndex = 0;

    if (e.key === "ArrowRight") {
        let nextIndex = (currentIndex + 1) % pages.length;
        navigateTo(pages[nextIndex].url, pages[nextIndex].name);
    } else if (e.key === "ArrowLeft") {
        let prevIndex = (currentIndex - 1 + pages.length) % pages.length;
        navigateTo(pages[prevIndex].url, pages[prevIndex].name);
    }
});

// -------- TEXT CHAT --------
async function sendMessage() {
    const input = document.getElementById("user-input");
    const message = input.value;
    if (!message) return;

    addMessage(message, "user");
    input.value = "";

    if (!currentThreadId) {
        currentThreadId = "chat_" + Date.now();
        // Update URL so refreshing maintains context
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set('thread', currentThreadId);
        window.history.pushState({ path: newUrl.href }, '', newUrl.href);
    }

    try {
        updateVoiceIndicator('processing');
        const res = await fetch("/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: message, thread_id: currentThreadId })
        });
        const data = await res.json();
        addMessage(data.response, "ai");
        updateVoiceIndicator('on');
        if (isHandsFreeON) speakText(data.response);
    } catch (err) {
        console.error("Chat error", err);
        addMessage("Error occurred", "ai");
        updateVoiceIndicator('on');
    }
}

// -------- DASHBOARD LOADING --------
function prepareListReading(items, type) {
    currentPageList = items;
    if (isHandsFreeON && items.length > 0) {
        setTimeout(() => {
            confirmationCallback = () => {
                let text = `There are ${items.length} items. `;
                items.forEach((item, index) => {
                    const title = type === 'paper' ? item : item.paper;
                    text += `Number ${index + 1}. ${title}. `;
                });
                speakText(text);
                confirmationCallback = null;
            };
            speakText(`Found ${items.length} ${type === 'paper' ? 'papers' : 'discussions'}. Should I read the titles?`);
        }, 1500);
    }
}

async function loadRepositoryList() {
    const grid = document.getElementById("repo-grid");
    if (!grid) return;
    grid.innerHTML = "Loading Repository...";

    try {
        const res = await fetch("/list-papers");
        const data = await res.json();
        grid.innerHTML = "";

        if (!data.papers || data.papers.length === 0) {
            grid.innerHTML = "<p>Your repository is empty. Upload your first paper!</p>";
            return;
        }

        data.papers.forEach((file, index) => {
            const card = document.createElement("div");
            card.className = "paper-card";
            card.innerHTML = `
                <div class="numeric-tag">${index + 1}</div>
                <div class="icon">📄</div>
                <div class="title">${file}</div>
                <div class="btn-group">
                    <button onclick="window.location.href='/study?file=${file}'">Study</button>
                    <button onclick="removeFile('${file}')" class="remove-btn">Delete</button>
                </div>
            `;
            grid.appendChild(card);
        });

        // Advanced Accessibility - Ask to Read
        prepareListReading(data.papers, 'paper');

    } catch (err) {
        console.error(err);
        grid.innerHTML = "Error loading repository";
    }
}

async function loadDiscussions() {
    const grid = document.getElementById("discussions-grid");
    if (!grid) return;
    grid.innerHTML = "Loading Discussion History...";

    try {
        const res = await fetch("/list-discussions");
        const data = await res.json();
        grid.innerHTML = "";

        if (!data.discussions || data.discussions.length === 0) {
            grid.innerHTML = "<p>No previous discussions found.</p>";
            return;
        }

        data.discussions.forEach((d, index) => {
            const card = document.createElement("div");
            card.className = "paper-card";
            card.innerHTML = `
                <div class="numeric-tag">${index + 1}</div>
                <div class="icon">💬</div>
                <div class="title">${d.paper}</div>
                <div style="font-size: 0.85rem; color: #64748b; margin-top: -10px;">
                    Last updated: ${new Date(d.date).toLocaleDateString()}
                </div>
                <div class="btn-group">
                    <button onclick="window.location.href='/study?thread=${d.id}'">Resume Discussion</button>
                    <button onclick="removeDiscussion('${d.id}')" class="remove-btn">Archive</button>
                </div>
            `;
            grid.appendChild(card);
        });

        // Advanced Accessibility - Ask to Read
        prepareListReading(data.discussions, 'discussion');

    } catch (err) {
        console.error(err);
        grid.innerHTML = "Error loading discussion history";
    }
}

async function removeFile(filename) {
    if (!confirm("Are you sure you want to delete this paper?")) return;
    try {
        const formData = new FormData();
        formData.append("filename", filename);
        await fetch("/remove-file", { method: "POST", body: formData });
        speakText("Paper deleted from repository.");
        loadRepositoryList();
    } catch (e) {
        console.error(e);
    }
}

async function removeDiscussion(id) {
    if (!confirm("Archive this discussion?")) return;
    try {
        const formData = new FormData();
        formData.append("thread_id", id);
        await fetch("/remove-discussion", { method: "POST", body: formData });
        speakText("Discussion archived.");
        loadDiscussions();
    } catch (err) { console.error(err); }
}

// -------- TRENDING PAPERS --------
async function loadTrending(category, btn) {
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    const container = document.getElementById("trending-container");
    if (!container) return;

    container.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px;">
            <div class="voice-indicator" data-state="processing" style="margin: 0 auto 15px;"></div>
            <p>Searching the latest ${category} research...</p>
        </div>
    `;

    try {
        const res = await fetch(`/trending-papers?query=${encodeURIComponent(category)}`);
        const data = await res.json();
        container.innerHTML = "";

        if (data.error) {
            if (data.status === 429 || data.error.includes("429")) {
                container.innerHTML = `
                    <div style="grid-column: 1/-1; text-align: center; padding: 40px;">
                        <div class="icon" style="font-size: 3rem; margin-bottom: 15px;">⏳</div>
                        <h3>Slow down a bit...</h3>
                        <p>Semantic Scholar API is rate-limiting requests. Please wait a minute and try again.</p>
                        <button class="cat-btn" onclick="loadTrending('${category}', null)" style="margin-top: 15px;">Retry Now</button>
                    </div>
                `;
            } else {
                container.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: #ef4444;">API Error: ${data.error}</p>`;
            }
            return;
        }

        if (data.papers && data.papers.length > 0) {
            const seen = new Set();

            data.papers.forEach(p => {
                const key = p.url || p.title;
                if (seen.has(key)) return;
                seen.add(key);

                // Scrub title for HTML safety
                const safeTitle = p.title.replace(/'/g, "\\'").replace(/"/g, "&quot;");

                const card = document.createElement("div");
                card.className = "paper-card trending-card";
                card.innerHTML = `
                    <div class="icon" style="font-size: 1.5rem; margin-bottom: 5px;">🔥</div>
                    <div class="title" style="margin-bottom:10px; min-height: 2.8em; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;" title="${safeTitle}">${p.title}</div>
                    <p style="font-size:0.85rem; color:#64748b; margin-bottom: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${p.authors}</p>
                    <p style="font-size:0.8rem; margin:5px 0; font-weight: 600; color: var(--accent);">
                        ${p.year} • <span style="opacity: 0.8;">${p.citations} Citations</span>
                    </p>
                    <div class="btn-group" style="margin-top: 15px;">
                        <button onclick="studyPaper('${p.url}', '${safeTitle}')" class="save-btn">Link & Study</button>
                        <a href="${p.url}" target="_blank" style="flex:1;"><button style="width:100%;">Source</button></a>
                    </div>
                `;
                container.appendChild(card);
            });
        } else {
            container.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 40px;">
                    <p>No papers found for "${category}". Try another category or search term.</p>
                </div>
            `;
        }
    } catch (err) {
        console.error("Trending error:", err);
        container.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: #ef4444;">Connection Error. Please ensure the local server is running.</p>`;
    }
}

async function studyPaper(url, title) {
    const studyBtn = event.target;
    studyBtn.innerText = "Linking...";
    try {
        const res = await fetch(`/add-paper-from-url?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`);
        const data = await res.json();
        if (data.status === "ready") {
            window.location.href = `/study?file=${data.filename}`;
        }
    } catch (err) { console.error(err); }
}

// -------- COMMON UI UTILS --------
function addMessage(text, type) {
    const chatBox = document.getElementById("chat-box");
    if (!chatBox) return;

    const div = document.createElement("div");
    div.className = "message " + type;

    if (type === "ai") {
        div.innerHTML = marked.parse(text);
        const btn = document.createElement("button");
        btn.innerHTML = "🔊";
        btn.className = "read-aloud-btn";
        btn.onclick = () => speakText(text, btn);
        div.appendChild(btn);
    } else {
        div.textContent = text;
    }
    chatBox.appendChild(div);
    chatBox.scrollTo({ top: chatBox.scrollHeight, behavior: 'smooth' });
}

// -------- HANDS-FREE (BROWSER NATIVE STT) --------
let isHandsFreeON = localStorage.getItem("handsFree") === "true";
// isAlwaysListening: true  = mic restarts automatically after every result (great for blind users)
//                   false = mic stops after result; user must press Shift+H or click to re-activate
let isAlwaysListening = localStorage.getItem("alwaysListening") !== "false"; // default ON
let recognition = null;
let micActive = false; // tracks whether mic is currently running

function toggleHandsFree() {
    isHandsFreeON = !isHandsFreeON;
    localStorage.setItem("handsFree", isHandsFreeON);

    // Only speak the activation message when the button is manually clicked (not on page load)
    if (isHandsFreeON) {
        speakText("Hands free mode activated.");
        sessionStorage.setItem('hf_announced_first_time', 'true');
    } else {
        speakText("Hands free mode deactivated.");
    }

    initHandsFreeUI();
}

function initHandsFreeUI() {
    const btn = document.getElementById("hf-toggle");
    const alBtn = document.getElementById("al-toggle");
    if (btn) {
        if (isHandsFreeON) {
            btn.innerHTML = "Hands-Free: ON 🎙️";
            btn.className = "hf-btn on";
        } else {
            btn.innerHTML = "Hands-Free: OFF";
            btn.className = "hf-btn off";
        }
    }
    if (alBtn) {
        alBtn.innerHTML = isAlwaysListening ? "👂 Always: ON" : "👂 Always: OFF";
        alBtn.className = isAlwaysListening ? "hf-btn on al-btn" : "hf-btn off al-btn";
    }

    if (isHandsFreeON) {
        // If this is the FIRST time we are turning it on in this session, announce it
        // Otherwise, if it's just a page load navigation, stay SILENT.
        if (!sessionStorage.getItem('hf_announced_first_time')) {
            speakText("Hands free mode activated and listening.");
            sessionStorage.setItem('hf_announced_first_time', 'true');
        }
        updateVoiceIndicator('on');
        startListening();
    } else {
        updateVoiceIndicator('off');
        stopListening();
    }
}

function toggleAlwaysListening() {
    isAlwaysListening = !isAlwaysListening;
    localStorage.setItem("alwaysListening", isAlwaysListening);
    const msg = isAlwaysListening
        ? "Always listening mode on. Microphone will restart automatically."
        : "Always listening mode off. Microphone stops after each command. Press Shift H to listen again.";
    speakText(msg);
    initHandsFreeUI();
}

function stopListening() {
    micActive = false;
    if (recognition) { try { recognition.stop(); } catch (e) { } }
}
function startListening() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        alert("Browser doesn't support Speech Recognition.");
        isHandsFreeON = false;
        initHandsFreeUI();
        return;
    }

    if (micActive) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();

    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    let lastSpeechTime = Date.now();

    recognition.onstart = () => {
        micActive = true;
        updateVoiceIndicator('listening');
        console.log("STT started");
    };

    recognition.onresult = (event) => {
        lastSpeechTime = Date.now(); // 🔥 track activity

        const transcript = event.results[event.results.length - 1][0].transcript.toLowerCase().trim();
        processOfflineCommand(transcript);
    };

    recognition.onerror = () => {
        micActive = false;
    };

    recognition.onend = () => {
        micActive = false;

        if (isHandsFreeON || isAlwaysListening) {
            setTimeout(() => {
                try { startListening(); } catch (e) { }
            }, 500);
        } else {
            updateVoiceIndicator('off');
        }
    };

    try {
        recognition.start();
    } catch (e) {
        setTimeout(() => startListening(), 1000);
    }

    // 🔥 CRITICAL: proactive reset every 10 sec
    if (!window.forceRestartLoop) {
        window.forceRestartLoop = setInterval(() => {
            if (!(isHandsFreeON || isAlwaysListening)) return;

            const now = Date.now();
            const silenceTime = now - lastSpeechTime;

            // 🔥 if silent OR running too long → reset
            if (silenceTime > 7000) {
                console.log("Force restarting due to silence...");

                try { recognition.stop(); } catch (e) { }
                micActive = false;

                setTimeout(() => {
                    try { startListening(); } catch (e) { }
                }, 7000);
            }
        }, 15000);
    }
}
async function processOfflineCommand(transcript) {
    console.log("Browser Transcript:", transcript);
    const wakeWords = ["assistant", "computer", "ai", "research"];
    let command = "";

    // Check for wake words
    for (let w of wakeWords) {
        if (transcript.includes(w)) {
            command = transcript.split(w).pop().trim();
            break;
        }
    }

    if (!command) {
        updateVoiceIndicator('listening');
        return;
    }

    updateVoiceIndicator('executing');
    console.log("Executing Command:", command);

    // If hands-free is OFF, we ONLY allow the activation command
    if (!isHandsFreeON) {
        if (command.includes("activate hands free") || command.includes("turn on hands free")) {
            toggleHandsFree();
            return;
        }
        // Filter out everything else in standby
        updateVoiceIndicator('off');
        return;
    }

    // Special Command: TYPE [message]
    if (command.startsWith("type ")) {
        let msg = command.replace("type ", "").trim();
        const input = document.getElementById("user-input") || document.getElementById("tutor-input");
        if (input) {
            input.value = msg;
            if (window.location.pathname === "/tutor") {
                if (typeof sendTutorMessage === 'function') sendTutorMessage(msg);
            } else {
                sendMessage();
            }
        }
        return;
    }

    // NAVIGATION COMMANDS
    if (command.includes("go home") || command.includes("go to home")) navigateTo("/", "Home");
    else if (command.includes("go to library") || command.includes("discussions")) navigateTo("/papers", "Library");
    else if (command.includes("go to repository") || command.includes("saved")) navigateTo("/saved", "Repository");
    else if (command.includes("go to trending")) navigateTo("/trending", "Trending");
    else if (command.includes("go to study")) navigateTo("/study", "Study");
    else if (command.includes("read all commands") || command.includes("special one")) navigateTo("/commands?autostart=true", "Commands Reference");
    else if (command.includes("go to command") || command.includes("brochure") || command.includes("what commands")) navigateTo("/commands", "Commands Reference");
    else if (command.includes("go to ai tutor") || command.includes("go to tutor") || command.includes("ai tutor") || command.includes("tutor")) navigateTo("/tutor", "AI Tutor");

    // BLIND ASSISTANCE: WHERE AM I?
    else if (command.includes("where am i") || command.includes("what is here") || command.includes("what's here")) {
        const path = window.location.pathname;
        let info = "";
        if (path === "/") info = "You are on the Home page. Latest research overview and quick start buttons are here.";
        else if (path === "/study") {
            const params = new URLSearchParams(window.location.search);
            const file = params.get('file');
            info = "You are in the Study Environment. " + (file ? "Currently studying: " + file : "No document is active.");
        }
        else if (path === "/papers") info = "You are in the Library. I have found " + (currentPageList.length || "no") + " previous discussions.";
        else if (path === "/saved") info = "You are in the Repository. You have " + (currentPageList.length || "no") + " uploaded papers here.";
        else if (path === "/trending") info = "You are in the Trending section. latest search results are currently displayed.";
        else if (path === "/commands") info = "You are in the Commands Brochure. I can read all specific voice commands for you.";

        speakText(info);
        updateVoiceIndicator('on');
    }

    // CONFIRMATION YES / NO
    else if (command === "yes") {
        if (confirmationCallback) {
            confirmationCallback();
            confirmationCallback = null;
        } else {
            speakText("I'm sorry, I wasn't expecting a yes or no. How can I help?");
            updateVoiceIndicator('listening');
        }
    }
    else if (command === "no") {
        speakText("Alright, cancelled.");
        confirmationCallback = null;
        updateVoiceIndicator('on');
    }

    // LIST SELECTION: OPEN PAPER [NUMBER]
    else if (command.includes("paper") || command.match(/\b\d+\b/)) {
        const numMatch = command.match(/\d+/);
        if (numMatch) {
            const index = parseInt(numMatch[0]) - 1;
            if (index >= 0 && index < currentPageList.length) {
                const item = currentPageList[index];
                const filename = typeof item === 'string' ? item : null;
                const threadId = item.id ? item.id : null;

                if (filename) {
                    speakText(`Opening paper ${index + 1}.`);
                    setTimeout(() => window.location.href = `/study?file=${filename}`, 1200);
                } else if (threadId) {
                    speakText(`Resuming discussion ${index + 1}.`);
                    setTimeout(() => window.location.href = `/study?thread=${threadId}`, 1200);
                }
            } else {
                speakText(`I'm sorry, there is no item number ${numMatch[0]} available here.`);
                updateVoiceIndicator('listening');
            }
        }
    }

    // SYSTEM & CHAT CONTROL COMMANDS
    else if (command.includes("start new chat")) {
        if (typeof promptNewChat === 'function') {
            promptNewChat();
        } else {
            speakText("You are not in the study environment to start a new chat.");
            updateVoiceIndicator('on');
        }
    }

    // STUDY CONTEXT COMMANDS
    else if (command.includes("study") || command.includes("open this")) {
        // ... (existing study search logic stays same)
        let paper = command.replace("study", "").replace("open this", "").replace("in", "").trim();

        if (!paper) {
            // Check if we are on a page with a list
            if (window.location.pathname === "/saved" || window.location.pathname === "/trending" || window.location.pathname === "/papers") {
                speakText("Please specify the title or the number of the paper you wish to study.");
                updateVoiceIndicator('listening');
                return;
            }
            navigateTo("/study", "Study");
            return;
        }

        const res = await fetch(`/study-search?query=${encodeURIComponent(paper)}`);
        const data = await res.json();
        if (data.filename) {
            speakText("Opening " + paper + " in study environment.");
            setTimeout(() => window.location.href = `/study?file=${data.filename}`, 1200);
        } else {
            speakText("I couldn't find a paper matching " + paper + " in your collection.");
            updateVoiceIndicator('listening');
        }
    }

    // SYSTEM COMMANDS
    else if (command.includes("deactivate hands free") || command.includes("turn off hands free")) {
        toggleHandsFree();
    }
    else if (command.includes("activate hands free") || command.includes("turn on hands free")) {
        speakText("Hands free mode is already active and listening.");
        updateVoiceIndicator('on');
    }
    else if (command.includes("stop") || command.includes("cancel") || command.includes("undo")) {
        stopSpeech();
        speakText("Action cancelled.");
        updateVoiceIndicator('on');
    }

    // CHAT COMMANDS (Explicit)
    else if (command.startsWith("type") || command.startsWith("ask") || command.startsWith("tell") || command.startsWith("say")) {
        let msg = command.replace(/^(type|ask|tell|say)\s+/, "").trim();
        if (msg) sendMessageViaVoice(msg);
        else {
            speakText("What would you like me to type?");
            updateVoiceIndicator('listening');
        }
    }

    // DEFAULT: Don't just send everything to chat unless it sounds like a question or prefix is used
    else {
        console.log("Ignored ambiguous command:", command);
        updateVoiceIndicator('listening');
    }
}

async function sendMessageViaVoice(msg) {
    if (!currentThreadId) {
        currentThreadId = "chat_" + Date.now();
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set('thread', currentThreadId);
        window.history.pushState({ path: newUrl.href }, '', newUrl.href);
    }

    updateVoiceIndicator('processing');
    addMessage(msg, "user");
    try {
        const res = await fetch("/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: msg, thread_id: currentThreadId })
        });
        const data = await res.json();
        addMessage(data.response, "ai");
        speakText(data.response);
        updateVoiceIndicator('on');
    } catch (e) {
        console.error(e);
        updateVoiceIndicator('on');
    }
}

// -------- INITIALIZATION --------
document.addEventListener("DOMContentLoaded", () => {
    initHandsFreeUI();
    const userInput = document.getElementById("user-input");
    if (userInput) userInput.addEventListener("keypress", (e) => { if (e.key === "Enter") sendMessage(); });

    const params = new URLSearchParams(window.location.search);
    const file = params.get('file');
    const thread = params.get('thread');

    if (file) {
        fetch("/process_pdf", { method: "POST", body: new URLSearchParams({ filename: file }) })
            .then(() => loadPDF(`/uploads/${file}`))
            .catch(console.error);
    } else if (thread) {
        fetch(`/thread-info/${thread}`)
            .then(res => res.json())
            .then(data => {
                if (data.paper_name && data.paper_name !== 'General Discussion') {
                    fetch("/process_pdf", { method: "POST", body: new URLSearchParams({ filename: data.paper_name }) })
                        .then(() => loadPDF(`/uploads/${data.paper_name}`))
                        .catch(console.error);
                }
            })
            .catch(console.error);
    }

    if (window.location.pathname === "/trending") {
        loadTrending('AI', document.querySelector('.cat-btn.active'));
    }
});