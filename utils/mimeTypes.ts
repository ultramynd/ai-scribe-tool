/**
 * Shared MIME type mapping for file extension → MIME type resolution.
 * Used by both geminiService.ts (API calls) and mediaValidation.ts (validation).
 */
export const MIME_TYPE_MAP: Record<string, string> = {
    // Audio
    mp3: 'audio/mp3',
    wav: 'audio/wav',
    aiff: 'audio/aiff',
    aac: 'audio/aac',
    ogg: 'audio/ogg',
    flac: 'audio/flac',
    m4a: 'audio/mp4',
    webm: 'audio/webm',

    // Video
    mp4: 'video/mp4',
    mov: 'video/mov',
    avi: 'video/avi',
    wmv: 'video/wmv',
    mpeg: 'video/mpeg',
    mpg: 'video/mpeg',
    '3gp': 'video/3gpp',
    flv: 'video/x-flv',
    mkv: 'video/x-matroska',
};

/**
 * Video-specific overrides for extensions that can be either audio or video.
 * Used by geminiService when the context is known to be video.
 */
export const VIDEO_MIME_OVERRIDES: Record<string, string> = {
    webm: 'video/webm',
};

/** All known supported MIME types (values from the map). */
export const SUPPORTED_MIME_TYPES = new Set(Object.values(MIME_TYPE_MAP));

/** Prefixes considered valid for media files. */
export const SUPPORTED_MIME_PREFIXES = ['audio/', 'video/'];

/**
 * Resolve a MIME type from a filename's extension.
 * @param filename - The file name or path to extract the extension from.
 * @param preferVideo - If true, applies video overrides for ambiguous extensions (e.g. webm).
 */
export const getMimeTypeFromExtension = (
    filename?: string | null,
    preferVideo: boolean = false
): string | null => {
    if (!filename) return null;
    const ext = filename.split('.').pop()?.toLowerCase();
    if (!ext) return null;

    if (preferVideo && VIDEO_MIME_OVERRIDES[ext]) {
        return VIDEO_MIME_OVERRIDES[ext];
    }

    return MIME_TYPE_MAP[ext] || null;
};
