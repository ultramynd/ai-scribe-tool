import {
  SUPPORTED_MIME_TYPES,
  SUPPORTED_MIME_PREFIXES,
  getMimeTypeFromExtension
} from './mimeTypes';



export const validateMediaFile = (
  file: File | Blob,
  mimeType?: string | null,
  options: { maxSizeMB?: number } = {}
) => {
  const maxSizeMB = options.maxSizeMB ?? 2000; // Increased to 2GB to support large high-quality video/audio
  const sizeMB = (file.size || 0) / (1024 * 1024);
  if (sizeMB > maxSizeMB) {
    return {
      valid: false,
      message: `File size exceeds ${maxSizeMB}MB limit.`
    };
  }

  const normalizedMime = mimeType || (file instanceof File ? getMimeTypeFromExtension(file.name) : null);
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
