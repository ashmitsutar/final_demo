let tutorThreadId = "tutor_" + Date.now();
let tutorMode = "chat";
let currentPlan = [];
let currentStep = 0;
let isStoryMode = false;
let autoNextInterval = null;
let autoNextTimeout = null;
let countdownValue = 10;

async function setMode(mode) {
    tutorMode = mode;
    document.getElementById('chat-mode-btn').classList.toggle('active', mode === 'chat');
    document.getElementById('voice-mode-btn').classList.toggle('active', mode === 'voice');
    
    const overlay = document.getElementById('voice-overlay');
    overlay.style.display = mode === 'voice' ? 'flex' : 'none';

    if (mode === 'voice') {
        speakText("Transitioning to voice mode. How can I help you today?");
        // Ensure hands-free is ON if it wasn't
        if (!isHandsFreeON) toggleHandsFree();
    } else {
        speakText("Chat mode active.");
    }
}

function toggleStoryMode() {
    isStoryMode = !isStoryMode;
    const btn = document.getElementById('story-mode-btn');
    if (btn) {
        btn.innerText = `📖 Story Mode: ${isStoryMode ? 'ON' : 'OFF'}`;
        btn.classList.toggle('active', isStoryMode);
    }
    speakText(`Story mode is now ${isStoryMode ? 'enabled' : 'disabled'}.`);
}

async function sendTutorMessage(textOverride = null) {
    const input = document.getElementById("tutor-input");
    const message = textOverride || input.value;
    if (!message) return;

    if (!textOverride) {
        addTutorMessage(message, "user");
        input.value = "";
    }

    try {
        updateVoiceIndicator('processing');
        const res = await fetch("/tutor-chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                message: message, 
                thread_id: tutorThreadId,
                mode: tutorMode,
                is_story_mode: isStoryMode
            })
        });
        const data = await res.json();
        
        addTutorMessage(data.response, "ai");
        updateVoiceIndicator('on');
        
        // Sync UI Plan
        if (data.plan && data.plan.length > 0) {
            updateLearningPath(data.plan, data.current_step);
        }
        
        if (data.difficulty) {
            document.getElementById('difficulty-display').innerText = data.difficulty;
        }

        if (tutorMode === 'voice' || isHandsFreeON) {
            speakText(data.response);
        }

        // START COUNTDOWN after AI response
        if (data.intent !== "goal" && currentPlan.length > 0) {
            startAutoNextCountdown();
        }

    } catch (err) {
        console.error("Tutor error", err);
        addTutorMessage("An error occurred. Please try again.", "ai");
    }
}

function addTutorMessage(text, type) {
    const chatBox = document.getElementById("tutor-chat-box");
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

function updateLearningPath(plan, step) {
    currentPlan = plan;
    currentStep = step;
    const container = document.getElementById("learning-path");
    if (!container) return;
    
    container.innerHTML = "";
    plan.forEach((p, index) => {
        const div = document.createElement("div");
        div.className = "step-item";
        if (index === step) div.classList.add("active");
        if (index < step) div.classList.add("completed");
        
        div.innerHTML = `<span>${index + 1}.</span> <strong>${p}</strong>`;
        container.appendChild(div);
        
        // Scroll active item into view
        if (index === step) {
            setTimeout(() => div.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
        }
    });
}

// -------- AUTO NEXT LOGIC --------
function startAutoNextCountdown() {
    cancelCountdown(); // Clear existing
    
    // Only if not at the very end
    if (currentStep >= currentPlan.length - 1) return;

    countdownValue = 10;
    const box = document.getElementById("tutor-countdown");
    const timer = document.getElementById("countdown-timer");
    if (!box || !timer) return;

    box.style.display = "flex";
    timer.innerText = countdownValue;

    autoNextInterval = setInterval(() => {
        countdownValue--;
        timer.innerText = countdownValue;
        if (countdownValue <= 0) {
            clearInterval(autoNextInterval);
            triggerAutoNext();
        }
    }, 1000);
}

function cancelCountdown() {
    if (autoNextInterval) clearInterval(autoNextInterval);
    const box = document.getElementById("tutor-countdown");
    if (box) box.style.display = "none";
}

function triggerAutoNext() {
    console.log("Auto-advancing to next step...");
    sendTutorMessage("Next Step");
}

// User Interaction Listeners to STOP countdown
window.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
        cancelCountdown();
    }
});

window.addEventListener("mousedown", () => {
    cancelCountdown();
});

// Also trigger on typing in input
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById("tutor-input");
    if (input) {
        input.addEventListener("input", () => {
            cancelCountdown();
        });
    }
});

function toggleTutorVoice() {
    // This connects to the main script's hands-free toggle
    toggleHandsFree();
}

// Intercept main script's command processor for tutor-specific voice interactions
const originalProcessCommand = window.processOfflineCommand;
window.processOfflineCommand = async function(transcript) {
    if (window.location.pathname === "/tutor") {
        console.log("Tutor intercepted transcript:", transcript);
        
        // Search for wake words in main script (already handled there, but we need to ensure it flows here)
        const wakeWords = ["assistant", "computer", "ai", "research"];
        let command = "";
        for (let w of wakeWords) {
            if (transcript.includes(w)) {
                command = transcript.split(w).pop().trim();
                break;
            }
        }

        if (command) {
            // Special Command: TYPE [message]
            if (command.startsWith("type ")) {
                let msg = command.replace("type ", "").trim();
                // Send as if user typed it
                sendTutorMessage(msg);
                addTutorMessage(msg, "user"); 
                return;
            }

            // Standard commands: next step, deep dive
            if (command.includes("next step") || command === "next") {
                sendTutorMessage("Next Step");
                return;
            }
            if (command.includes("deep dive")) {
                sendTutorMessage("Deep Dive");
                return;
            }

            // Default: Send directly to tutor agent
            sendTutorMessage(command);
            return;
        }
    }
    // Fallback to original
    if (originalProcessCommand) originalProcessCommand(transcript);
};

// AUTO-ACTIVATE VOICE MODE IF HANDS-FREE IS ON
document.addEventListener('DOMContentLoaded', () => {
    // Check if hands-free is already ON from a previous page
    setTimeout(() => {
        if (typeof isHandsFreeON !== 'undefined' && isHandsFreeON) {
            console.log("Auto-activating Tutor Voice Mode via Hands-Free global state.");
            setMode('voice');
        }
    }, 800); 
});
