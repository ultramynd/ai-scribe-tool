import { useCallback, useEffect, useState } from 'react';
import { AudioFile, AudioSource, ArchiveItem, EditorTab, TranscriptionState } from '../../types';
import { transcribeAudio, classifyContent } from '../../services/geminiService';
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
  createTab,
  setTabs,
  setArchiveItems,
  setShowArchiveSidebar,
  setContentType,
  setTranscription
}: UseTranscriptionFlowOptions) => {
  const [progress, setProgress] = useState(0);
  const [logLines, setLogLines] = useState<string[]>([]);

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
    async (mediaBlob: Blob | File, mimeType: string, onStatus?: (msg: string, prg?: number) => void) => {
      let finalUseSmartModel = isDeepThinking;

      const isVideo = mimeType.startsWith('video/');
      const isLarge = (mediaBlob?.size || 0) > 15 * 1024 * 1024;

      if ((isVideo || isLarge) && !isDeepThinking) {
        onStatus?.('⚠️ High-complexity detected. Boosting to Deep Inference (Pro)...');
        finalUseSmartModel = true;
      }

      let text: string;
      if (transcriptionMode === 'verbatim') {
        text = await transcribeAudio(mediaBlob, mimeType, false, isSpeakerDetectEnabled, finalUseSmartModel, onStatus);
      } else {
        text = await transcribeAudio(mediaBlob, mimeType, true, isSpeakerDetectEnabled, finalUseSmartModel, onStatus);
      }

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

    try {
      const resolvedSource = overrides?.source ?? activeTab;
      const resolvedRecordedBlob = overrides?.recordedBlob ?? recordedBlob;
      const resolvedMicUrl = overrides?.micUrl ?? micUrl;
      const resolvedUploadedFile = overrides?.uploadedFile ?? uploadedFile;

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

      const text = await executeTranscription(mediaBlob, mimeType, (msg, prg) => updateStatusLog(msg, prg, currentLoadingTabId));

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
      const errorMsg = err.message || 'An unexpected error occurred.';
      if (currentLoadingTabId) {
        setTabs(prev => prev.map(tab => (tab.id === currentLoadingTabId ? { ...tab, transcription: { isLoading: false, text: null, error: errorMsg } } : tab)));
      } else {
        setTranscription({ isLoading: false, text: null, error: errorMsg });
      }
    }
  }, [
    activeTab,
    createTab,
    executeTranscription,
    micUrl,
    recordedBlob,
    setArchiveItems,
    setTabs,
    setTranscription,
    updateStatusLog,
    uploadedFile
  ]);

  const handleBackgroundTranscribe = useCallback(async (file: AudioFile) => {
    const id = Math.random().toString(36).substring(7);

    const validation = file.file ? validateMediaFile(file.file, file.file.type) : { valid: false, message: 'Missing file.' };
    if (!validation.valid) {
      setArchiveItems(prev => [
        {
          id,
          name: file.file?.name || 'Untitled Transcription',
          text: '',
          date: new Date().toLocaleString(),
          status: 'error',
          progress: 0,
          error: validation.message,
          audioUrl: file.previewUrl
        },
        ...prev
      ]);
      return;
    }

    const newItem: ArchiveItem = {
      id,
      name: file.file?.name || 'Untitled Transcription',
      text: '',
      date: new Date().toLocaleString(),
      status: 'loading',
      progress: 0,
      audioUrl: file.previewUrl
    };

    setArchiveItems(prev => [newItem, ...prev]);
    setShowArchiveSidebar(true);

    try {
      const text = await executeTranscription(file.file!, file.file?.type || '', (msg, prg) => {
        setArchiveItems(prev =>
          prev.map(item =>
            item.id === id ? { ...item, progress: prg !== undefined ? prg : Math.min(item.progress + 5, 95) } : item
          )
        );
      });

      setArchiveItems(prev => prev.map(item => (item.id === id ? { ...item, text, status: 'complete', progress: 100 } : item)));
    } catch (err: any) {
      setArchiveItems(prev => prev.map(item => (item.id === id ? { ...item, status: 'error', error: err.message } : item)));
    }
  }, [executeTranscription, setArchiveItems, setShowArchiveSidebar]);

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
    if (activeTab === AudioSource.FILE || activeTab === AudioSource.URL) return !!uploadedFile;
    return false;
  }, [activeTab, recordedBlob, transcription.isLoading, uploadedFile]);

  return {
    progress,
    logLines,
    handleTranscribe,
    handleBackgroundTranscribe,
    handleArchiveUpload,
    isReadyToTranscribe
  };
};
