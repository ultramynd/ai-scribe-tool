# Project Rules

These rules must be followed strictly for all development on the AI Scribe Tool.

## 1. AI Model Configuration
-   **Primary Model**: ALWAYS use `gemini-2.0-flash-exp`.
    -   *Reason*: Superior audio understanding and speed compared to 1.5 Pro.
    -   *Configuration*: Defined in `src/config/aiModels.ts`.
-   **Fallback**: `gemini-1.5-flash-latest` (or similar high-availability model).

## 2. Upload Logic
-   **Upload Once**: Files must NEVER be re-uploaded during AI retry loops.
-   **Decoupled Logic**: The upload phase (getting `fileUri`) must be separate from the generation phase.
-   **Inline Limit**: Files < 10MB should be processed inline (Base64) for speed.

## 3. UI/UX Standards
-   **Buttons**: Ensure all buttons are functional. Do not create placeholder UI.
-   **Feedback**: Provide immediate visual feedback for all actions (e.g., "Uploading...", "Transcribing...").
-   **Hover Menus**: All dropdowns must have a buffer (e.g., `pt-2`) to prevent closing when the mouse moves to them.

## 4. Code Quality
-   **No Duplicate Props**: Check `App.tsx` and parent components carefully when passing props to avoid duplications.
-   **Clean Imports**: Remove unused imports immediately.
-   **Strict Typing**: Avoid `any` wherever possible.
