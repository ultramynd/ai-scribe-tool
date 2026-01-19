import { blobToBase64 } from "../utils/audioUtils";
import { logger } from "../utils/logger";
import { AI_MODELS, FALLBACK_CONFIG } from "../src/config/aiModels";

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

const USE_SERVER_PROXY = import.meta.env.VITE_GEMINI_USE_PROXY === 'true';

const getMimeTypeFromExtension = (filename: string): string | null => {

  const ext = filename.split('.').pop()?.toLowerCase();
  return ext ? MIME_TYPE_MAP[ext] || null : null;
};

/**
 * Returns the appropriate API key based on the attempt count.
 */
const getActiveApiKey = (attempt: number): string => {
  const primaryKey = import.meta.env.VITE_GEMINI_API_KEY;
  const fallbackKey = import.meta.env.VITE_GEMINI_API_KEY_FALLBACK;
  
  // Switch to backup key if we've reached the threshold defined in config
  if (attempt >= FALLBACK_CONFIG.SWITCH_TO_BACKUP_KEY_ATTEMPT && fallbackKey) {
    return fallbackKey;
  }
  return primaryKey;
};

/**
 * Generic wrapper for Gemini AI Generation requests with manual XHR for maximum stability.
 * This bypasses the SDK's internal fetch() to prevent "Failed to fetch" errors.
 */
async function executeGaiRequest(
  payload: any,
  model: string,
  onStatus?: StatusCallback,
  attempt: number = 0,
  timeoutMs: number = 300000
): Promise<any> {
  const apiKey = getActiveApiKey(attempt);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  try {
      if (USE_SERVER_PROXY) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
          const response = await fetch('/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, payload }),
            signal: controller.signal
          });

          const text = await response.text();
          if (!response.ok) {
            throw new Error(`AI Error (${response.status}): ${text}`);
          }

          const data = JSON.parse(text);
          if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
            return { text: data.candidates[0].content.parts[0].text };
          }
          return data;
        } finally {
          clearTimeout(timeoutId);
        }
      }


    return await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      xhr.setRequestHeader('Content-Type', 'application/json');

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
               resolve({ text: data.candidates[0].content.parts[0].text });
            } else {
               resolve(data);
            }
          } catch (e) {
            reject(new Error("Failed to parse AI response."));
          }
        } else {
          const msg = `AI Error (${xhr.status}): ${xhr.responseText}`;
          reject(new Error(msg));
        }
      };

      xhr.onerror = () => reject(new Error("Network connection lost during AI generation."));
      xhr.ontimeout = () => reject(new Error("AI generation timed out (5 minutes). Please try again."));
      xhr.timeout = 300000; // 5 minutes for generation
      xhr.send(JSON.stringify(payload));
    });
  } catch (error: any) {
    logger.error(`AI Request Attempt ${attempt + 1} Failed`, { model, error: error.message });

    const msg = error.message?.toLowerCase() || "";
    const isRateLimited = msg.includes('429') || msg.includes('quota');
    const isServerErr = msg.includes('500') || msg.includes('503');

    if (attempt < FALLBACK_CONFIG.MAX_RETRIES && (isRateLimited || isServerErr)) {
      const isLastDitch = attempt + 1 >= FALLBACK_CONFIG.SWITCH_TO_BACKUP_KEY_ATTEMPT;
      if (onStatus) {
        if (isRateLimited) onStatus(isLastDitch ? "Switching to backup engine..." : "Rate limit reached, retrying...");
        else onStatus("Connection lost, reconnecting...");
      }

      if (isRateLimited && import.meta.env.VITE_GEMINI_USE_PROXY === 'true') {
        const minutes = isLastDitch ? 3 : 2;
        onStatus?.(`Cooling down for ${minutes} minutes...`, 60);
        await new Promise(r => setTimeout(r, minutes * 60 * 1000));
      } else {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(r => setTimeout(r, delay));
      }

      return executeGaiRequest(payload, model, onStatus, attempt + 1, timeoutMs);
    }
    throw error;

  }
}


export type StatusCallback = (message: string, progress?: number) => void;

/**
 * Helper to upload large files to Gemini API with XHR for better stability and progress tracking.
 */
