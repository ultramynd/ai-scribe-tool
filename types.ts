export enum AudioSource {
  MICROPHONE = 'MICROPHONE',
  FILE = 'FILE',
  URL = 'URL'
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

export type ArchiveStatus = 'loading' | 'complete' | 'error';

export interface ArchiveItem {
  id: string;
  name: string;
  text: string;
  date: string;
  status: ArchiveStatus;
  progress: number;
  error?: string;
  audioUrl?: string | null;
}
