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

export type StatusCallback = (message: string, progress?: number) => void;

/**
 * Helper to upload large files to Gemini API
 */
const uploadFileToGemini = async (
  mediaFile: File | Blob, 
  mimeType: string, 
  onStatus?: StatusCallback
): Promise<string> => {
  onStatus?.(`Initializing resumable upload for ${Math.round(mediaFile.size / 1024 / 1024)}MB file...`, 5);
  const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${import.meta.env.VITE_GEMINI_API_KEY}`;
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

  onStatus?.("Capturing upload slot (Protocol: Resumable)...", 10);
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
     onStatus?.("Server-side processing (AIAudioEngine)...", 20);
     let currentState = fileState;
     let retries = 0;
     while (currentState === 'PROCESSING' && retries < 30) {
         await new Promise(r => setTimeout(r, 2000));
         onStatus?.(`Analyzing deep features (${retries + 1}/30)...`, 20 + (retries * 2));
         const pollUrl = `https://generativelanguage.googleapis.com/v1beta/files/${fileInfo.file.name}?key=${import.meta.env.VITE_GEMINI_API_KEY}`;
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
  useSmartModel: boolean = true,
  onStatus?: StatusCallback
): Promise<string> => {
  onStatus?.("Preparing Media for AI Engine...", 2);
  const executeWithRetry = async (attempt: number = 0): Promise<string> => {
    try {
      if (!import.meta.env.VITE_GEMINI_API_KEY) {
        throw new Error("API Key is missing. Please check your environment configuration.");
      }
      
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
      onStatus?.(`Engine initialized: ${useSmartModel ? '2.5 Pro' : '2.5 Flash'}`, 8);
  
      let finalMimeType = mimeType;
      if (mediaFile instanceof File && mediaFile.name) {
         const detectedMime = getMimeTypeFromExtension(mediaFile.name);
         if (detectedMime) finalMimeType = detectedMime;
      }
      if (!finalMimeType || finalMimeType === 'application/octet-stream') {
         finalMimeType = 'audio/mp3';
      }

      const speakerInstruction = detectSpeakers 
        ? `**Speaker Diarization**: Identify distinct speakers. Listen for names (e.g., "Hi John") and use them. If unknown, use "Speaker 1:", "Speaker 2:", etc.`
        : `**No Speaker Labels**: Do not use speaker labels (e.g., "Speaker 1"). Format the text as a continuous transcript with paragraph breaks.`;

      const commonInstructions = `
        1. ${speakerInstruction}
        2. **Accents & Dialects**: The audio may contain West African accents, Pidgin English, or mixed languages. 
           - Transcribe Pidgin/Dialect EXACTLY as spoken. DO NOT translate to standard English. 
           - Use *italics* for non-English words or heavy Pidgin phrases.
        3. **Timestamps**: Insert [MM:SS] timestamps at the start of every speaker turn.
      `;

      const rawPrompt = `
        Task: Generate a STRICT, 100% VERBATIM transcription.
        Guidelines:
        ${commonInstructions}
        4. **Strict Verbatim**: Capture EVERY utterance, stutter, false start, and filler word (um, uh, like, you know). DO NOT EDIT or "clean up" anything.
        5. **Accuracy**: If a sentence is grammatically incorrect, TRANSCRIPE IT EXACTLY AS SPOKEN.
        6. **Formatting**: Start every speaker turn on a new line with their label and timestamp.
      `;

      const autoEditPrompt = `
        Task: Generate an "Intelligent Verbatim" transcription.
        Guidelines:
        ${commonInstructions}
        4. **Cleanup**: Lightly edit stuttering and excessive fillers (um, uh) to improve readability, BUT preserve the speaker's unique voice and phrasing.
        5. **Formatting**: Highlight key terms in **bold**.
      `;

      const modelName = useSmartModel ? 'gemini-2.5-pro' : 'gemini-2.5-flash';
      const config = undefined;

      let contentPart: any;
      const MAX_INLINE_SIZE = 18 * 1024 * 1024; 

      if (mediaFile.size < MAX_INLINE_SIZE) {
        onStatus?.("Buffering audio for inline execution...", 12);
        const base64Data = await blobToBase64(mediaFile);
        contentPart = {
          inlineData: {
            mimeType: finalMimeType,
            data: base64Data
          }
        };
      } else {
        contentPart = {
          fileData: {
            mimeType: finalMimeType,
            fileUri: await uploadFileToGemini(mediaFile, finalMimeType, onStatus)
          }
        };
      }

      onStatus?.("Generating transcription (Deep Inference)...", 60);
      const response = await ai.models.generateContent({
        model: modelName,
        contents: {
          parts: [
            contentPart,
            { text: autoEdit ? autoEditPrompt : rawPrompt }
          ]
        },
        config: config
      });

      if (response.text) {
        onStatus?.("Transcription complete. Metadata cached.", 100);
        return response.text;
      } else {
        throw new Error("No transcription generated.");
      }
    } catch (error: any) {
      const errorMsg = error.message.toLowerCase();
      const isRateLimited = errorMsg.includes('429') || errorMsg.includes('quota') || errorMsg.includes('resource_exhausted');

      // Model Fallback Logic: Switch from Pro to Flash if capacity hit
      if (useSmartModel && isRateLimited) {
        onStatus?.("Switching to High-Capacity engine (Flash) due to rate limit...");
        return transcribeAudio(mediaFile, mimeType, autoEdit, detectSpeakers, false, onStatus);
      }

      if (attempt < 2 && (isRateLimited || errorMsg.includes('503'))) {
        onStatus?.(`AI busy. Retrying in ${attempt + 2}s...`);
        await new Promise(r => setTimeout(r, (attempt + 1) * 2000));
        return executeWithRetry(attempt + 1);
      }
      throw error;
    }
  };

  try {
    return await executeWithRetry();
  } catch (error: any) {
    console.error("Transcription error:", error);
    let userMessage = "An unexpected error occurred during transcription.";
    
    if (error?.message) {
      const msg = error.message.toLowerCase();
      if (error.message.includes('"error"')) {
        try {
          const jsonMatch = error.message.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            const apiError = parsed.error || parsed;
            if (apiError.status === 'RESOURCE_EXHAUSTED' || apiError.message?.includes('quota')) {
               userMessage = useSmartModel 
                 ? "Gemini 2.5 Pro Rate Limit hit (2 RPM). Please wait 60 seconds or disable 'Deep Thinking' to use the higher-capacity Flash engine."
                 : "Gemini 2.5 Flash Rate Limit hit. Please wait 60 seconds for the server to reset.";
            } else if (apiError.status === 'INVALID_ARGUMENT' || apiError.message?.includes('API key not valid')) {
               userMessage = "Invalid API Key. Please check your API key in the environment settings.";
            } else if (apiError.status === 'PERMISSION_DENIED') {
              userMessage = "Permission denied. Your API key may not have access to this model.";
            } else if (apiError.message) {
              userMessage = apiError.message;
            }
          }
        } catch (e) {}
      }
      
      if (userMessage === "An unexpected error occurred during transcription.") {
        if (msg.includes('api key not valid') || msg.includes('invalid_argument')) {
          userMessage = "Invalid API Key. Please check your API key in the environment settings.";
        } else if (msg.includes('quota') || msg.includes('rate limit') || msg.includes('resource_exhausted')) {
          userMessage = useSmartModel 
            ? "Gemini 2.5 Pro Rate Limit hit. Please wait 60 seconds or disable 'Deep Thinking'."
            : "Gemini 2.5 Flash Rate Limit hit. Please wait a minute for the quota to reset.";
        } else if (msg.includes('permission denied')) {
          userMessage = "Permission denied. Your API key may not have access to this model.";
        } else if (msg.includes('network') || msg.includes('fetch')) {
          userMessage = "Network error. Please check your internet connection and try again.";
        } else if (msg.includes('timeout')) {
          userMessage = "Request timed out. The audio file may be too large or the server is busy.";
        }
      }
    }
    throw new Error(userMessage);
  }
};

