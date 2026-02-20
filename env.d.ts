/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GEMINI_API_KEY?: string;
  readonly VITE_GEMINI_API_KEY_FALLBACK?: string;
  readonly VITE_GEMINI_USE_PROXY?: 'true' | 'false';
  readonly VITE_GOOGLE_API_KEY?: string;
  readonly VITE_GROQ_API_KEY?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_AI_MODEL_PRIMARY?: string;
  readonly VITE_AI_MODEL_FAST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
