/**
 * Web Speech API Fallback Transcription Service
 * Uses the browser's built-in speech recognition as a fallback when AI is unavailable
 */

export interface FallbackTranscriptionOptions {
  language?: string;  // BCP-47 language code, default 'en-US'
  continuous?: boolean;
  interimResults?: boolean;
}

export interface TranscriptionResult {
  text: string;
  confidence: number;
  isFinal: boolean;
}

/**
 * Check if Web Speech API is supported in the browser
 */
export const isWebSpeechSupported = (): boolean => {
  return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
};

/**
 * Transcribe audio using Web Speech API by playing it through the audio context
 * Note: This requires the audio to be played and captured in real-time
 */
export const transcribeWithWebSpeech = (
  audioBlob: Blob,
  options: FallbackTranscriptionOptions = {},
  onProgress?: (result: TranscriptionResult) => void
): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!isWebSpeechSupported()) {
      reject(new Error("Web Speech API is not supported in this browser. Please use Chrome, Edge, or Safari."));
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.lang = options.language || 'en-US';
    recognition.continuous = true;
    recognition.interimResults = options.interimResults ?? true;
    recognition.maxAlternatives = 1;

    let fullTranscript = '';
    let audioElement: HTMLAudioElement | null = null;

    recognition.onresult = (event: any) => {
      let interimTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;
        
        if (result.isFinal) {
          fullTranscript += transcript + ' ';
          if (onProgress) {
            onProgress({
              text: transcript,
              confidence: result[0].confidence,
              isFinal: true
            });
          }
        } else {
          interimTranscript += transcript;
          if (onProgress) {
            onProgress({
              text: interimTranscript,
              confidence: result[0].confidence,
              isFinal: false
            });
          }
        }
      }
    };

    recognition.onerror = (event: any) => {
      if (audioElement) {
        audioElement.pause();
        URL.revokeObjectURL(audioElement.src);
      }
      
      let errorMessage = "Speech recognition error";
      switch (event.error) {
        case 'no-speech':
          errorMessage = "No speech detected in the audio. The audio may be too quiet or not contain speech.";
          break;
        case 'audio-capture':
          errorMessage = "Could not capture audio. Please check your microphone permissions.";
          break;
        case 'not-allowed':
          errorMessage = "Microphone access denied. Please allow microphone access to use speech recognition.";
          break;
        case 'network':
          errorMessage = "Network error during speech recognition. Please check your internet connection.";
          break;
        case 'aborted':
          // User or system aborted, resolve with what we have
          resolve(fullTranscript.trim() || "Transcription was interrupted.");
          return;
        default:
          errorMessage = `Speech recognition error: ${event.error}`;
      }
      reject(new Error(errorMessage));
    };

    recognition.onend = () => {
      if (audioElement) {
        audioElement.pause();
        URL.revokeObjectURL(audioElement.src);
      }
      resolve(fullTranscript.trim() || "No speech could be transcribed from the audio.");
    };

    // Create audio element to play the audio
    const audioUrl = URL.createObjectURL(audioBlob);
    audioElement = new Audio(audioUrl);
    
    // When audio ends, stop recognition
    audioElement.onended = () => {
      setTimeout(() => recognition.stop(), 1000); // Give a small delay for final results
    };

    audioElement.onerror = () => {
      recognition.stop();
      reject(new Error("Could not play audio file. The format may not be supported."));
    };

    // Start recognition and play audio
    try {
      recognition.start();
      audioElement.play().catch((err) => {
        recognition.stop();
        reject(new Error("Could not play audio. Please check if the file format is supported."));
      });
    } catch (err: any) {
      reject(new Error(`Failed to start speech recognition: ${err.message}`));
    }
  });
};

/**
 * Real-time transcription from microphone
 * This is useful when recording directly
 */
export const startLiveTranscription = (
  options: FallbackTranscriptionOptions = {},
  onResult: (result: TranscriptionResult) => void,
  onError: (error: Error) => void
): { stop: () => string } => {
  if (!isWebSpeechSupported()) {
    onError(new Error("Web Speech API is not supported in this browser."));
    return { stop: () => '' };
  }

  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const recognition = new SpeechRecognition();

  recognition.lang = options.language || 'en-US';
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  let fullTranscript = '';

  recognition.onresult = (event: any) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const transcript = result[0].transcript;
      
      if (result.isFinal) {
        fullTranscript += transcript + ' ';
      }
      
      onResult({
        text: result.isFinal ? fullTranscript : fullTranscript + transcript,
        confidence: result[0].confidence,
        isFinal: result.isFinal
      });
    }
  };

  recognition.onerror = (event: any) => {
    if (event.error !== 'aborted') {
      onError(new Error(`Speech recognition error: ${event.error}`));
    }
  };

  recognition.start();

  return {
    stop: () => {
      recognition.stop();
      return fullTranscript.trim();
    }
  };
};
