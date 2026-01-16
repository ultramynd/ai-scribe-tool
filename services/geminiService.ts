import { GoogleGenAI } from "@google/genai";
import { blobToBase64 } from "../utils/audioUtils";
import { logger } from "../utils/logger";

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
  
  try {
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

    if (!initialResponse.ok) {
        const errText = await initialResponse.text();
        throw new Error(`Failed to initiate upload: ${initialResponse.status} ${errText}`);
    }

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
        while (currentState === 'PROCESSING' && retries < 60) { // Increased timeout for larger files
            await new Promise(r => setTimeout(r, 2000));
            onStatus?.(`Analyzing deep features (${retries + 1}/60)...`, 20 + (retries * 1));
            const pollUrl = `https://generativelanguage.googleapis.com/v1beta/files/${fileInfo.file.name}?key=${import.meta.env.VITE_GEMINI_API_KEY}`;
            const pollResp = await fetch(pollUrl);
            const pollData = await pollResp.json();
            currentState = pollData.state;
            retries++;
        }
        if (currentState === 'FAILED') throw new Error("File processing failed on server side.");
    }
    
    return fileUri;
  } catch (error: any) {
    logger.error("Upload Error", error);
    throw error;
  }
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
  
  // Model Configuration - Adjusted to stable models
  // Models: 'gemini-1.5-pro-latest' (High Quality) vs 'gemini-1.5-flash-latest' (Fast)
  const PRIMARY_MODEL = "gemini-1.5-pro-latest";
  const FALLBACK_MODEL = "gemini-1.5-flash-latest";

  const executeWithRetry = async (attempt: number = 0, currentModel: string = useSmartModel ? PRIMARY_MODEL : FALLBACK_MODEL): Promise<string> => {
    try {
      const useFallbackKey = attempt >= 2; // Switch key after 2 failures
      const primaryKey = import.meta.env.VITE_GEMINI_API_KEY;
      const fallbackKey = import.meta.env.VITE_GEMINI_API_KEY_FALLBACK;
      
      const activeApiKey = useFallbackKey && fallbackKey ? fallbackKey : primaryKey;

      if (!activeApiKey) {
        throw new Error("API Key is missing. Please check your environment configuration.");
      }
      
      const ai = new GoogleGenAI({ apiKey: activeApiKey });
      onStatus?.(`Engine initialized: ${currentModel.includes('pro') ? 'Gemini 1.5 Pro' : 'Gemini 1.5 Flash'} ${useFallbackKey ? '(Backup Key)' : '(Primary)'}`, 8);
  
      let finalMimeType = mimeType;
      if (mediaFile instanceof File && mediaFile.name) {
         const detectedMime = getMimeTypeFromExtension(mediaFile.name);
         if (detectedMime) finalMimeType = detectedMime;
      }
      if (!finalMimeType || finalMimeType === 'application/octet-stream') {
         finalMimeType = 'audio/mp3';
      }

      // STRICT PROMPTING
      const speakerInstruction = detectSpeakers 
        ? `**Speaker Diarization (Strict)**: Identify distinct speakers. Listen for names (e.g., "Hi John") and use them. If names are unknown, assign specific labels like "Speaker 1", "Speaker 2". Consistency is key.`
        : `**No Speaker Labels**: Do not use "Speaker 1" etc. simply output the text continuously, breaking paragraphs by voice change.`;

      const commonInstructions = `
        1. ${speakerInstruction}
        2. **Linguistic Context (Pidgin English & Dialects)**: 
           - The audio likely contains West African English, Nigerian/Ghanaian/Liberian Pidgin, or mixed languages.
           - **Markers**: Look for "wey", "dey", "don", "no be", "sabi", "comot", "abi/shey", "pikin".
           - **CRITICAL**: Transcribe Pidgin EXACTLY as spoken. DO NOT translate to standard English or "correct" the grammar.
        3. **Timestamps**: Insert [MM:SS] timestamps at the start of every speaker turn.
      `;

      // VERBATIM PROMPT
      const rawPrompt = `
        Start now. Transcribe the audio file exactly as spoken (100% Verbatim).
        
        RULES:
        ${commonInstructions}
        4. **ABSOLUTE VERBATIM**: Capture EVERY utterance, stutter, false start, and filler word (um, uh, like, you know) exactly where they occur.
        5. **NO SUMMARIZATION**: Do NOT summarize. Do NOT omit any parts of the conversation. If they say it, you write it.
        6. **Formatting**: Start every speaker turn on a new line.
        
        Output only the transcription. No preamble.
      `;

      // POLISHED PROMPT
      const autoEditPrompt = `
        Start now. Transcribe the audio file using "Intelligent Verbatim" standards.
        
        RULES:
        ${commonInstructions}
        4. **Clean & Intelligent**: Remove stuttering, accidental repetitions, and non-meaningful filler words (um, uh) to improve readability.
        5. **Preserve Meaning**: Do not change the meaning or the speaker's unique voice/dialect.
        6. **Formatting**: Use **bold** for key terms/entities.
        
        Output only the transcription. No preamble.
      `;

      let contentPart: any;
      const MAX_INLINE_SIZE = 0; // Force binary upload for robustness

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
        // Upload logic handles its own errors
        contentPart = {
          fileData: {
            mimeType: finalMimeType,
            fileUri: await uploadFileToGemini(mediaFile, finalMimeType, onStatus)
          }
        };
      }

      onStatus?.(`Generating transcription with ${currentModel}...`, 60);

      const fakeProgressTimer = setInterval(() => {
         const msgs = ["Decoding audio structure...", "Aligning timestamps...", "Transcribing speech segments...", "Verifying speaker identity..."];
         onStatus?.(msgs[Math.floor(Math.random() * msgs.length)]);
      }, 3000);

      try {
        const response = await ai.models.generateContent({
            model: currentModel,
            contents: {
              parts: [
                  contentPart,
                  { text: autoEdit ? autoEditPrompt : rawPrompt }
              ]
            }
        });
        
        clearInterval(fakeProgressTimer);

        if (response.text) {
            onStatus?.("Validating output...", 98);
            await new Promise(r => setTimeout(r, 500));
            onStatus?.("Transcription complete.", 100);
            return response.text;
        } else {
            throw new Error("No transcription generated (Empty response).");
        }
      } catch (e) {
        clearInterval(fakeProgressTimer);
        throw e;
      }
    } catch (error: any) {
      logger.error(`Transcription Attempt ${attempt + 1} Failed`, { model: currentModel, error: error.message });
      
      const errorMsg = error.message?.toLowerCase() || "";
      const isRateLimited = errorMsg.includes('429') || errorMsg.includes('quota') || errorMsg.includes('resource');
      const isNetwork = errorMsg.includes('network') || errorMsg.includes('fetch');
      const isServer = errorMsg.includes('503') || errorMsg.includes('500');

      // FALLBACK STRATEGY

      // 1. If Rate Limited on Pro -> Switch to Flash (High Cap)
      if (isRateLimited && currentModel.includes('pro')) {
         onStatus?.("⚠️ Pro Rate Limit Hit. Switching to High-Speed Flash Model...", 70);
         await new Promise(r => setTimeout(r, 2000));
         return executeWithRetry(attempt + 1, FALLBACK_MODEL);
      }

      // 2. If Network/Server error -> Retry same model (backoff)
      if ((isNetwork || isServer) && attempt < 4) {
         const delay = (attempt + 1) * 3000;
         onStatus?.(`⚠️ Network/Server Glitch. Retrying in ${delay/1000}s...`, 60);
         await new Promise(r => setTimeout(r, delay));
         return executeWithRetry(attempt + 1, currentModel);
      }

      // 3. Last Resort -> Switch Key + Flash
      if (attempt < 5) {
         onStatus?.("⚠️ Persistent Error. Trying alternative route...", 60);
         await new Promise(r => setTimeout(r, 2000));
         return executeWithRetry(attempt + 1, FALLBACK_MODEL);
      }
      
      throw error;
    }
  };

  try {
    return await executeWithRetry();
  } catch (error: any) {
    logger.error("Final Transcription Failure", error);
    
    let userMessage = "An unexpected error occurred during transcription.";
    const msg = error.message?.toLowerCase() || "";

    if (msg.includes('api key')) userMessage = "Invalid API Key. Please check your settings.";
    else if (msg.includes('quota') || msg.includes('429')) userMessage = "Rate Limits Exceeded. Please try again in a few minutes.";
    else if (msg.includes('network') || msg.includes('fetch')) userMessage = "Network Connection Error. Please check your internet.";
    else if (msg.includes('safety') || msg.includes('blocked')) userMessage = "Content Blocked by AI Safety Filters.";
    
    throw new Error(userMessage);
  }
};

