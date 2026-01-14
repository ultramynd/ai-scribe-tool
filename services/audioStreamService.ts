/**
 * Audio Streaming Service for Real-time Transcription
 * Uses MediaRecorder API (works in all modern browsers) to capture audio
 * Sends chunks to Groq Whisper API for transcription
 */

export class AudioStreamRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private onChunkReady: (chunk: Blob) => void;
  private onTranscriptUpdate: (text: string) => void;
  private chunkInterval: number;

  constructor(
    onChunkReady: (chunk: Blob) => void,
    onTranscriptUpdate: (text: string) => void,
    chunkIntervalMs: number = 5000 // Send chunks every 5 seconds for real-time transcription
  ) {
    this.onChunkReady = onChunkReady;
    this.onTranscriptUpdate = onTranscriptUpdate;
    this.chunkInterval = chunkIntervalMs;
  }

  async start(): Promise<void> {
    try {
      // Request microphone permission
      this.stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000 // Optimal for Whisper
        } 
      });

      // Determine best MIME type for browser
      const mimeType = this.getBestMimeType();
      
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType,
        audioBitsPerSecond: 128000
      });

      // Handle data available event
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this.chunks.push(e.data);
          this.onChunkReady(e.data);
        }
      };

      // Start recording with time slicing for real-time chunks
      this.mediaRecorder.start(this.chunkInterval);
      
      console.log(`[AudioStreamRecorder] Started recording with ${mimeType}`);
    } catch (error) {
      console.error('[AudioStreamRecorder] Failed to start:', error);
      throw new Error('Microphone access denied or not available');
    }
  }

  stop(): Blob {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
    }

    // Combine all chunks into final blob
    const finalBlob = new Blob(this.chunks, { type: this.getBestMimeType() });
    console.log(`[AudioStreamRecorder] Stopped. Total size: ${finalBlob.size} bytes`);
    
    return finalBlob;
  }

  pause(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause();
    }
  }

  resume(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      this.mediaRecorder.resume();
    }
  }

  isRecording(): boolean {
    return this.mediaRecorder?.state === 'recording';
  }

  private getBestMimeType(): string {
    // Try different MIME types in order of preference
    const types = [
      'audio/webm;codecs=opus',  // Best quality, widely supported
      'audio/webm',               // Fallback for WebM
      'audio/ogg;codecs=opus',    // Firefox fallback
      'audio/mp4',                // Safari
      'audio/wav'                 // Universal fallback
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return 'audio/webm'; // Default
  }

  getTotalDuration(): number {
    // Estimate duration based on chunks (rough estimate)
    return this.chunks.length * (this.chunkInterval / 1000);
  }

  clearChunks(): void {
    this.chunks = [];
  }
}
