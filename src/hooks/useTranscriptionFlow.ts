import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioFile, AudioSource, ArchiveItem, EditorTab, TranscriptionState } from '../../types';
import { transcribeAudio, transcribeFromDriveFile, DriveFileRef } from '../../services/geminiService';
import { splitAudioToWavChunks, offsetTranscriptTimestamps } from '../../utils/audioChunking';
import { validateMediaFile } from '../../utils/mediaValidation';

interface UseTranscriptionFlowOptions {
  activeTab: AudioSource | null;
  recordedBlob: Blob | null;
  micUrl: string | null;
  uploadedFile: AudioFile | null;
  transcription: TranscriptionState;
  transcriptionMode: 'verbatim' | 'polish';
  isSpeakerDetectEnabled: boolean;
  isDeepThinking: boolean;
  driveFileMeta: DriveFileRef | null;
  googleAccessToken: string | null;
  createTab: (data: Partial<EditorTab>) => string;
  setTabs: React.Dispatch<React.SetStateAction<EditorTab[]>>;
  setArchiveItems: React.Dispatch<React.SetStateAction<ArchiveItem[]>>;
  setShowArchiveSidebar: (val: boolean) => void;
  setContentType: (val: string | null) => void;
  setTranscription: React.Dispatch<React.SetStateAction<TranscriptionState>>;
}

