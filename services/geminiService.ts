import { GoogleGenAI } from "@google/genai";
import { blobToBase64 } from "../utils/audioUtils";

// Explicit MIME type mapping to ensure API compatibility
const MIME_TYPE_MAP: Record<string, string> = {
  'mp3': 'audio/mp3',
  'wav': 'audio/wav',
  'aiff': 'audio/aiff',
  'aac': 'audio/aac',
  'ogg': 'audio/ogg',
  'flac': 'audio/flac',
  'm4a': 'audio/mp4',
  'mp4': 'video/mp4',
  'mov': 'video/mov',
  'avi': 'video/avi',
  'wmv': 'video/wmv',
  'mpeg': 'video/mpeg',
  'mpg': 'video/mpeg',
  'webm': 'video/webm',
  '3gp': 'video/3gpp',
  'flv': 'video/x-flv',
  'mkv': 'video/x-matroska'
};

const getMimeTypeFromExtension = (filename: string): string | null => {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext ? MIME_TYPE_MAP[ext] || null : null;
};

/**
 * Helper to upload large files to Gemini API
 */
const uploadFileToGemini = async (mediaFile: File | Blob, mimeType: string): Promise<string> => {
  const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${process.env.API_KEY}`;
  const displayName = mediaFile instanceof File ? mediaFile.name : 'uploaded_media';
  
  const initialResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': mediaFile.size.toString(),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ 
        file: { 
            display_name: displayName,
            mime_type: mimeType 
        } 
    })
  });

  if (!initialResponse.ok) throw new Error(`Failed to initiate upload: ${initialResponse.statusText}`);

  const uploadUrlHeader = initialResponse.headers.get('x-goog-upload-url');
  if (!uploadUrlHeader) throw new Error("Failed to get upload URL");

  const uploadBlob = new Blob([mediaFile], { type: mimeType });
  const uploadResponse = await fetch(uploadUrlHeader, {
    method: 'POST',
    headers: {
      'Content-Length': mediaFile.size.toString(),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize'
    },
    body: uploadBlob
  });

  if (!uploadResponse.ok) throw new Error(`Failed to upload file: ${uploadResponse.statusText}`);

  const fileInfo = await uploadResponse.json();
  const fileUri = fileInfo.file.uri;
  const fileState = fileInfo.file.state;

  if (fileState === 'PROCESSING') {
     let currentState = fileState;
     let retries = 0;
     while (currentState === 'PROCESSING' && retries < 30) {
         await new Promise(r => setTimeout(r, 2000));
         const pollUrl = `https://generativelanguage.googleapis.com/v1beta/files/${fileInfo.file.name}?key=${process.env.API_KEY}`;
         const pollResp = await fetch(pollUrl);
         const pollData = await pollResp.json();
         currentState = pollData.state;
         retries++;
     }
     if (currentState === 'FAILED') throw new Error("File processing failed on server side.");
  }
  
  return fileUri;
};

/**
 * Transcribes audio or video using Gemini models.
 */