const uploadFileToGemini = async (
  mediaFile: File | Blob, 
  mimeType: string, 
  onStatus?: StatusCallback,
  attempt: number = 0
): Promise<string> => {
  const apiKey = getActiveApiKey(attempt);
  const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`;
  const displayName = mediaFile instanceof File ? mediaFile.name : 'uploaded_media';

  onStatus?.(`${attempt > 0 ? 'Retrying' : 'Initializing'} resumable upload (${Math.round(mediaFile.size / 1024 / 1024)}MB)...`, 5);

  try {
    // 1. Initial request to get the resumable session URL using XHR for maximum stability
    let sessionUrl: string;
    try {
      if (USE_SERVER_PROXY) {
        const response = await fetch('/api/gemini-upload-init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            displayName,
            mimeType,
            size: mediaFile.size
          })
        });

        if (response.status === 429) {
          return uploadFileToGemini(mediaFile, mimeType, onStatus, attempt + 1);
        }

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Upload Session Init Failed (${response.status}): ${text}`);
        }

        const data = await response.json();
        if (!data?.uploadUrl) {
          throw new Error('No upload session URL in response');
        }
        sessionUrl = data.uploadUrl;
      } else {
        sessionUrl = await new Promise<string>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', uploadUrl);
          xhr.setRequestHeader('X-Goog-Upload-Protocol', 'resumable');
          xhr.setRequestHeader('X-Goog-Upload-Command', 'start');
          xhr.setRequestHeader('X-Goog-Upload-Header-Content-Length', mediaFile.size.toString());
          xhr.setRequestHeader('X-Goog-Upload-Header-Content-Type', mimeType);
          xhr.setRequestHeader('Content-Type', 'application/json');

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              const url = xhr.getResponseHeader('x-goog-upload-url');
              if (url) resolve(url);
              else reject(new Error("No upload session URL in response"));
            } else {
               if (xhr.status === 429 && attempt < 1 && import.meta.env.VITE_GEMINI_API_KEY_FALLBACK) {
                  reject({ isRateLimit: true });
               } else {
                  reject(new Error(`Upload Session Init Failed (${xhr.status}): ${xhr.responseText}`));
               }
            }
          };
          xhr.onerror = () => reject(new Error("Network connection failed during upload initialization."));
          xhr.ontimeout = () => reject(new Error("Upload initialization timed out (30 seconds)."));
          xhr.timeout = 30000; // 30 seconds for init
          xhr.send(JSON.stringify({ file: { display_name: displayName, mime_type: mimeType } }));
        });
      }
    } catch (e: any) {
      if (e.isRateLimit) return uploadFileToGemini(mediaFile, mimeType, onStatus, attempt + 1);
      throw e;
    }



    // 2. Perform the actual upload using XHR for better progress and reliability
    const fileInfo = await new Promise<any>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', sessionUrl);
      xhr.setRequestHeader('X-Goog-Upload-Offset', '0');
      xhr.setRequestHeader('X-Goog-Upload-Command', 'upload, finalize');
      
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          const progress = 10 + Math.round((event.loaded / event.total) * 40);
          onStatus?.(`Uploading media: ${percent}%`, progress);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch (e) {
            reject(new Error("Failed to parse server response after upload."));
          }
        } else {
          reject(new Error(`Upload failed with status: ${xhr.status} ${xhr.responseText}`));
        }
      };

      xhr.onerror = () => reject(new Error("Network error during upload (XHR)."));
      xhr.ontimeout = () => reject(new Error("File upload timed out (30 minutes)."));
      xhr.timeout = 1800000; // 30 minutes for upload (support up to 2GB)
      xhr.send(mediaFile);
    });

    // Extract metadata robustly (API returns File object, but SDK wraps it)
    const fileName = fileInfo.file?.name || fileInfo.name;
    const fileUri = fileInfo.file?.uri || fileInfo.uri;
    
    if (!fileName) {
      console.error("Upload response missing name:", fileInfo);
      throw new Error("Server did not return a valid resource name.");
    }

    // 3. Polling for file readiness
    onStatus?.("Server-side processing...", 50);
    let retries = 0;
    const MAX_POLL_RETRIES = 300; // ~15 minutes
    
    // Ensure we don't duplicate 'files/' prefix in the path
    const pollPath = fileName.startsWith('files/') ? fileName : `files/${fileName}`;
    
    while (retries < MAX_POLL_RETRIES) {
      try {
        const pollData = USE_SERVER_PROXY
          ? await (async () => {
              const response = await fetch('/api/gemini-poll', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileName: pollPath })
              });

              if (!response.ok) {
                const text = await response.text();
                throw new Error(`Polling failed with status: ${response.status} ${text}`);
              }

              return response.json();
            })()
          : await new Promise<any>((resolve, reject) => {
              const pollUrl = `https://generativelanguage.googleapis.com/v1beta/${pollPath}?key=${getActiveApiKey(attempt)}`;
              const xhr = new XMLHttpRequest();
              xhr.open('GET', pollUrl);
              xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                  try { resolve(JSON.parse(xhr.responseText)); }
                  catch (e) { reject(new Error("Failed to parse server status.")); }
                } else {
                  reject(new Error(`Polling failed with status: ${xhr.status}`));
                }
              };
              xhr.onerror = () => reject(new Error("Network link lost during server processing..."));
              xhr.ontimeout = () => reject(new Error("Status polling timed out (30 seconds)."));
              xhr.timeout = 30000; // 30 seconds for polling
              xhr.send();
            });

        
        if (pollData.state === 'ACTIVE') return fileUri;
        if (pollData.state === 'FAILED') throw new Error("File processing failed on server.");
      } catch (pollErr: any) {
        // If it's a network error or timeout during polling, we don't want to crash. 
        // We just log it and let the loop retry.
        logger.warn(`Polling attempt ${retries + 1} encountered an issue: ${pollErr.message}. Retrying...`);
        if (pollErr.message.includes("failed on server")) throw pollErr; 
      }
      
      // Dynamic delay: Start fast, slow down to 4s for long-running processes
      const delay = retries < 10 ? 2000 : 4000;
      await new Promise(r => setTimeout(r, delay));
      
      retries++;
      // Visual progress capped at 99% for polling
      const pollProgress = Math.min(99, 50 + Math.floor((retries / MAX_POLL_RETRIES) * 45));
      onStatus?.(`AI Engine: Processing... (Attempt ${retries}/${MAX_POLL_RETRIES})`, pollProgress);
    }
    throw new Error("Polling timeout: File took too long to process on server. (Max 15 minutes reached)");
  } catch (error: any) {
    logger.error("Upload process failed", error);
    if ((error.message.includes('429') || error.message.includes('fetch')) && attempt < 1) {
      return uploadFileToGemini(mediaFile, mimeType, onStatus, attempt + 1);
    }
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

  // --- 1. PREPARE CONTENT (Upload ONCE) ---
  let finalMimeType = mimeType;
  if (mediaFile instanceof File && mediaFile.name) {
      const detectedMime = getMimeTypeFromExtension(mediaFile.name);
      if (detectedMime) finalMimeType = detectedMime;
  }
  if (!finalMimeType || finalMimeType === 'application/octet-stream') {
      finalMimeType = 'audio/mp3';
  }

  let contentPart: any;
  const MAX_INLINE_SIZE = 20 * 1024 * 1024; // 20MB Limit for Inline (Boosted for speed)

  try {
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
      // This happens BEFORE the retry loop, so we don't re-upload on 429/503
      const fileUri = await uploadFileToGemini(mediaFile, finalMimeType, onStatus);
      contentPart = {
        fileData: {
          mimeType: finalMimeType,
          fileUri: fileUri
        }
      };
    }
  } catch (prepError: any) {
    logger.error("Media Preparation Failed", prepError);
    throw new Error(`Media Upload Failed: ${prepError.message}`);
  }

  // --- 2. EXECUTE WITH RETRY (Generation Only) ---
  
  // Model Configuration from Central Config
  const PRIMARY_MODEL = AI_MODELS.PRIMARY;
  const FALLBACK_MODEL = AI_MODELS.FAST;

  // We define the generation logic as a separate function that DOES NOT include the upload
  const executeGeneration = async (attempt: number = 0, currentModel: string = useSmartModel ? PRIMARY_MODEL : FALLBACK_MODEL): Promise<string> => {
    try {
      // Use fallback config thresholds
      const useFallbackKey = attempt >= FALLBACK_CONFIG.SWITCH_TO_BACKUP_KEY_ATTEMPT; 
      const primaryKey = import.meta.env.VITE_GEMINI_API_KEY;
      const fallbackKey = import.meta.env.VITE_GEMINI_API_KEY_FALLBACK;
      
      const activeApiKey = useFallbackKey && fallbackKey ? fallbackKey : primaryKey;

      if (!activeApiKey) {
        throw new Error("API Key is missing. Please check your environment configuration.");
      }
      
      // manual construction of part object
      const modelName = currentModel;
      
      onStatus?.(`Engine initialized: ${modelName} ${useFallbackKey ? '(Backup Key)' : '(Primary)'} (Attempt ${attempt + 1})`, 8);

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

      onStatus?.(`Generating transcription with ${modelName}...`, 60);

      const fakeProgressTimer = setInterval(() => {
         const msgs = ["Decoding audio structure...", "Aligning timestamps...", "Transcribing speech segments...", "Verifying speaker identity..."];
         onStatus?.(msgs[Math.floor(Math.random() * msgs.length)]);
      }, 3000);

      const payload = {
        contents: [{
          parts: [
            contentPart,
            { text: autoEdit ? autoEditPrompt : rawPrompt }
          ]
        }]
      };
 
       const response = await executeGaiRequest(payload, modelName, onStatus, attempt, 600000);

      
      clearInterval(fakeProgressTimer);

       if (response.text) {
           onStatus?.("Transcription complete.", 100);
           return response.text;
       }
       throw new Error("No transcription generated (Empty response). Gemini returned no text.");

    } catch (error: any) {
      logger.error(`Transcription Attempt ${attempt + 1} Failed`, { model: currentModel, error: error.message });
      
      const errorMsg = error.message?.toLowerCase() || "";
      const isRateLimited = errorMsg.includes('429') || errorMsg.includes('quota') || errorMsg.includes('resource');
      const isNetwork = errorMsg.includes('network') || errorMsg.includes('fetch');
      const isServer = errorMsg.includes('503') || errorMsg.includes('500');

      const maxRetries = FALLBACK_CONFIG.MAX_RETRIES; // Hard cap: 3 retries

      if (attempt >= maxRetries) {
        logger.error(`All ${maxRetries} retry attempts exhausted.`, { model: currentModel, error: error.message });
        throw error;
      }

      // FALLBACK STRATEGY

      // 1. High Demand / Rate Limit -> Switch to High-Availability Model (Fast)
      if (isRateLimited) {
         onStatus?.("High demand detected. Rerouting to high-availability engine...", 70);
         await new Promise(r => setTimeout(r, 2000));
         return executeGeneration(attempt + 1, FALLBACK_MODEL);
      }

      // 2. Network/Server error -> Retry same model (backoff)
      if ((isNetwork || isServer)) {
         const delay = (attempt + 1) * FALLBACK_CONFIG.RETRY_DELAY_MS;
         onStatus?.(`Re-establishing secure connection (Attempt ${attempt + 1})...`, 60);
         await new Promise(r => setTimeout(r, delay));
         
         // If we've retried the same model too many times, switch to fast model
         if (attempt > FALLBACK_CONFIG.SWITCH_TO_FAST_MODEL_ATTEMPT) {
             return executeGeneration(attempt + 1, FALLBACK_MODEL);
         }
         return executeGeneration(attempt + 1, currentModel);
      }

      // 3. Last Resort -> Switch Key + Flash (Explicit Strategy)
      if (attempt >= FALLBACK_CONFIG.SWITCH_TO_BACKUP_KEY_ATTEMPT) {
         onStatus?.(`Switching to backup engine... (Attempt ${attempt + 1}/${maxRetries})`, 60);
         await new Promise(r => setTimeout(r, 2000));
         return executeGeneration(attempt + 1, FALLBACK_MODEL);
      }
      
      // Default retry
      await new Promise(r => setTimeout(r, 2000));
      return executeGeneration(attempt + 1, FALLBACK_MODEL);
    }
  };

  try {
    return await executeGeneration();
  } catch (error: any) {
    logger.error("Final Transcription Failure", error);
    
    let userMessage = "An unexpected error occurred during transcription.";
    const msg = error.message?.toLowerCase() || "";

    if (msg.includes('api key')) userMessage = "Invalid API Key. Please check your settings.";
    else if (msg.includes('quota') || msg.includes('429')) {
      const now = new Date();
      // Gemini free-tier quotas typically reset every 60 seconds. 
      // We estimate 65 seconds from now to be safe.
      const resetTime = new Date(now.getTime() + 65 * 1000).toLocaleTimeString([], { 
        hour: '2-digit', minute: '2-digit', second: '2-digit' 
      });
      userMessage = `Daily/Per-Minute Quota Exceeded. You can try again at approximately ${resetTime}.`;
    }
    else if (msg.includes('network') || msg.includes('fetch')) userMessage = "Network Connection Error. Please check your internet.";
    else if (msg.includes('safety') || msg.includes('blocked')) userMessage = "Content Blocked by AI Safety Filters.";
    else if (msg.includes('media upload failed')) userMessage = error.message; // Pass through upload errors
    else userMessage = `Transcription Failed: ${error.message}`; // Fallback: Show actual error
    
    throw new Error(userMessage);
  }
};

