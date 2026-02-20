export const AI_MODELS = {
  // Primary reasoning model - using gemini-2.5-flash since it's confirmed available
  PRIMARY: import.meta.env.VITE_AI_MODEL_PRIMARY || "gemini-2.5-flash",

  // Fallback/Fast model - lighter model for reliability when primary is rate-limited
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