export const transcribeAudio = async (
  mediaFile: File | Blob, 
  mimeType: string, 
  autoEdit: boolean = false, 
  detectSpeakers: boolean = true,
  useSmartModel: boolean = true
): Promise<string> => {
  if (!process.env.API_KEY) {
    throw new Error("API Key is missing. Please check your environment configuration.");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  let finalMimeType = mimeType;

  if (mediaFile instanceof File && mediaFile.name) {
     const detectedMime = getMimeTypeFromExtension(mediaFile.name);
     if (detectedMime) {
         finalMimeType = detectedMime;
     }
  }

  if (!finalMimeType || finalMimeType === 'application/octet-stream') {
     finalMimeType = 'audio/mp3';
  }

  const speakerInstruction = detectSpeakers 
    ? `**Speaker Diarization**: Identify distinct speakers. Listen for names (e.g., "Hi John") and use them. If unknown, use "Speaker 1:", "Speaker 2:", etc.`
    : `**Speaker Labels**: Use "Speaker 1:" labels.`;

  const commonInstructions = `
    1. ${speakerInstruction}
    2. **Accents & Dialects**: The audio may contain West African accents, Pidgin English, or mixed languages. 
       - Transcribe Pidgin/Dialect EXACTLY as spoken. DO NOT translate to standard English. 
       - Use *italics* for non-English words or heavy Pidgin phrases.
    3. **Timestamps**: Insert [MM:SS] timestamps at the start of every speaker turn.
  `;

  const rawPrompt = `
    Task: Generate a high-accuracy, verbatim transcription.
    Guidelines:
    ${commonInstructions}
    4. **Accuracy**: Capture every word, including stuttering (e.g., "I- I went") and fillers (um, uh) if they add context.
    5. **Formatting**: Use clear paragraph breaks between speakers.
  `;

  const autoEditPrompt = `
    Task: Generate an "Intelligent Verbatim" transcription.
    Guidelines:
    ${commonInstructions}
    4. **Cleanup**: Lightly edit stuttering and excessive fillers (um, uh) to improve readability, BUT preserve the speaker's unique voice and phrasing.
    5. **Formatting**: Highlight key terms in **bold**.
  `;

  // Select Model
  const modelName = useSmartModel ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview';
  
  const config = useSmartModel ? {
    thinkingConfig: {
      thinkingBudget: 2048 
    }
  } : undefined;

  try {
    let contentPart: any;
    const MAX_INLINE_SIZE = 18 * 1024 * 1024; 

    if (mediaFile.size < MAX_INLINE_SIZE) {
      const base64Data = await blobToBase64(mediaFile);
      contentPart = {
        inlineData: {
          mimeType: finalMimeType,
          data: base64Data
        }
      };
    } else {
      const fileUri = await uploadFileToGemini(mediaFile, finalMimeType);
      contentPart = {
        fileData: {
          mimeType: finalMimeType,
          fileUri: fileUri
        }
      };
    }

    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [
          contentPart,
          {
            text: autoEdit ? autoEditPrompt : rawPrompt
          }
        ]
      },
      config: config
    });

    if (response.text) {
      return response.text;
    } else {
      throw new Error("No transcription generated.");
    }
  } catch (error: any) {
    console.error("Transcription error:", error);
    
    // Parse the error for user-friendly messages
    let userMessage = "An unexpected error occurred during transcription.";
    
    if (error?.message) {
      const msg = error.message.toLowerCase();
      
      // Check for JSON error response in the message
      if (error.message.includes('"error"')) {
        try {
          const jsonMatch = error.message.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            const apiError = parsed.error || parsed;
            
            if (apiError.status === 'INVALID_ARGUMENT' || apiError.message?.includes('API key not valid')) {
              userMessage = "Invalid API Key. Please check your API key in the environment settings.";
            } else if (apiError.status === 'RESOURCE_EXHAUSTED' || apiError.message?.includes('quota')) {
              userMessage = "Rate limit exceeded. You've hit your daily/minute quota. Please wait and try again later.";
            } else if (apiError.status === 'PERMISSION_DENIED') {
              userMessage = "Permission denied. Your API key may not have access to this model.";
            } else if (apiError.message) {
              userMessage = apiError.message;
            }
          }
        } catch (parseErr) {
          // If JSON parsing fails, fall through to string checks
        }
      }
      
      // String-based fallback checks
      if (msg.includes('api key not valid') || msg.includes('invalid_argument')) {
        userMessage = "Invalid API Key. Please check your API key in the environment settings.";
      } else if (msg.includes('quota') || msg.includes('rate limit') || msg.includes('resource_exhausted')) {
        userMessage = "Rate limit exceeded. You've hit your daily/minute quota. Please wait and try again later.";
      } else if (msg.includes('permission denied')) {
        userMessage = "Permission denied. Your API key may not have access to this model.";
      } else if (msg.includes('network') || msg.includes('fetch')) {
        userMessage = "Network error. Please check your internet connection and try again.";
      } else if (msg.includes('timeout')) {
        userMessage = "Request timed out. The audio file may be too large or the server is busy.";
      }
    }
    
    throw new Error(userMessage);
  }
};