/**
 * Classifies the content type based on the text.
 */
export const classifyContent = async (text: string): Promise<string> => {
  const model = AI_MODELS.FAST; 
  const sample = text.substring(0, 2000);
  const prompt = `Classify this text into one category: Song, Podcast, Interview, Meeting, Lecture, Video, Voice Note, News. Return ONLY the category name.\n\nText:\n${sample}`;
 
  try {
    const payload = { contents: [{ parts: [{ text: prompt }] }] };
      const response = await executeGaiRequest(payload, model, undefined, 0, 120000);

    return String(response.text || "").trim() || "Unknown";
  } catch (e) {
    logger.warn("Classification failed", e);
    return "Media";
  }
};
 
export const summarizeText = async (text: string, useSmartModel: boolean = false): Promise<string> => {
  const model = useSmartModel ? AI_MODELS.PRIMARY : AI_MODELS.FAST; 
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
    const payload = { contents: [{ parts: [{ text: prompt }] }] };
      const response = await executeGaiRequest(payload, model, undefined, 0, 120000);

    return String(response.text || "Could not generate summary.");
  } catch (e) {
    logger.error("Summarization error", e);
    return "Summary generation failed. Please check logs.";
  }
};

export const enhanceFormatting = async (text: string, contextType: string = "General", useSmartModel: boolean = false): Promise<string> => {
  const model = useSmartModel ? AI_MODELS.PRIMARY : AI_MODELS.FAST;
  
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
    const payload = { contents: [{ parts: [{ text: prompt }] }] };
      const response = await executeGaiRequest(payload, model, undefined, 0, 120000);

    return String(response.text || text);
  } catch (e) {
    logger.error("Enhance Formatting error", e);
    return text;
  }
};

