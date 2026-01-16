export const AI_MODELS = {
  // Primary reasoning model (Deep Thinking / High Quality)
  // Options: 'gemini-3-pro-preview', 'gemini-2.0-pro-exp'
  PRIMARY: import.meta.env.VITE_AI_MODEL_PRIMARY || "gemini-3-pro-preview",

  // Fallback/Fast model (Balanced Speed & Quality)
  // Options: 'gemini-2.0-flash', 'gemini-flash-latest'
  FAST: import.meta.env.VITE_AI_MODEL_FAST || "gemini-2.0-flash",

  // Vision model
  VISION: "gemini-2.0-flash" 
};

export const FALLBACK_CONFIG = {
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 3000,
  // Attempt thresholds for switching strategies
  SWITCH_TO_FAST_MODEL_ATTEMPT: 1, 
  SWITCH_TO_BACKUP_KEY_ATTEMPT: 2
};
