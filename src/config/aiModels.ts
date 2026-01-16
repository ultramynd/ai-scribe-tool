export const AI_MODELS = {
  // Primary reasoning model (High Quality, Slower)
  // Options: 'gemini-1.5-pro-latest', 'gemini-1.5-pro-002', 'gemini-2.0-flash-exp'
  PRIMARY: import.meta.env.VITE_AI_MODEL_PRIMARY || "gemini-1.5-pro-latest",

  // Fallback/Fast model (Low Latency, Cost Effective)
  // Options: 'gemini-1.5-flash-latest', 'gemini-1.5-flash-002'
  FAST: import.meta.env.VITE_AI_MODEL_FAST || "gemini-1.5-flash-latest",

  // Vision model (often same as FAST/PRIMARY but can be distinct)
  VISION: "gemini-1.5-flash-latest" 
};

export const FALLBACK_CONFIG = {
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 3000,
  // Attempt thresholds for switching strategies
  SWITCH_TO_FAST_MODEL_ATTEMPT: 1, 
  SWITCH_TO_BACKUP_KEY_ATTEMPT: 2
};
