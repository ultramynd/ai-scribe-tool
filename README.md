# ScribeAI

![ScribeAI Banner](https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6)

**ScribeAI** is a premium, AI-powered transcription and documentation tool designed for speed, accuracy, and depth. It transforms audio and video files into intelligent, formatted transcripts with powerful analysis features.

Copyright © **Clasier Publishing**. All rights reserved.

---

## 🚀 Key Features

### 🎙️ Advanced Transcription
- **Dual Modes**: 
  - **Verbatim**: Captures every utterance, stutter, and filler word for 100% accuracy.
  - **Polish**: Uses "Deep Thinking" AI to generate an intelligent, clean-read version while preserving the speaker's voice.
- **Micro-Diarization**: Automatically identifies and labels speakers (Speaker 1, Speaker 2, etc.).
- **Live Recording**: Built-in audio recorder for capturing real-time conversations.
- **Multilingual Support**: Handles accents, dialects (e.g., Nigerian Pidgin), and mixed-language audio with precision.

### 🧠 AI Analysis & Intelligence
- **Smart Summaries**: Generates executive summaries of long recordings.
- **Key Moments**: Extracts critical takeaways with timestamps.
- **Discussion Bounds**: Automatically identifies the start and end of core content (skipping pleasantries).
- **Visual Analysis**: Processes video files to describe visual context, actions, and on-screen text.
- **Draggable Insight Cards**: All AI results (Summaries, Key Moments) appear in floating, movable cards for a flexible workspace.

### 📝 Rich Text Editor
- **Interactive Formatting**: Bold, Italic, Underline, and interactive Strikethrough (click to delete).
- **Read vs. Edit Modes**: Switch between a clean reading experience and a full-featured text editor.
- **Floating Toolbar**: Context-aware formatting tools that stay within reach.
- **Google Docs Experience**: A familiar, page-based layout with auto-saving history (Undo/Redo).

### ☁️ Integrations & Workflow
- **Google Drive Integration**: Directly pick audio/video files from your Google Drive.
- **Background Processing**: Queue multiple files to transcribe in the background while you work.
- **Export Options**: Download transcripts as `.txt`, `.docx` (Word), or `.srt` (Subtitles).
- **Session Persistence**: Secure Google Sign-In keeps you logged in across reloads.

---

## 🛠️ Getting Started

### Prerequisites
- Node.js (v18 or higher)
- A Google Cloud Project with the **Gemini API** enabled.

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-repo/scribe-ai.git
   cd scribe-ai
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment**:
   Create a `.env` file in the root directory and add your keys:
   ```env
   VITE_GEMINI_API_KEY=your_gemini_api_key_here
   VITE_GOOGLE_CLIENT_ID=your_google_client_id_here
   VITE_GOOGLE_API_KEY=your_google_picker_api_key_here
   ```

4. **Run Locally**:
   ```bash
   npm run dev
   ```
   Access the app at `http://localhost:5173`.

---

## 🔒 Privacy & Security
- **Local-First Processing**: Audio buffering often happens locally before secure transmission.
- **Google OAuth**: Secure authentication via your Google account.
- **Transient Data**: Files are processed by Gemini 1.5 Flash/Pro and are not stored permanently on ScribeAI servers.

---

**Developed by Clasier Publishing**
