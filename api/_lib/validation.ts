const DEFAULT_ALLOWED_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-flash-latest',
  'gemini-pro-latest'
];

const MODEL_NAME_REGEX = /^[A-Za-z0-9._-]{3,80}$/;
const MIME_TYPE_REGEX = /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/;
const POLL_FILE_REGEX = /^files\/[A-Za-z0-9._/-]+$/;

const envNumber = (key: string, fallback: number): number => {
  const parsed = Number(process.env[key]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const getMaxGeminiPayloadBytes = (): number => envNumber('MAX_GEMINI_PAYLOAD_BYTES', 30 * 1024 * 1024);
export const getMaxUploadSizeBytes = (): number => envNumber('MAX_UPLOAD_SIZE_BYTES', 2 * 1024 * 1024 * 1024);

export const getAllowedGeminiModels = (): Set<string> => {
  const raw = process.env.ALLOWED_GEMINI_MODELS || '';
  const envModels = raw
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean);

  return new Set([...DEFAULT_ALLOWED_MODELS, ...envModels]);
};

export const validateGeminiModel = (model: unknown): { ok: true; value: string } | { ok: false; message: string } => {
  if (typeof model !== 'string') {
    return { ok: false, message: 'Model must be a string.' };
  }

  const trimmed = model.trim();
  if (!MODEL_NAME_REGEX.test(trimmed)) {
    return { ok: false, message: 'Model format is invalid.' };
  }

  if (!getAllowedGeminiModels().has(trimmed)) {
    return { ok: false, message: `Model '${trimmed}' is not allowed by server policy.` };
  }

  return { ok: true, value: trimmed };
};

export const validatePayloadSize = (payload: unknown): { ok: true; bytes: number } | { ok: false; message: string } => {
  if (payload === undefined || payload === null) {
    return { ok: false, message: 'Missing payload.' };
  }

  let bytes = 0;
  try {
    bytes = new TextEncoder().encode(JSON.stringify(payload)).length;
  } catch {
    return { ok: false, message: 'Payload must be JSON-serializable.' };
  }

  if (bytes > getMaxGeminiPayloadBytes()) {
    return {
      ok: false,
      message: `Payload exceeds limit (${bytes} bytes > ${getMaxGeminiPayloadBytes()} bytes).`
    };
  }

  return { ok: true, bytes };
};

export const validateMimeType = (mimeType: unknown): { ok: true; value: string } | { ok: false; message: string } => {
  if (typeof mimeType !== 'string') {
    return { ok: false, message: 'mimeType must be a string.' };
  }

  const trimmed = mimeType.trim();
  if (!MIME_TYPE_REGEX.test(trimmed)) {
    return { ok: false, message: 'mimeType is invalid.' };
  }

  return { ok: true, value: trimmed };
};

export const validateUploadSize = (size: unknown): { ok: true; value: number } | { ok: false; message: string } => {
  const numericSize = Number(size);
  if (!Number.isFinite(numericSize) || numericSize <= 0) {
    return { ok: false, message: 'size must be a positive number.' };
  }

  if (numericSize > getMaxUploadSizeBytes()) {
    return {
      ok: false,
      message: `size exceeds upload limit (${numericSize} bytes > ${getMaxUploadSizeBytes()} bytes).`
    };
  }

  return { ok: true, value: numericSize };
};

export const validatePollFileName = (fileName: unknown): { ok: true; value: string } | { ok: false; message: string } => {
  if (typeof fileName !== 'string') {
    return { ok: false, message: 'fileName must be a string.' };
  }

  const trimmed = fileName.trim();
  if (!POLL_FILE_REGEX.test(trimmed)) {
    return { ok: false, message: 'fileName must start with files/ and contain only safe characters.' };
  }

  return { ok: true, value: trimmed };
};

export const sanitizeDisplayName = (displayName: unknown): string => {
  if (typeof displayName !== 'string') return 'uploaded_media';
  const cleaned = displayName.trim().slice(0, 120);
  return cleaned.length > 0 ? cleaned : 'uploaded_media';
};
