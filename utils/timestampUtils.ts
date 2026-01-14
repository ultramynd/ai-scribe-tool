/**
 * Timestamp utility functions for media playback synchronization
 */

/**
 * Convert timestamp string to seconds
 * Supports formats: "MM:SS" or "HH:MM:SS"
 * Examples: "00:12" -> 12, "01:23:45" -> 5025
 */
export function parseTimestamp(timestamp: string): number {
  const parts = timestamp.trim().split(':').map(Number);
  
  if (parts.length === 2) {
    // MM:SS format
    const [minutes, seconds] = parts;
    return minutes * 60 + seconds;
  } else if (parts.length === 3) {
    // HH:MM:SS format
    const [hours, minutes, seconds] = parts;
    return hours * 3600 + minutes * 60 + seconds;
  }
  
  return 0;
}

/**
 * Convert seconds to timestamp string
 * Always returns HH:MM:SS format
 */
export function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Extract all timestamps from text with their positions
 * Matches patterns like [ 00:12 ] or [01:23:45]
 */
export function extractTimestamps(text: string): Array<{
  timestamp: string;
  seconds: number;
  startIndex: number;
  endIndex: number;
}> {
  const regex = /\[\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*\]/g;
  const results: Array<{
    timestamp: string;
    seconds: number;
    startIndex: number;
    endIndex: number;
  }> = [];
  
  let match;
  while ((match = regex.exec(text)) !== null) {
    results.push({
      timestamp: match[1],
      seconds: parseTimestamp(match[1]),
      startIndex: match.index,
      endIndex: match.index + match[0].length
    });
  }
  
  return results;
}

/**
 * Find the active timestamp range for a given playback time
 * Returns the range between current and next timestamp
 */
export function getActiveTimestampRange(
  timestamps: Array<{ seconds: number; startIndex: number; endIndex: number }>,
  currentTime: number
): { start: number; end: number; timestampIndex: number } | null {
  if (timestamps.length === 0) return null;
  
  // Find the timestamp that's currently active (last one before or at current time)
  let activeIndex = -1;
  for (let i = timestamps.length - 1; i >= 0; i--) {
    if (timestamps[i].seconds <= currentTime) {
      activeIndex = i;
      break;
    }
  }
  
  if (activeIndex === -1) return null;
  
  const currentTimestamp = timestamps[activeIndex];
  const nextTimestamp = timestamps[activeIndex + 1];
  
  return {
    start: currentTimestamp.endIndex,
    end: nextTimestamp ? nextTimestamp.startIndex : Infinity,
    timestampIndex: activeIndex
  };
}

/**
 * Determine if content is audio or video based on MIME type or file extension
 */
export function getMediaType(mimeType?: string | null, filename?: string): 'audio' | 'video' | null {
  if (!mimeType && !filename) return null;
  
  // Check MIME type first
  if (mimeType) {
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('video/')) return 'video';
  }
  
  // Fallback to file extension
  if (filename) {
    const ext = filename.split('.').pop()?.toLowerCase();
    const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'wma', 'webm'];
    const videoExts = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'mkv', 'webm', 'm4v'];
    
    if (ext && audioExts.includes(ext)) return 'audio';
    if (ext && videoExts.includes(ext)) return 'video';
  }
  
  return null;
}
