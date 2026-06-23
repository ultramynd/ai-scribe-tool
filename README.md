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

## 🔒 Security
ScribeAI operates with a **Local-First** philosophy.
- Audio buffering is handled locally.
- Files are processed transiently by the AI model.
- No data is permanently stored on ScribeAI servers.

---

**Developed by [Dosu Jr](https://github.com/kfdos)**

**This is an application in progress**

## Developer Setup
- API runtime setup guide: `docs/API_SETUP.md`
- Secure production mode uses server-side `/api/*` proxy endpoints.
- Local fast mode can use direct Gemini key access for debugging.