/**
 * Analyzes video visual content for key info
 */
export const analyzeVideoContent = async (mediaFile: File | Blob): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
  const model = "gemini-2.5-flash";

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
    });

    return String(response.text || "No analysis could be generated.");
  } catch (error: any) {
    console.error("Video analysis error:", error);
    return `Error analyzing video: ${error.message}`;
  }
};

/**
 * Classifies the content type based on the text.
 */
export const classifyContent = async (text: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
  const model = "gemini-2.5-flash";
  const sample = text.substring(0, 2000);
  const prompt = `Classify this text into one category: Song, Podcast, Interview, Meeting, Lecture, Video, Voice Note, News. Return ONLY the category name.\n\nText:\n${sample}`;

  try {
    const response = await ai.models.generateContent({ model, contents: prompt });
    return String(response.text || "").trim() || "Unknown";
  } catch (e) {
    return "Media";
  }
};

export const summarizeText = async (text: string, useSmartModel: boolean = false): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
  const model = useSmartModel ? "gemini-2.5-pro" : "gemini-2.5-flash"; 
  const prompt = `
    You are ScribeAI Intelligence, a premium transcription analysis engine. Provide a deep, structured analysis of the provided transcript.
    
    Structure your response with these sections:
    
    1. **Executive Synthesis**: A high-density overview of the discussion, capturing the core themes, objectives, and atmosphere. (2-3 paragraphs).
    2. **Key Moments & Chronology**: Identify the 5-8 most critical segments. Include their exact [MM:SS] timestamps. For each, explain:
       - **What happened**: A brief summary.
       - **Significance**: Why this moment is vital to the overall context.
    3. **Actionable Outcomes**: Extract explicit or implied next steps, commitments, or decisions made.
    4. **Sentiment & Tone**: Brief analysis of the conversation's dynamic (e.g., collaborative, confrontational, informational).

    Use professional Markdown formatting. Do not be generic; find the "soul" of the conversation.
    
    Transcript:
    ${text}
  `;
  const response = await ai.models.generateContent({ model, contents: prompt });
  return String(response.text || "Could not generate summary.");
};