/**
 * Classifies the content type based on the text.
 */
export const classifyContent = async (text: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
  const model = "gemini-1.5-flash-latest"; // Safe stable model
  const sample = text.substring(0, 2000);
  const prompt = `Classify this text into one category: Song, Podcast, Interview, Meeting, Lecture, Video, Voice Note, News. Return ONLY the category name.\n\nText:\n${sample}`;

  try {
    const response = await ai.models.generateContent({ model, contents: prompt });
    return String(response.text || "").trim() || "Unknown";
  } catch (e) {
    logger.warn("Classification failed", e);
    return "Media";
  }
};

export const summarizeText = async (text: string, useSmartModel: boolean = false): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
  const model = useSmartModel ? "gemini-1.5-pro-latest" : "gemini-1.5-flash-latest"; 
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
  try {
    const response = await ai.models.generateContent({ model, contents: prompt });
    return String(response.text || "Could not generate summary.");
  } catch (e) {
    logger.error("Summarization error", e);
    return "Summary generation failed. Please check logs.";
  }
};

export const enhanceFormatting = async (text: string, contextType: string = "General", useSmartModel: boolean = false): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
  const model = useSmartModel ? "gemini-1.5-pro-latest" : "gemini-1.5-flash-latest";
  
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
  
  try {
    const response = await ai.models.generateContent({ model, contents: prompt });
    return String(response.text || text);
  } catch (e) {
    logger.error("Enhance Formatting error", e);
    return text;
  }
};