export const extractKeyMoments = async (text: string, useSmartModel: boolean = false): Promise<string> => {
  const model = useSmartModel ? AI_MODELS.PRIMARY : AI_MODELS.FAST;
  
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
    const payload = { contents: [{ parts: [{ text: prompt }] }] };
      const response = await executeGaiRequest(payload, model, undefined, 0, 120000);

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
   const model = useSmartModel ? AI_MODELS.PRIMARY : AI_MODELS.FAST;
   
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
     const payload = { contents: [{ parts: [{ text: prompt }] }] };
       const response = await executeGaiRequest(payload, model, undefined, 0, 120000);

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
   const model = useSmartModel ? AI_MODELS.PRIMARY : AI_MODELS.FAST;
   
   const prompt = `
     You are a professional editor. Rewrite this transcript to remove all pleasantries, "small talk", filler intros (like "how are you today", "thank you for having me"), and outros that don't contribute to the core subject matter.
     
     Keep the speaker labels and timestamps exactly as they are. 
     DO NOT summarize. This must be the original transcript, just "filtered" for high-density information.
     
     Transcript:
     ${text}
   `;
   
   try {
     const payload = { contents: [{ parts: [{ text: prompt }] }] };
       const response = await executeGaiRequest(payload, model, undefined, 0, 120000);

     return String(response.text || text);
   } catch (e) {
     logger.error("Strip Pleasantries error", e);
     return text;
   }
 };
 
export const refineSpeakers = async (text: string, useSmartModel: boolean = true): Promise<string> => {
  const model = useSmartModel ? AI_MODELS.PRIMARY : AI_MODELS.FAST;
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
   const payload = {
     contents: [{ parts: [{ text: prompt }, { text: text }] }]
   };
   const response = await executeGaiRequest(payload, model);
   const output = String(response.text || text).trim();
   return output.replace(/^```markdown\n/, '').replace(/^```\n/, '').replace(/\n```$/, '');
 } catch (e) {
   logger.error("Refine Speakers error", e);
   return text;
 }
};
 
export const analyzeVideoContent = async (mediaFile: File | Blob): Promise<string> => {
    const model = AI_MODELS.VISION; // Video understanding is great on Vision/Flash
  
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
  
      const payload = {
        contents: [{ parts: [contentPart, { text: prompt }] }]
      };
      
        const response = await executeGaiRequest(payload, model, undefined, 0, 120000);

  
      return String(response.text || "No analysis could be generated.");
    } catch (error: any) {
      logger.error("Video analysis error:", error);
      return `Error analyzing video: ${error.message}`;
    }
  };