/**
 * Context-aware formatting enhancement with diff support
 */
export const enhanceFormatting = async (text: string, contextType: string = "General", useSmartModel: boolean = false): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
  const model = useSmartModel ? "gemini-2.5-pro" : "gemini-2.5-flash";
  
  const prompt = `
    You are ScribeAI Smart Editor. Your task is to transform a raw transcript into a polished, professional document while preserving the original meaning and nuances.
    
    Context: ${contextType}
    
    STRICT EDITING RULES:
    1. **Semantic Cleanup**: Remove stutters, redundant repetitions, and excessive fillers (um, uh, like, you know) ONLY if they don't contribute to tone.
    2. **Interactive Tracking**: 
       - If you delete a word/phrase, wrap it in ~~strikethrough~~ (e.g., ~~um~~).
       - If you add or correct a word for clarity/grammar, wrap it in **bold** (e.g., **correction**).
    3. **Professional Structure**: 
       - Insert thematic Markdown headings (# or ##) where the topic shifts.
       - Use bullet points for lists.
    4. **Diarization Preservation**: Keep all speaker labels (e.g., Speaker 1:) and [MM:SS] timestamps exactly where they are. 
    5. **Tone Consistency**: If the speaker uses Pidgin, slang, or technical jargon, PRESERVE IT. Do not "over-sanitize".
    6. **Typography**: Use *italics* for emphasis or non-English terms.

    Produce the final document in clean Markdown.
    
    Transcript:
    ${text}
  `;
  
  const response = await ai.models.generateContent({ model, contents: prompt });
  return String(response.text || text);
};

/**
 * Extracts key moments from the transcript.
 */