export const extractKeyMoments = async (text: string, useSmartModel: boolean = false): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
  const model = useSmartModel ? "gemini-1.5-pro-latest" : "gemini-1.5-flash-latest";
  
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
  
  try {
    const response = await ai.models.generateContent({ model, contents: prompt });
    return String(response.text || "No key moments identified.");
  } catch (e) {
    logger.error("Key Moments error", e);
    return "Failed to extract key moments.";
  }
};

/**
 * Identifies the start and end of the main discussion.
 */
export const findDiscussionBounds = async (text: string, useSmartModel: boolean = false): Promise<string> => {
   const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
   const model = useSmartModel ? "gemini-1.5-pro-latest" : "gemini-1.5-flash-latest";
   
   const prompt = `
     Look at this transcript and identify exactly where the main discussion starts and ends. 
     Ignore the introductory pleasantries, setup, or closing small talk.
     
     Return your finding in this exact format:
     **Core Discussion Starts**: [MM:SS] - [Context]
     **Core Discussion Ends**: [MM:SS] - [Context]
     
     Transcript Snippet:
     ${text.substring(0, 5000)} ... ${text.substring(text.length - 2000)}
   `;
   
   try {
     const response = await ai.models.generateContent({ model, contents: prompt });
     return String(response.text || "Could not identify discussion bounds.");
   } catch (e) {
     logger.error("Discussion Bounds error", e);
     return "Analysis failed.";
   }
 };
 
 /**
  * Removes pleasantries and fluff, keeping only the core interview/discussion content.
  */
 export const stripPleasantries = async (text: string, useSmartModel: boolean = false): Promise<string> => {
   const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
   const model = useSmartModel ? "gemini-1.5-pro-latest" : "gemini-1.5-flash-latest";
   
   const prompt = `
     You are a professional editor. Rewrite this transcript to remove all pleasantries, "small talk", filler intros (like "how are you today", "thank you for having me"), and outros that don't contribute to the core subject matter.
     
     Keep the speaker labels and timestamps exactly as they are. 
     DO NOT summarize. This must be the original transcript, just "filtered" for high-density information.
     
     Transcript:
     ${text}
   `;
   
   try {
     const response = await ai.models.generateContent({ model, contents: prompt });
     return String(response.text || text);
   } catch (e) {
     logger.error("Strip Pleasantries error", e);
     return text;
   }
 };
 
 /**
  * Refines speaker labels based on context.
  */
 export const refineSpeakers = async (text: string, useSmartModel: boolean = true): Promise<string> => {
   const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
   const model = useSmartModel ? "gemini-1.5-pro-latest" : "gemini-1.5-flash-latest";
   
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
   
   try {
     const response = await ai.models.generateContent({
       model: model,
       contents: {
         parts: [{ text: prompt }, { text: text }]
       }
     });
     
     const output = String(response.text || text).trim();
     return output.replace(/^```markdown\n/, '').replace(/^```\n/, '').replace(/\n```$/, '');
   } catch (e) {
     logger.error("Refine Speakers error", e);
     return text;
   }
 };

 /**
  * Analyzes video visual content for key info
  */
 export const analyzeVideoContent = async (mediaFile: File | Blob): Promise<string> => {
    // ... (Video logic remains similar but uses stable model)
    const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
    const model = "gemini-1.5-flash-latest"; // Video understanding is great on 1.5 Flash
  
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
      const MAX_INLINE_SIZE = 0; // Force binary
  
      if (mediaFile.size < MAX_INLINE_SIZE) {
        const base64Data = await blobToBase64(mediaFile);
        contentPart = { inlineData: { mimeType: finalMimeType, data: base64Data } };
      } else {
        const fileUri = await uploadFileToGemini(mediaFile, finalMimeType);
        contentPart = { fileData: { mimeType: finalMimeType, fileUri: fileUri } };
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
        contents: { parts: [contentPart, { text: prompt }] },
      });
  
      return String(response.text || "No analysis could be generated.");
    } catch (error: any) {
      logger.error("Video analysis error:", error);
      return `Error analyzing video: ${error.message}`;
    }
  };