export const useTranscriptionFlow = ({
  activeTab,
  recordedBlob,
  micUrl,
  uploadedFile,
  transcription,
  transcriptionMode,
  isSpeakerDetectEnabled,
  isDeepThinking,
  driveFileMeta,
  googleAccessToken,
  createTab,
  setTabs,
  setArchiveItems,
  setShowArchiveSidebar,
  setContentType,
  setTranscription
}: UseTranscriptionFlowOptions) => {
  const [progress, setProgress] = useState(0);
  const [logLines, setLogLines] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (transcription.isLoading) {
      setProgress(0);
      setLogLines(['➜ Initializing AI session...']);
    } else if (transcription.text) {
      setProgress(100);
    }
  }, [transcription.isLoading, transcription.text]);

  const updateStatusLog = useCallback((msg: string, prg?: number, tabId?: string | null) => {
    if (prg !== undefined) setProgress(prg);

    setLogLines(prev => {
      const lastLine = prev[prev.length - 1];
      if (lastLine && msg.startsWith('Uploading media:') && lastLine.startsWith('Uploading media:')) {
        return [...prev.slice(0, -1), msg];
      }
      return [...prev.slice(-4), msg];
    });

    if (tabId) {
      setTabs(prev => prev.map(tab => (tab.id === tabId ? { ...tab, transcription: { ...tab.transcription, isLoading: true } } : tab)));
    }
  }, [setTabs]);

  const executeTranscription = useCallback(
    async (mediaBlob: Blob | File, mimeType: string, onStatus?: (msg: string, prg?: number) => void, signal?: AbortSignal) => {
      let finalUseSmartModel = isDeepThinking;

      const isVideo = mimeType.startsWith('video/');
      const isLarge = (mediaBlob?.size || 0) > 15 * 1024 * 1024;

      if ((isVideo || isLarge) && !isDeepThinking) {
        onStatus?.('⚠️ High-complexity detected. Boosting to Deep Inference (Pro)...');
        finalUseSmartModel = true;
      }

      const autoEdit = transcriptionMode !== 'verbatim';

      // Chunking strategy for large audio files.
      // Chunks are resampled to 16kHz mono (~1.9 MB/min) so a 10-minute
      // chunk fits comfortably under Gemini's 20 MB inline limit.
      // A 3-hour recording becomes ~18 chunks instead of the old 60.
      const chunkSeconds = 10 * 60;

      // Only chunk large audio files (>35MB). Video is NOT chunked.
      const shouldChunk =
        mimeType.startsWith('audio/') &&
        (mediaBlob?.size || 0) > 35 * 1024 * 1024;

      if (!shouldChunk && mimeType.startsWith('video/') && (mediaBlob?.size || 0) > 35 * 1024 * 1024) {
        onStatus?.('Large video detected. Tip: export audio-only for faster, chunked processing.', 10);
      }

      if (shouldChunk) {
        onStatus?.('Preparing audio chunks...', 8);
        const { chunks, totalSeconds } = await splitAudioToWavChunks(mediaBlob as Blob, chunkSeconds);

        let combined = '';
        for (let i = 0; i < chunks.length; i += 1) {
          // Check for cancellation before each chunk
          if (signal?.aborted) {
            throw new Error('Transcription cancelled.');
          }

          const chunk = chunks[i];
          const base = 10;
          const span = 85;
          const prg = base + Math.round((i / Math.max(1, chunks.length)) * span);
          onStatus?.(`Transcribing segment ${i + 1}/${chunks.length}...`, prg);

          const partial = await transcribeAudio(
            chunk.blob,
            chunk.blob.type,
            autoEdit,
            isSpeakerDetectEnabled,
            finalUseSmartModel,
            (msg, p) => {
              if (p !== undefined) {
                const chunkP = base + Math.round(((i + p / 100) / chunks.length) * span);
                onStatus?.(msg, chunkP);
              } else {
                onStatus?.(msg);
              }
            }
          );

          combined += offsetTranscriptTimestamps(partial, Math.floor(chunk.startSeconds)) + '\n\n';
        }

        onStatus?.('Finalizing transcript...', 98);
        return combined.trim();
      }

      // Default single-shot path
      const text = await transcribeAudio(mediaBlob, mimeType, autoEdit, isSpeakerDetectEnabled, finalUseSmartModel, onStatus);
      return text;
    },
    [isDeepThinking, isSpeakerDetectEnabled, transcriptionMode]
  );

  const handleTranscribe = useCallback(async (overrides?: {
    source?: AudioSource | null;
    recordedBlob?: Blob | null;
    micUrl?: string | null;
    uploadedFile?: AudioFile | null;
    title?: string;
  }) => {
    let currentLoadingTabId: string | null = null;

    // Abort any previous in-flight transcription
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const resolvedSource = overrides?.source ?? activeTab;
      const resolvedRecordedBlob = overrides?.recordedBlob ?? recordedBlob;
      const resolvedMicUrl = overrides?.micUrl ?? micUrl;
      const resolvedUploadedFile = overrides?.uploadedFile ?? uploadedFile;

      const autoEdit = transcriptionMode !== 'verbatim';

      // ── Drive streaming path (no Blob in browser RAM) ──────────────────────
      if (resolvedSource === AudioSource.DRIVE && !resolvedUploadedFile?.file) {
        if (!driveFileMeta) throw new Error('No Drive file selected. Please pick a file first.');
        if (!googleAccessToken) throw new Error('Google Drive is not connected. Please sign in.');

        const initialTitle = overrides?.title || driveFileMeta.name || 'Drive Recording';
        currentLoadingTabId = createTab({
          title: initialTitle,
          transcription: { isLoading: true, text: null, error: null },
          recordedBlob: null, micUrl: null,
          uploadedFile: resolvedUploadedFile,
          isEditorMode: false
        });

        const text = await transcribeFromDriveFile(
          driveFileMeta, googleAccessToken, autoEdit,
          isSpeakerDetectEnabled, isDeepThinking,
          (msg, prg) => updateStatusLog(msg, prg, currentLoadingTabId)
        );

        setTabs(prev => prev.map(tab =>
          tab.id === currentLoadingTabId
            ? { ...tab, transcription: { isLoading: false, text, error: null } } : tab
        ));
        setArchiveItems(prev => [{
          id: Math.random().toString(36).substring(7), name: initialTitle, text,
          date: new Date().toLocaleString(), status: 'complete', progress: 100
        }, ...prev]);
        return;
      }
      // ─────────────────────────────────────────────────────────────────────

      let mediaBlob: Blob | File | null = null;
      let mimeType = '';

      if (resolvedSource === AudioSource.MICROPHONE) {
        if (!resolvedRecordedBlob) throw new Error('No recording found.');
        mediaBlob = resolvedRecordedBlob;
        mimeType = resolvedRecordedBlob.type;
      } else if (resolvedSource === AudioSource.FILE || resolvedSource === AudioSource.URL) {
        if (!resolvedUploadedFile?.file) throw new Error('No file selected.');
        mediaBlob = resolvedUploadedFile.file;
        mimeType = resolvedUploadedFile.file.type || '';
      } else if (resolvedSource === AudioSource.DRIVE) {
        // Drive with an actual file blob (pickerCallback fallback path)
        if (!resolvedUploadedFile?.file) throw new Error('No Drive file selected.');
        mediaBlob = resolvedUploadedFile.file;
        mimeType = resolvedUploadedFile.file.type || '';
      }

      if (!mediaBlob) throw new Error('No media found to transcribe.');

      const validation = validateMediaFile(mediaBlob, mimeType || (mediaBlob instanceof File ? mediaBlob.type : null));
      if (!validation.valid) {
        throw new Error(validation.message || 'Unsupported media file.');
      }

      const initialTitle = overrides?.title || resolvedUploadedFile?.file?.name || (resolvedSource === AudioSource.MICROPHONE ? 'Voice Recording' : 'Untitled');
      currentLoadingTabId = createTab({
        title: initialTitle,
        transcription: { isLoading: true, text: null, error: null },
        recordedBlob: resolvedRecordedBlob,
        micUrl: resolvedMicUrl,
        uploadedFile: resolvedUploadedFile,
        isEditorMode: false
      });

      const text = await executeTranscription(mediaBlob, mimeType, (msg, prg) => updateStatusLog(msg, prg, currentLoadingTabId), controller.signal);

      setTabs(prev => prev.map(tab => (tab.id === currentLoadingTabId ? { ...tab, transcription: { isLoading: false, text, error: null } } : tab)));

      const archiveId = Math.random().toString(36).substring(7);
      setArchiveItems(prev => [
        {
          id: archiveId,
          name: initialTitle,
          text,
          date: new Date().toLocaleString(),
          status: 'complete',
          progress: 100
        },
        ...prev
      ]);
    } catch (err: any) {
      // Don't show error for intentional cancellations
      if (err.message === 'Transcription cancelled.') {
        if (currentLoadingTabId) {
          setTabs(prev => prev.filter(tab => tab.id !== currentLoadingTabId));
        }
        return;
      }
      const errorMsg = err.message || 'An unexpected error occurred.';
      if (currentLoadingTabId) {
        setTabs(prev => prev.map(tab => (tab.id === currentLoadingTabId ? { ...tab, transcription: { isLoading: false, text: null, error: errorMsg } } : tab)));
      } else {
        setTranscription({ isLoading: false, text: null, error: errorMsg });
      }
    }
  }, [
    activeTab, createTab, executeTranscription, micUrl, recordedBlob,
    setArchiveItems, setTabs, setTranscription, updateStatusLog, uploadedFile,
    driveFileMeta, googleAccessToken, isSpeakerDetectEnabled, isDeepThinking,
    transcriptionMode
  ]);

  const handleBackgroundTranscribe = useCallback(async (file: AudioFile | DriveFileRef, source: AudioSource = AudioSource.FILE) => {
    const id = Math.random().toString(36).substring(7);

    let fileName = '';
    let isDrive = source === AudioSource.DRIVE;

    if (isDrive) {
      const driveMeta = file as DriveFileRef;
      fileName = driveMeta.name;
    } else {
      const audioFile = file as AudioFile;
      fileName = audioFile.file?.name || 'Untitled Transcription';
      const validation = audioFile.file ? validateMediaFile(audioFile.file, audioFile.file.type) : { valid: false, message: 'Missing file.' };
      if (!validation.valid) {
        setArchiveItems(prev => [
          {
            id,
            name: fileName,
            text: '',
            date: new Date().toLocaleString(),
            status: 'error',
            progress: 0,
            error: validation.message,
            audioUrl: audioFile.previewUrl
          },
          ...prev
        ]);
        return;
      }
    }

    const newItem: ArchiveItem = {
      id,
      name: fileName,
      text: '',
      date: new Date().toLocaleString(),
      status: 'loading',
      progress: 0,
      audioUrl: isDrive ? null : (file as AudioFile).previewUrl
    };

    setArchiveItems(prev => [newItem, ...prev]);
    setShowArchiveSidebar(true);

    try {
      let text = '';
      if (isDrive) {
        if (!googleAccessToken) throw new Error("Google Drive access token missing.");
        text = await transcribeFromDriveFile(
          file as DriveFileRef, googleAccessToken,
          transcriptionMode !== 'verbatim', isSpeakerDetectEnabled, isDeepThinking,
          (msg, prg) => {
            setArchiveItems(prev =>
              prev.map(item =>
                item.id === id ? { ...item, progress: prg !== undefined ? prg : Math.min(item.progress + 5, 95) } : item
              )
            );
          }
        );
      } else {
        const audioFile = file as AudioFile;
        text = await executeTranscription(audioFile.file!, audioFile.file?.type || '', (msg, prg) => {
          setArchiveItems(prev =>
            prev.map(item =>
              item.id === id ? { ...item, progress: prg !== undefined ? prg : Math.min(item.progress + 5, 95) } : item
            )
          );
        });
      }

      setArchiveItems(prev => prev.map(item => (item.id === id ? { ...item, text, status: 'complete', progress: 100 } : item)));
    } catch (err: any) {
      setArchiveItems(prev => prev.map(item => (item.id === id ? { ...item, status: 'error', error: err.message } : item)));
    }
  }, [executeTranscription, setArchiveItems, setShowArchiveSidebar, googleAccessToken, transcriptionMode, isSpeakerDetectEnabled, isDeepThinking]);

  const handleArchiveUpload = useCallback(
    (file: File) => {
      const audioFile: AudioFile = {
        file,
        previewUrl: URL.createObjectURL(file),
        base64: null,
        mimeType: file.type
      };
      handleBackgroundTranscribe(audioFile);
    },
    [handleBackgroundTranscribe]
  );

  const isReadyToTranscribe = useCallback(() => {
    if (transcription.isLoading) return false;
    if (activeTab === AudioSource.MICROPHONE) return !!recordedBlob;
    if (activeTab === AudioSource.FILE || activeTab === AudioSource.URL || activeTab === AudioSource.DRIVE) return !!uploadedFile;
    return false;
  }, [activeTab, recordedBlob, transcription.isLoading, uploadedFile]);

  const cancelTranscription = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  return {
    progress,
    logLines,
    handleTranscribe,
    handleBackgroundTranscribe,
    handleArchiveUpload,
    isReadyToTranscribe,
    cancelTranscription
  };
};