export const extractKeyMoments = async (text: string, useSmartModel: boolean = false): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
  const model = useSmartModel ? "gemini-2.5-pro" : "gemini-2.5-flash";
  
  const prompt = `
    Analyze this transcript and extract the most important "Key Moments". 
    For each moment:
    1. Identify the timestamp [MM:SS] if available.
    2. Provide a brief, punchy title.
    3. Explain why it is important (1 sentence).

    Format the output as a structured Markdown list.
    
    Transcript:
    ${text}
  `;
  
  const response = await ai.models.generateContent({ model, contents: prompt });
  return String(response.text || "No key moments identified.");
};

/**
 * Identifies the start and end of the main discussion.
 */
export const findDiscussionBounds = async (text: string, useSmartModel: boolean = false): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
  const model = useSmartModel ? "gemini-2.5-pro" : "gemini-2.5-flash";
  
  const prompt = `
    Look at this transcript and identify exactly where the main discussion starts and ends. 
    Ignore the introductory pleasantries, setup, or closing small talk.
    
    Return your finding in this exact format:
    **Core Discussion Starts**: [MM:SS] - [Context]
    **Core Discussion Ends**: [MM:SS] - [Context]
    
    Transcript Snippet:
    ${text.substring(0, 5000)} ... ${text.substring(text.length - 2000)}
  `;
  
  const response = await ai.models.generateContent({ model, contents: prompt });
  return String(response.text || "Could not identify discussion bounds.");
};

/**
 * Removes pleasantries and fluff, keeping only the core interview/discussion content.
 */
export const stripPleasantries = async (text: string, useSmartModel: boolean = false): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
  const model = useSmartModel ? "gemini-2.5-pro" : "gemini-2.5-flash";
  
  const prompt = `
    You are a professional editor. Rewrite this transcript to remove all pleasantries, "small talk", filler intros (like "how are you today", "thank you for having me"), and outros that don't contribute to the core subject matter.
    
    Keep the speaker labels and timestamps exactly as they are. 
    DO NOT summarize. This must be the original transcript, just "filtered" for high-density information.
    
    Transcript:
    ${text}
  `;
  
  const response = await ai.models.generateContent({ model, contents: prompt });
  return String(response.text || text);
};

/**
 * Refines speaker labels based on context.
 */
export const refineSpeakers = async (text: string, useSmartModel: boolean = true): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
  const model = useSmartModel ? "gemini-2.5-pro" : "gemini-2.5-flash";
  
  const prompt = `
    Review the following West African transcript and refine the speaker labels. 
    1. Identify if "Speaker 1", "Speaker 2", etc. can be replaced with actual names based on conversation context (e.g., someone says "Gaza", "Kojo", "Blessing").
    2. Correct misattributed turns if the flow of conversation suggests a different speaker.
    3. Keep the format: "NAME [MM:SS]: Transcript".
    4. RETURN THE FULL ENTIRE TRANSCRIPT with these improvements.
  `;
  
  const response = await ai.models.generateContent({
    model: model,
    contents: {
      parts: [{ text: prompt }, { text: text }]
    }
  });
  
  return String(response.text || text);
};

/**
 * Optimizes transcript for African context (names, Pidgin, local idioms).
 */
export const refineAfricanContext = async (text: string, useSmartModel: boolean = true): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
  const model = useSmartModel ? "gemini-2.5-pro" : "gemini-2.5-flash";
  
  const prompt = `
    You are an expert in West African English, Pidgin, and local idioms (Naija, Ghana, Sierra Leone).
    Review this transcript and:
    1. Correct spelling of local names (ensure they are capitalized and spelled standardly).
    2. Format Pidgin English phrases properly (e.g., "I dey come" instead of "I they come").
    3. Ensure local idioms are preserved and formatted if they were misinterpreted by the speech-to-text engine.
    4. DO NOT translate to standard English. Maintain the original linguistic soul of the speaker.
    RETURN THE FULL ENTIRE TRANSCRIPT with these improvements.
  `;
  
  const response = await ai.models.generateContent({
    model: model,
    contents: {
      parts: [{ text: prompt }, { text: text }]
    }
  });
  
  return String(response.text || text);
};
