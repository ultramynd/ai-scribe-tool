export enum AudioSource {
  MICROPHONE = 'MICROPHONE',
  FILE = 'FILE',
  URL = 'URL',
  LIVE = 'LIVE'
}

export interface TranscriptionState {
  isLoading: boolean;
  text: string | null;
  error: string | null;
}

export interface AudioFile {
  file: File | null;
  previewUrl: string | null;
  base64: string | null;
  mimeType: string | null;
}
