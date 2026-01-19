const MIME_TYPE_MAP: Record<string, string> = {
  mp3: 'audio/mp3',
  wav: 'audio/wav',
  aiff: 'audio/aiff',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  webm: 'audio/webm',
  mp4: 'video/mp4',
  mov: 'video/mov',
  avi: 'video/avi',
  wmv: 'video/wmv',
  mpeg: 'video/mpeg',
  mpg: 'video/mpeg',
  webmVideo: 'video/webm',
  '3gp': 'video/3gpp',
  flv: 'video/x-flv',
  mkv: 'video/x-matroska'
};

const SUPPORTED_MIME_TYPES = new Set(Object.values(MIME_TYPE_MAP));
const SUPPORTED_MIME_PREFIXES = ['audio/', 'video/'];

export const getMimeTypeFromName = (filename?: string | null) => {
  if (!filename) return null;
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext ? MIME_TYPE_MAP[ext] || null : null;
};

export const validateMediaFile = (
  file: File | Blob,
  mimeType?: string | null,
  options: { maxSizeMB?: number } = {}
) => {
  const maxSizeMB = options.maxSizeMB ?? 500;
  const sizeMB = (file.size || 0) / (1024 * 1024);
  if (sizeMB > maxSizeMB) {
    return {
      valid: false,
      message: `File size exceeds ${maxSizeMB}MB limit.`
    };
  }

  const normalizedMime = mimeType || (file instanceof File ? getMimeTypeFromName(file.name) : null);
  if (normalizedMime) {
    const isKnownType = SUPPORTED_MIME_TYPES.has(normalizedMime);
    const isAudioOrVideo = SUPPORTED_MIME_PREFIXES.some(prefix => normalizedMime.startsWith(prefix));
    if (!isKnownType && !isAudioOrVideo) {
      return {
        valid: false,
        message: 'Unsupported file type. Please upload a supported audio or video format.'
      };
    }
  }

  if (!normalizedMime && !(file instanceof File)) {
    return {
      valid: false,
      message: 'Unable to detect file type. Please try a supported format.'
    };
  }

  return { valid: true };
};
