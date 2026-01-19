export const AI_MODELS = {
  // Primary reasoning model (Deep Thinking / High Quality)
  // Use gemini-1.5-pro for best transcription quality
  PRIMARY: import.meta.env.VITE_AI_MODEL_PRIMARY || "gemini-1.5-pro-latest",

  // Fallback/Fast model (Balanced Speed & Quality)
  // Use gemini-1.5-flash for speed
  FAST: import.meta.env.VITE_AI_MODEL_FAST || "gemini-1.5-flash-latest",

  // Vision model
  VISION: "gemini-1.5-flash-latest" 
};

export const FALLBACK_CONFIG = {
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 3000,
  // Attempt thresholds for switching strategies
  SWITCH_TO_FAST_MODEL_ATTEMPT: 1, 
  SWITCH_TO_BACKUP_KEY_ATTEMPT: 2
};
