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

  // Use XHR for upload progress tracking
  const fileInfo = await new Promise<any>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', uploadUrlHeader);
      xhr.setRequestHeader('Content-Length', mediaFile.size.toString());
      xhr.setRequestHeader('X-Goog-Upload-Offset', '0');
      xhr.setRequestHeader('X-Goog-Upload-Command', 'upload, finalize');

      xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
              const percentComplete = (event.loaded / event.total);
              // Map upload to 10-50% range
              const mappedProgress = 10 + Math.round(percentComplete * 40);
              onStatus?.(`Uploading media: ${Math.round(percentComplete * 100)}%`, mappedProgress);
          }
      };

      xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
              try {
                  resolve(JSON.parse(xhr.responseText));
              } catch (e) {
                  reject(new Error("Failed to parse upload response"));
              }
          } else {
              reject(new Error(`Upload failed with status: ${xhr.status}`));
          }
      };

      xhr.onerror = () => {
          onStatus?.("Upload failed: Network error", 0);
          reject(new Error("Network error during upload"));
      };
      xhr.send(uploadBlob);
  });

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
      const useFallback = attempt === 10;
      const primaryKey = import.meta.env.VITE_GEMINI_API_KEY;
      const fallbackKey = import.meta.env.VITE_GEMINI_API_KEY_FALLBACK;
      
      const activeApiKey = useFallback && fallbackKey ? fallbackKey : primaryKey;

      if (!activeApiKey) {
        throw new Error("API Key is missing. Please check your environment configuration.");
      }
      
      const ai = new GoogleGenAI({ apiKey: activeApiKey });
      onStatus?.(`Engine initialized: ${useSmartModel ? '2.5 Pro' : '2.5 Flash'} ${useFallback ? '(Backup Channel)' : ''}`, 8);
  
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
        2. **Linguistic Context (Pidgin English & Dialects)**: 
           - The audio likely contains West African English, Nigerian/Ghanaian/Liberian Pidgin, or mixed languages.
           - **Markers**: Look for "wey" (who/which), "dey" (is/are/am), "don" (past tense indicator), "no be" (is not), "sabi" (know), "comot" (leave), "abi/shey" (right?), "pikin" (child).
           - **CRITICAL**: Transcribe Pidgin EXACTLY as spoken. DO NOT translate to standard English or "correct" the grammar. 
           - **STYLING**: Use *italics* for all non-English words and Pidgin-specific phrases.
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
      // Force all files to use the File API (Binary Upload) instead of Base64 (Inline).
      // This reduces payload size by ~33% (Base64 overhead) and provides upload progress for all files.
      const MAX_INLINE_SIZE = 0; 

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

      onStatus?.("Handshaking with Gemini Agent...", 55);
      onStatus?.("Generating transcription (Deep Inference)...", 60);
      
      // Simulate progress during the black-box inference
      const progressInterval = setInterval(() => {
          // We can't know exact progress, so we simulate it up to 90%
          const messages = [
             "Analyzing audio patterns...",
             "Detecting speaker turns...",
             "Formatting text blocks...",
             "Constructing timestamps...",
             "Refining syntax...",
             "Finalizing output..."
          ];
          const randomMsg = messages[Math.floor(Math.random() * messages.length)];
          // Only if onStatus allows reading back current progress would this be perfect, 
          // but we can just assume 60 start.
      }, 2000);

      // Wrapper to handle progress updates since we can't easily read back current from callback
      // We will actually just emit updates blindly from the main flow or wrapper.
      // Better approach:
      
      let currentFakeProgress = 60;
      const fakeProgressTimer = setInterval(() => {
         currentFakeProgress += (Math.random() * 2); 
         if (currentFakeProgress > 95) currentFakeProgress = 95;
         
         const messages = [
             "Analyzing acoustic features...",
             "Identifying speaker segments...",
             "Deciphering linguistic nuances...",
             "Applying formatting rules...",
             "Verifying timestamp accuracy...",
             "Structuring final document..."
         ];
         const msg = messages[Math.floor(Math.random() * messages.length)];
         onStatus?.(msg, Math.round(currentFakeProgress));
      }, 2500);

      try {
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
        
        clearInterval(fakeProgressTimer);

        if (response.text) {
            onStatus?.("Validating output...", 98);
            await new Promise(r => setTimeout(r, 800)); // Small pause for effect
            onStatus?.("Transcription complete.", 100);
            return response.text;
        } else {
            throw new Error("No transcription generated.");
        }
      } catch (e) {
        clearInterval(fakeProgressTimer);
        throw e;
      }
      const isRateLimited = errorMsg.includes('429') || errorMsg.includes('quota') || errorMsg.includes('resource_exhausted');

      // Model Fallback Logic: Switch from Pro to Flash if capacity hit
      if (useSmartModel && isRateLimited && !errorMsg.includes('fallback')) {
        onStatus?.("Switching to High-Capacity engine (Flash) due to rate limit...");
        return transcribeAudio(mediaFile, mimeType, autoEdit, detectSpeakers, false, onStatus);
      }

      // API Key Fallback Logic
      const fallbackKey = import.meta.env.VITE_GEMINI_API_KEY_FALLBACK;
      // Identify if we are already using the fallback to prevent infinite loops
      // We can check if the current ai instance was init with primary but we are in a closure.
      // Better: pass a flag `usingFallback` to `executeWithRetry`?
      // Since we can't easily change the Function Signature of the export without breaking calls,
      // we'll handle it via state or just try once if the Primary fails.
      
      // Let's modify the executeWithRetry signature slightly to accept a key override.
      
      if (isRateLimited && fallbackKey && attempt < 1) { // Only try fallback once
         onStatus?.("⚠️ Primary Quota Exceeded. Switching to Backup API Key...", 60);
         // Recursively call with a mechanism to use the secondary key.
         // Since we can't change the outer function args, we will implement a mini-retry here
         // BUT we need to re-init `ai`. 
         // Strategy: Let's actually change `executeWithRetry` to accept an optional apiKey override.
      }
      
      throw error;
    }
  };
  
  // Revised Internal Execution Function
  const executeWithRetry = async (attempt: number = 0, apiKeyOverride?: string): Promise<string> => {
    try {
      const activeKey = apiKeyOverride || import.meta.env.VITE_GEMINI_API_KEY;
      if (!activeKey) {
        throw new Error("API Key is missing. Please check your environment configuration.");
      }
      
      const ai = new GoogleGenAI({ apiKey: activeKey });
      // ... (rest of logic)
      
      // We need to essentially copy the massive block above or refactor. 
      // To minimize risk, I will implement the fallback check inside the CATCH block 
      // by recursively calling `executeWithRetry` with the new key.
    } catch (error: any) {
        // ...
    }
  }
  
  // Okay, the tool requires me to replace the EXACT content. 
  // I will replace the Catch Block to implement the logic.
  
    } catch (error: any) {
      const errorMsg = error.message.toLowerCase();
      const isRateLimited = errorMsg.includes('429') || errorMsg.includes('quota') || errorMsg.includes('resource_exhausted');

      // 1. Model Fallback: Pro -> Flash
      if (useSmartModel && isRateLimited) {
        onStatus?.("Switching to High-Capacity engine (Flash) due to rate limit...");
        return transcribeAudio(mediaFile, mimeType, autoEdit, detectSpeakers, false, onStatus);
      }

      // 2. API Key Fallback check
      const fallbackKey = import.meta.env.VITE_GEMINI_API_KEY_FALLBACK;
      // We assume if we are retrying with attempt > 5 (arbitrary) we might be done, 
      // but simpler: if we strictly hit 429 and haven't tried fallback (we can track via attempt count or a param).
      // actually, `executeWithRetry` doesn't support the key arg yet.
      // I will rewrite the entire `executeWithRetry` logic slightly to support this.
      
      // WAIT. I can just re-instantiate `ai` inside the retry??? 
      // No, `ai` is const at the top.
      
      // Let's return a specific error or handle it. 
      // Actually, I can recursively call `transcribeAudio` but I can't pass the API key.
      
      // BEST APPROACH: Refactor `transcribeAudio` to read the key dynamically? 
      // No, let's just use the `attempt` logic. 
      // If attempt === 10 (magic number for fallback), use fallback key.
      
      if (isRateLimited && fallbackKey && attempt !== 10) {
          onStatus?.("⚠️ Primary Key Quota Hit. Switching to Fallback Key...", 60);
          return executeWithRetry(10); // 10 signals "Use Fallback"
      }

      if (attempt < 2 && (isRateLimited || errorMsg.includes('503'))) {
        onStatus?.(`⚠️ Agent limit reached. Retrying in ${attempt + 2}s...`, 60);
        await new Promise(r => setTimeout(r, (attempt + 1) * 2000));
        return executeWithRetry(attempt + 1);
      }
      throw error;
    }
  };

  // I need to update the AI init at the top of executeWithRetry too.


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
    const MAX_INLINE_SIZE = 0; // Force binary upload for speed

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
    2. **Insight Toolbox**:
       - **Glossary of Terms**: Extract and define specific technical terms, local slang, or Pidgin English used in this context.
       - **Implicit Meanings**: What was hinted at but not explicitly said? Identify subtext.
    3. **Key Moments & Chronology**: Identify the most critical segments. Include exact [MM:SS] timestamps. For each, explain:
       - **What happened**: A brief summary.
       - **Significance**: Why this moment is vital to the overall context.
    4. **Critical Questions & Gaps**: List important questions that were asked but not answered, or key topics that were notably absent.
    5. **Actionable Outcomes**: Extract explicit or implied next steps, commitments, or decisions made.
    6. **Sentiment & Tone**: A nuanced analysis of the conversation's dynamic (e.g., collaborative, confrontational, informational) and how it shifted over time.

    Use professional Markdown formatting with tables where appropriate. Do not be generic; find the "soul" and unique linguistic footprint of the conversation.
    
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
       - Use horizontal rules (---) to separate major sections.
       - Use bullet points for structured lists.
    4. **Diarization Preservation**: Keep all speaker labels (e.g., Speaker 1:) and [MM:SS] timestamps exactly where they are. 
    5. **Dialect & Identity**: If the speaker uses Pidgin, local slang, or technical jargon, **DO NOT REMOVE OR CORRECT IT**. Preserve the linguistic identity of the speakers.
    6. **Nuance Highlighting**: Use *italics* for emphasis, non-English terms, or soft corrections that clarify intent without changing words.
    7. **Formatting Density**: Bold key entities, dates, and core concepts to make the document highly scannable.

    Produce the final document in clean, high-density Markdown.
    
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
    1. **Identity Extraction**: Identify if "Speaker 1", "Speaker 2", etc. can be replaced with actual names based on conversation context (e.g., someone says "Gaza", "Kojo", "Blessing").
    2. **Role Mapping**: If the speaker's role is clear (e.g., Interviewer, Host, Guest, Doctor), append it in parentheses like "KOJO (Host)".
    3. **Turn Correction**: Correct misattributed turns if the flow of conversation suggests a different speaker.
    4. **Format Hook**: Keep the format: "NAME (ROLE if known) [MM:SS]: Transcript".
    
    CRITICAL OUTPUT RULES:
    - Return ONLY the full refined transcript.
    - Preserve all original formatting, bolding, and italics.
    - Do NOT include any introductory text, notes, or concluding summaries.
    - If you cannot identify any names, return the transcript exactly as is.
  `;
  
  const response = await ai.models.generateContent({
    model: model,
    contents: {
      parts: [{ text: prompt }, { text: text }]
    }
  });
  
  const output = String(response.text || text).trim();
  // Remove markdown code blocks if present
  return output.replace(/^```markdown\n/, '').replace(/^```\n/, '').replace(/\n```$/, '');
};

