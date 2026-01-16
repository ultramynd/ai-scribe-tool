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
    onStatus?: (message: string) => void;
  } = {}
): Promise<string> => {
  const { onStatus } = options;
  onStatus?.(`Initializing Groq engine (${options.model || 'whisper-large-v3'})...`);
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

  onStatus?.(`Buffering audio payload (${sizeInMB.toFixed(1)}MB)...`);
  formData.append('file', mediaFile, filename);
  formData.append('model', options.model || 'whisper-large-v3');
  
  if (options.language) {
    formData.append('language', options.language);
  }
  
  if (options.prompt) {
    formData.append('prompt', options.prompt);
  } else {
    // Default system prompt for better rule adherence if none provided
    formData.append('prompt', "This is a transcript. Maintain all speaker technicalities. If verbatim, keep stutters. If polish, clean up fillers but keep meaning.");
  }

  formData.append('response_format', 'text');

  try {
    onStatus?.("Dispatching to Groq edge network...");
    const text = await new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', 'https://api.groq.com/openai/v1/audio/transcriptions');
      xhr.setRequestHeader('Authorization', `Bearer ${apiKey}`);
      
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(xhr.responseText.trim());
        } else {
          try {
            const errorData = JSON.parse(xhr.responseText);
            reject(new Error(errorData.error?.message || `Groq API error: ${xhr.status}`));
          } catch (e) {
            reject(new Error(`Groq API error: ${xhr.status} ${xhr.statusText}`));
          }
        }
      };
      
      xhr.onerror = () => reject(new Error("Network connection error during Groq transcription."));
      xhr.ontimeout = () => reject(new Error("Groq engine timed out (2 minutes)."));
      xhr.timeout = 120000; // 2 minutes for Groq
      xhr.send(formData);
    });
    return text;
  } catch (error: any) {
    console.error("Groq Transcription Error:", error);
    throw error;
  }
};

/**
 * Transcribe audio chunks for real-time streaming
 * Optimized for speed with minimal latency
 */
export const transcribeAudioChunk = async (
  audioChunk: Blob,
  previousContext?: string,
  mode: 'verbatim' | 'polish' = 'verbatim'
): Promise<string> => {
  const prompt = mode === 'verbatim' 
    ? `STRICT VERBATIM. Do not remove stutters or fillers like um, uh. Previous: ${previousContext?.slice(-200) || ''}`
    : `SMART POLISH. Clean up fillers but keep the original meaning and tone. Previous: ${previousContext?.slice(-200) || ''}`;

  return transcribeWithGroq(audioChunk, {
    model: 'whisper-large-v3',
    prompt: prompt,
    onStatus: (msg) => console.log(`[Chunk] ${msg}`)
  });
};