/**
 * Analyzes video visual content for key info
 */
export const analyzeVideoContent = async (mediaFile: File | Blob): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = "gemini-3-pro-preview";

  let finalMimeType = mediaFile.type;
  if (mediaFile instanceof File && mediaFile.name) {
    const detectedMime = getMimeTypeFromExtension(mediaFile.name);
    if (detectedMime) finalMimeType = detectedMime;
  }
  
  if (!finalMimeType.startsWith('video/')) {
    return "This feature is only available for video files.";
  }

  try {
    let contentPart: any;
    const MAX_INLINE_SIZE = 18 * 1024 * 1024;

    if (mediaFile.size < MAX_INLINE_SIZE) {
      const base64Data = await blobToBase64(mediaFile);
      contentPart = {
        inlineData: {
          mimeType: finalMimeType,
          data: base64Data
        }
      };
    } else {
      const fileUri = await uploadFileToGemini(mediaFile, finalMimeType);
      contentPart = {
        fileData: {
          mimeType: finalMimeType,
          fileUri: fileUri
        }
      };
    }

    const prompt = `
      Analyze this video and provide a comprehensive report containing:
      1. **Visual Summary**: Setting, people, and actions.
      2. **Key Events**: Important moments.
      3. **Text on Screen**: Extract visible text/graphics.
      4. **Context**: Infer context (e.g. formal meeting, vlog, tutorial).
    `;

    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [contentPart, { text: prompt }]
      },
      config: {
        thinkingConfig: { thinkingBudget: 2048 }
      }
    });

    return response.text || "No analysis could be generated.";
  } catch (error: any) {
    console.error("Video analysis error:", error);
    return `Error analyzing video: ${error.message}`;
  }
};

/**
 * Classifies the content type based on the text.
 */
export const classifyContent = async (text: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = "gemini-3-flash-preview";
  const sample = text.substring(0, 2000);
  const prompt = `Classify this text into one category: Song, Podcast, Interview, Meeting, Lecture, Video, Voice Note, News. Return ONLY the category name.\n\nText:\n${sample}`;

  try {
    const response = await ai.models.generateContent({ model, contents: prompt });
    return response.text?.trim() || "Unknown";
  } catch (e) {
    return "Media";
  }
};

export const summarizeText = async (text: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = "gemini-3-pro-preview"; 
  const response = await ai.models.generateContent({
    model,
    contents: `Provide a concise executive summary of this transcript. Use bullet points.\n\n${text}`,
  });
  return response.text || "Could not generate summary.";
};

/**
 * Context-aware formatting enhancement with diff support
 */
export const enhanceFormatting = async (text: string, contextType: string = "General"): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = "gemini-3-pro-preview";
  
  const prompt = `
    You are an expert editor. Improve the formatting of the following transcript.
    
    Context: ${contextType}
    
    Rules:
    1. **Grammar & Flow**: Fix basic grammar and run-on sentences, but maintain the speaker's authentic voice (especially for Pidgin/Dialects).
    2. **Interactive Editing**: 
       - If you remove a word (filler, stutter), wrap it in ~~strikethrough~~ (e.g., ~~um~~).
       - If you add or correct a word, wrap it in **bold** (e.g., **correction**).
    3. **Formatting**: Add Markdown headings (#) where topics change.
    4. **Non-English**: Italicize *non-English* words.
    5. **Timestamps**: Keep all [MM:SS] timestamps exactly where they are. Do not remove them.

    Transcript:
    ${text}
  `;
  
  const response = await ai.models.generateContent({ model, contents: prompt });
  return response.text || text;
};