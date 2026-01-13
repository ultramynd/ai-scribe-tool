/**
 * Service for interacting with Groq's high-speed AI models
 * Specifically used for Whisper-based speech-to-text
 */

export const transcribeWithGroq = async (
  mediaFile: File | Blob,
  options: {
    language?: string;
    prompt?: string;
    model?: string;
  } = {}
): Promise<string> => {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY;

  if (!apiKey) {
    throw new Error("Groq API Key is missing. Please add VITE_GROQ_API_KEY to your .env.local file.");
  }

  // Check file size (Groq limit is 25MB)
  const sizeInMB = mediaFile.size / (1024 * 1024);
  if (sizeInMB > 25) {
    throw new Error(`File size (${sizeInMB.toFixed(1)}MB) exceeds Groq's 25MB limit. Please use Gemini for larger files.`);
  }

  const formData = new FormData();
  
  // Groq requires a filename for the file part
  let filename = 'audio.mp3';
  if (mediaFile instanceof File) {
    filename = mediaFile.name;
  } else {
    // Determine extension from mime type if possible
    const type = mediaFile.type;
    if (type.includes('wav')) filename = 'audio.wav';
    else if (type.includes('ogg')) filename = 'audio.ogg';
    else if (type.includes('webm')) filename = 'audio.webm';
    else if (type.includes('m4a')) filename = 'audio.m4a';
  }

  formData.append('file', mediaFile, filename);
  formData.append('model', options.model || 'whisper-large-v3');
  
  if (options.language) {
    formData.append('language', options.language);
  }
  
  if (options.prompt) {
    formData.append('prompt', options.prompt);
  }

  formData.append('response_format', 'text');

  try {
    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `Groq API error: ${response.status} ${response.statusText}`);
    }

    const text = await response.text();
    return text.trim();
  } catch (error: any) {
    console.error("Groq Transcription Error:", error);
    throw error;
  }
};
