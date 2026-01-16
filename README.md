# ScribeAI

**ScribeAI** is an advanced, AI-powered transcription and documentation platform designed for professionals who need speed, accuracy, and nuance. Built on **Google Gemini 1.5 Pro/Flash**, it goes beyond simple speech-to-text by understanding context, speakers, and even regional dialects (including West African Pidgin).

---

## ✨ key Features

### 🎙️ Intelligent Transcription
- **Deep Inference Engines**: Automatically switches between **Gemini 1.5 Pro** (for reasoning) and **Flash** (for speed) based on task complexity.
- **Dialect-Aware**: Specifically trained prompts to handle **West African English, Nigerian Pidgin, and mixed-language** audio without "correcting" the unique voice.
- **Micro-Diarization**: Accurately identifies and labels speakers.

### 🧠 Smart Analysis
- **Executive Summaries**: Instant one-page summaries of hour-long meetings.
- **Key Moments Extraction**: Identifies decisions, action items, and crucial timestamps.
- **Discussion Bounds**: Automatically ignores pleasantries and focuses on the core content.

### 🎨 Premium Experience
- **Zen Mode**: A distraction-free environment for pure writing.
- **Dark Mode**: Fully polished dark UI for late-night sessions.
- **Rich Text Editor**: A Notion-style editor with interactive tools.

### 🛡️ Resilience
- **Smart Fallback**: Automatically switches API keys and Models if quotas are exceeded to ensure 99.9% uptime.

---

## 🛠️ Installation & Setup

### Prerequisites
- Node.js v18+
- A Google Cloud API Key (Gemini API)

### 1. Clone the Repository
```bash
git clone https://github.com/your-username/ai-scribe-tool.git
cd ai-scribe-tool
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Variables
Create a `.env.local` file in the root directory:

```env
# Primary API Key (Gemini)
VITE_GEMINI_API_KEY=your_primary_key

# Optional: Fallback Key for Resilience
VITE_GEMINI_API_KEY_FALLBACK=your_backup_key

# Google Drive Picker (Optional)
VITE_GOOGLE_CLIENT_ID=your_client_id
VITE_GOOGLE_API_KEY=your_picker_key
```

### 4. Run Locally
```bash
npm run dev
```

---

## 🔒 Security
ScribeAI operates with a **Local-First** philosophy.
- Audio buffering is handled locally.
- Files are processed transiently by the AI model.
- No data is permanently stored on ScribeAI servers.

---

**Developed by Clasier Publishing**
