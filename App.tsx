import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Spinner } from '@phosphor-icons/react';
import { AudioSource, AudioFile, TranscriptionState, EditorTab, ArchiveItem } from './types';
import { transcribeAudio, classifyContent } from './services/geminiService';
// import { transcribeWithGroq } from './services/groqService'; 
import { transcribeWithWebSpeech, isWebSpeechSupported } from './services/webSpeechService';
import ArchiveSidebar from './components/ArchiveSidebar';
import GoogleFilePicker from './components/GoogleFilePicker';
import LoadingView from './src/views/LoadingView';
import HomeView from './src/views/HomeView';
import EditorView from './src/views/EditorView';
import TabBar from './components/TabBar';
import { generateDocx, generateTxt, generateSrt } from './utils/exportUtils';



const App: React.FC = () => {
  // Navigation State
  const [activeTab, setActiveTab] = useState<AudioSource | null>(null);
  const [transcription, setTranscription] = useState<TranscriptionState>({
    isLoading: false,
    text: null,
    error: null,
  });
  
  // Multi-Tab System
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [contentType, setContentType] = useState<string | null>(null);

  // --- Tab Management Helpers ---
  
  const createTab = useCallback((data: Partial<EditorTab>) => {
    const id = Math.random().toString(36).substring(7);
    const newTab: EditorTab = {
      id,
      title: data.title || 'Untitled',
      transcription: data.transcription || { isLoading: false, text: null, error: null },
      contentType: data.contentType || null,
      recordedBlob: data.recordedBlob || null,
      micUrl: data.micUrl || null,
      uploadedFile: data.uploadedFile || null,
      isEditorMode: data.isEditorMode ?? false,
      showAiSidebar: data.showAiSidebar ?? false,
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(id);
    return id;
  }, []);

  const updateActiveTab = useCallback((updates: Partial<EditorTab>) => {
    if (!activeTabId) return;
    setTabs(prev => prev.map(tab => tab.id === activeTabId ? { ...tab, ...updates } : tab));
  }, [activeTabId]);

  const closeTab = useCallback((id: string) => {
    // Memory Management: Revoke object URLs before removing tab
    const tabToClose = tabs.find(t => t.id === id);
    if (tabToClose) {
      if (tabToClose.micUrl) {
        URL.revokeObjectURL(tabToClose.micUrl);
      }
      if (tabToClose.uploadedFile?.previewUrl) {
        URL.revokeObjectURL(tabToClose.uploadedFile.previewUrl);
      }
    }

    setTabs(prev => {
      const nextTabs = prev.filter(t => t.id !== id);
      if (activeTabId === id && nextTabs.length > 0) {
        setActiveTabId(nextTabs[nextTabs.length - 1].id);
      } else if (nextTabs.length === 0) {
        setActiveTabId(null);
        setIsEditorMode(false); // Go back home if no tabs left
        setActiveTab(null);
      }
      return nextTabs;
    });
  }, [activeTabId, tabs]);

  const activeTabObj = tabs.find(t => t.id === activeTabId);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  
  // Dark Mode State
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' || 
             (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });

  // Data States
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [micUrl, setMicUrl] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<AudioFile | null>(null);

  // Config States
  const [isAutoEditEnabled, setIsAutoEditEnabled] = useState(true);
  const [isSpeakerDetectEnabled, setIsSpeakerDetectEnabled] = useState(true);
  const [transcriptionMode, setTranscriptionMode] = useState<'verbatim' | 'polish'>('polish');
  const [isDeepThinking, setIsDeepThinking] = useState(false);

  // Auth States
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const [driveScriptsLoaded, setDriveScriptsLoaded] = useState(false);
  const [isSavingToDrive, setIsSavingToDrive] = useState(false);
  const [driveSaved, setDriveSaved] = useState(false);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(() => localStorage.getItem('google_access_token'));
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Persist Token
  useEffect(() => {
    if (googleAccessToken) localStorage.setItem('google_access_token', googleAccessToken);
    else localStorage.removeItem('google_access_token');
  }, [googleAccessToken]);

  // UI States
  const [progress, setProgress] = useState(0);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [isEditorMode, setIsEditorMode] = useState(false); // Read vs Edit mode
  const [showAiSidebar, setShowAiSidebar] = useState(false); // AI features sidebar
  const [archiveItems, setArchiveItems] = useState<ArchiveItem[]>(() => {
    try {
      const saved = localStorage.getItem('archive_items');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error('Failed to parse archive items:', e);
      return [];
    }
  });
  const [showArchiveSidebar, setShowArchiveSidebar] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [pickerCallback, setPickerCallback] = useState<((file: AudioFile) => void) | null>(null);
  const [isFetchingDrive, setIsFetchingDrive] = useState(false);

  // --- Effects & Handlers ---

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem('archive_items', JSON.stringify(archiveItems));
  }, [archiveItems]);

  // Prevent accidental browser close/refresh
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (transcription.text) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [transcription.text]);

  useEffect(() => {
    setDriveScriptsLoaded(true);
  }, []);

  const tokenClientRef = useRef<any>(null);

  const handleGoogleLogin = () => {
    if (!googleClientId || !driveScriptsLoaded) return;
    setIsLoggingIn(true);
    const google = (window as any).google;
    try {
      if (!tokenClientRef.current) {
        tokenClientRef.current = google.accounts.oauth2.initTokenClient({
          client_id: googleClientId,
          scope: 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file',
          callback: (response: any) => {
            setIsLoggingIn(false);
            if (response.access_token) setGoogleAccessToken(response.access_token);
          },
        });
      }
      tokenClientRef.current.requestAccessToken({ prompt: 'consent' });
    } catch (e) {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleLogout = () => {
    const google = (window as any).google;
    if (google && google.accounts && googleAccessToken) {
      google.accounts.oauth2.revoke(googleAccessToken, () => setGoogleAccessToken(null));
    } else {
      setGoogleAccessToken(null);
    }
  };

  useEffect(() => {
    if (transcription.isLoading) {
      setProgress(0);
      setLogLines(['➜ Initializing AI session...']);
    } else if (transcription.text) {
      setProgress(100);
    }
  }, [transcription.isLoading, transcription.text]);

  const [hasPeeked, setHasPeeked] = useState(false);

  // Drawer Peek Animation (Swipe In/Out) when entering Editor
  useEffect(() => {
    if (activeTabId && !activeTabObj?.transcription.isLoading && activeTabObj?.transcription.text && !hasPeeked) {
      // Sequence: Show -> Hide -> Show -> Hide
      const sequence = async () => {
        // Initial Delay
        await new Promise(r => setTimeout(r, 800)); 
        
        setIsTabsVisible(true); // Swipe In 1
        await new Promise(r => setTimeout(r, 600)); 
        
        setIsTabsVisible(false); // Swipe Out 1
        await new Promise(r => setTimeout(r, 300));
        
        setIsTabsVisible(true); // Swipe In 2
        await new Promise(r => setTimeout(r, 600));

        setIsTabsVisible(false); // Swipe Out 2 (Final)
        setHasPeeked(true);
      };

      sequence();
    }
  }, [activeTabId, activeTabObj?.transcription.isLoading, activeTabObj?.transcription.text, hasPeeked]);

  useEffect(() => {
    return () => { if (micUrl) URL.revokeObjectURL(micUrl); };
  }, [micUrl]);
  
  useEffect(() => {
    return () => { if (uploadedFile?.previewUrl) URL.revokeObjectURL(uploadedFile.previewUrl); };
  }, [uploadedFile?.previewUrl]);

  const clearAll = useCallback(() => {
    if (micUrl) URL.revokeObjectURL(micUrl);
    if (uploadedFile?.previewUrl) URL.revokeObjectURL(uploadedFile.previewUrl);
    
    setRecordedBlob(null);
    setMicUrl(null);
    setUploadedFile(null);
    setTranscription({ isLoading: false, text: null, error: null });
    setProgress(0);
    setActiveTab(null);
    setContentType(null);
    setShowExitConfirm(false);
    setPendingAction(null);
    setActiveTabId(null); // Deselect active tab to return to Home
    setIsEditorMode(false);
  }, [micUrl, uploadedFile]);
  const handleSaveToDrive = async (format: 'doc' | 'txt' | 'srt' = 'doc') => {
    // FIX: Check active tab's text, not global transcription
    const currentText = activeTabObj?.transcription.text || transcription.text;
    
    if (!googleAccessToken || !currentText) {
      if (!currentText) alert("No text to save.");
      else handleGoogleLogin();
      return;
    }

    
    setIsSavingToDrive(true);
    
    try {
      const timestamp = new Date().toLocaleString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      
      const fileName = `ScribeAI Transcription - ${timestamp}`;
      
      let mimeType = 'application/vnd.google-apps.document';
      if (format === 'txt') mimeType = 'text/plain';
      else if (format === 'srt') mimeType = 'text/plain'; // Drive treats SRT as text usually

      // Prepare metadata
      const metadata = {
        name: fileName,
        mimeType: mimeType,
        description: `Transcription created with ScribeAI on ${timestamp}`
      };
      
      // Create form data
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      
      // Content preparation
      let content = currentText || '';
      
      if (format === 'doc') {
        // HTML conversion for Google Docs
        content = content
          .replace(/^### (.*$)/gim, '<h3>$1</h3>')
          .replace(/^## (.*$)/gim, '<h2>$1</h2>')
          .replace(/^# (.*$)/gim, '<h1>$1</h1>')
          .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
          .replace(/\*(.*?)\*/g, '<i>$1</i>')
          .replace(/__(.*?)__/g, '<u>$1</u>')
          .replace(/~~(.*?)~~/g, '<s>$1</s>')
          .replace(/\n/g, '<br>');
      } else if (format === 'srt') {
         // Generate SRT content locally then upload
         // We need to duplicate the logic from exportUtils or reuse it? 
         // generateSrt triggers download. We need the STRING content.
         // Let's modify exportUtils to export a "createSrtString" function?
         // For now, I'll basically implement a simple SRT generator here to avoid editing utils again if not needed, 
         // OR I can just save the raw text if I cannot generate SRT string easily.
         // Actually, let's keep it simple.
         // Note: generateSrt in utils creates a blob and downloads. It doesn't return string.
         // I'll copy the SRT logic briefly for Drive upload or better yet, refactor utils?
         // User is waiting. CLI refactor is safer.
         // SRT Logic:
         const lines = content.split('\n');
         let srt = '';
         let counter = 1;
         const timeRegex = /\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/;
         for (const line of lines) {
             const trim = line.trim();
             if(!trim) continue;
             const match = trim.match(timeRegex);
             if(match) {
                 let h=0, m=parseInt(match[1]), s=parseInt(match[2]);
                 if(match[3]) { h=parseInt(match[1]); m=parseInt(match[2]); s=parseInt(match[3]); }
                 const start = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')},000`;
                 const endDate = new Date(0,0,0,h,m,s+4);
                 const end = `${endDate.getHours().toString().padStart(2,'0')}:${endDate.getMinutes().toString().padStart(2,'0')}:${endDate.getSeconds().toString().padStart(2,'0')},000`;
                 srt += `${counter}\n${start} --> ${end}\n${trim.replace(timeRegex,'').trim()}\n\n`;
                 counter++;
             }
         }
         content = srt || content; // Fallback if no timestamps
      }

      
      form.append('file', new Blob([content], { 
        type: format === 'doc' ? 'text/html' : 'text/plain' 
      }));
      
      const response = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', 
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${googleAccessToken}` },
          body: form
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        // Handle token expiration
        if (response.status === 401) {
          localStorage.removeItem('googleAccessToken');
          setGoogleAccessToken(null);
          throw new Error('Session expired. Please sign in again.');
        }
        
        // Handle quota/permission errors
        if (response.status === 403) {
          throw new Error('Permission denied. Check your Google Drive access.');
        }
        
        if (response.status === 429) {
          throw new Error('Too many requests. Please try again in a moment.');
        }
        
        throw new Error(errorData.error?.message || `Failed to save (${response.status})`);
      }
      
      const fileData = await response.json();
      
      // Show success with link to file
      setDriveSaved(true);
      setTimeout(() => setDriveSaved(false), 5000);
      
      // Optional: Open the file in a new tab
      if (fileData.webViewLink) {
        const shouldOpen = confirm(`File saved successfully!\n\nWould you like to open "${fileData.name}" in Google Drive?`);
        if (shouldOpen) {
          window.open(fileData.webViewLink, '_blank');
        }
      }
      
    } catch (err: any) {
      console.error('Save to Drive error:', err);
      const errorMessage = err.message || 'Failed to save to Google Drive';
      alert(`❌ ${errorMessage}\n\nPlease try again or check your connection.`);
    } finally {
      setIsSavingToDrive(false);
    }
  };

  const handleExportTxt = () => {
    try {
      if (!transcription.text) {
        alert("No text available to export.");
        return;
      }
      const fileName = `ScribeAI_Export_${new Date().toISOString().slice(0,10)}.txt`;
      const blob = new Blob([transcription.text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error("Export Error:", err);
      alert(`Export failed: ${err.message || 'Unknown error'}`);
    }
  };

  const handleExportDocx = async () => {
    if (!transcription.text) return;
    try {
      const { generateDocx } = await import('./utils/exportUtils');
      await generateDocx(transcription.text, `Smart_Editor_Export_${new Date().toISOString().slice(0,10)}`);
    } catch (err) {
      alert('Failed to generate Word document');
    }
  };

  const handleTranscribe = async () => {
    const statusLog = (msg: string, prg?: number) => {
      if (prg !== undefined) setProgress(prg);
      
      setLogLines(prev => {
        const lastLine = prev[prev.length - 1];
        // Prevents spamming for progress updates like "Uploading media: 12%"
        if (lastLine && msg.startsWith("Uploading media:") && lastLine.startsWith("Uploading media:")) {
             return [...prev.slice(0, -1), msg];
        }
        return [...prev.slice(-4), msg];
      });

      // Update tab if it exists
      if (currentLoadingTabId) {
        setTabs(prev => prev.map(t => t.id === currentLoadingTabId ? { 
          ...t, 
          transcription: { ...t.transcription, isLoading: true } 
        } : t));
      }
    };

    let currentLoadingTabId: string | null = null;

    try {
      let mediaBlob: Blob | File | null = null;
      let mimeType = '';

      if (activeTab === AudioSource.MICROPHONE) {
        if (!recordedBlob) throw new Error("No recording found.");
        mediaBlob = recordedBlob;
        mimeType = recordedBlob.type;
      } else if (activeTab === AudioSource.FILE || activeTab === AudioSource.URL) {
        if (!uploadedFile?.file) throw new Error("No file selected.");
        mediaBlob = uploadedFile.file;
        mimeType = uploadedFile.file.type || ''; 
      }
      
      // Create the tab immediately
      const initialTitle = uploadedFile?.file?.name || (activeTab === AudioSource.MICROPHONE ? 'Voice Recording' : 'Untitled');
      currentLoadingTabId = createTab({
        title: initialTitle,
        transcription: { isLoading: true, text: null, error: null },
        recordedBlob,
        micUrl,
        uploadedFile,
        isEditorMode: false,
      });

      const text = await executeTranscription(mediaBlob!, mimeType, statusLog);
      
      // Update tab with result
      setTabs(prev => prev.map(t => t.id === currentLoadingTabId ? { 
        ...t, 
        transcription: { isLoading: false, text, error: null } 
      } : t));

      // Auto-save to archive
      const archiveId = Math.random().toString(36).substring(7);
      setArchiveItems(prev => [{
        id: archiveId,
        name: initialTitle,
        text,
        date: new Date().toLocaleString(),
        status: 'complete',
        progress: 100
      }, ...prev]);

    } catch (err: any) {
      const errorMsg = err.message || "An unexpected error occurred.";
      if (currentLoadingTabId) {
        setTabs(prev => prev.map(t => t.id === currentLoadingTabId ? { 
          ...t, 
          transcription: { isLoading: false, text: null, error: errorMsg } 
        } : t));
      } else {
        setTranscription({ isLoading: false, text: null, error: errorMsg });
      }
    }
  };

  const executeTranscription = async (mediaBlob: Blob | File, mimeType: string, onStatus?: (msg: string, prg?: number) => void): Promise<string> => {
    let text: string;
    
    let finalUseSmartModel = isDeepThinking;
    
    // Smart detection logic: Auto-use Pro for complex media (video or large files)
    const isVideo = mimeType.startsWith('video/');
    const isLarge = (mediaBlob?.size || 0) > 15 * 1024 * 1024;
    
    if ((isVideo || isLarge) && !isDeepThinking) {
      onStatus?.("⚠️ High-complexity detected. Boosting to Deep Inference (Pro)...");
      finalUseSmartModel = true;
    }

    if (transcriptionMode === 'verbatim') {
       text = await transcribeAudio(
         mediaBlob!, 
         mimeType, 
         false, // autoEdit = false (Strict Verbatim)
         isSpeakerDetectEnabled, 
         finalUseSmartModel, 
         onStatus
       );
    } 
    else {
      text = await transcribeAudio(
        mediaBlob!, 
        mimeType, 
        true, // autoEdit = true (Polish Mode)
        isSpeakerDetectEnabled, 
        finalUseSmartModel, 
        onStatus
      );
      
      // Background classification
      classifyContent(text).then(type => setContentType(type));
    }
    return text;
  };

  const handleBackgroundTranscribe = async (file: AudioFile) => {
    const id = Math.random().toString(36).substring(7);
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
        setArchiveItems(prev => prev.map(item => 
          item.id === id ? { ...item, progress: prg !== undefined ? prg : Math.min(item.progress + 5, 95) } : item
        ));
      });

      setArchiveItems(prev => prev.map(item => 
        item.id === id ? { ...item, text, status: 'complete', progress: 100 } : item
      ));
    } catch (err: any) {
      setArchiveItems(prev => prev.map(item => 
        item.id === id ? { ...item, status: 'error', error: err.message } : item
      ));
    }
  };

  const isReadyToTranscribe = () => {
    if (transcription.isLoading) return false;
    if (activeTab === AudioSource.MICROPHONE) return !!recordedBlob;
    if (activeTab === AudioSource.FILE || activeTab === AudioSource.URL) return !!uploadedFile;
    return false;
  };



  const safeNavigation = (action: () => void) => {
    // FIX: Check active tab state if available
    const hasUnsavedContent = activeTabObj ? !!activeTabObj.transcription.text : !!transcription.text;
    
    if (hasUnsavedContent) {
      setPendingAction(() => action);
      setShowExitConfirm(true);
    } else {
      action();
    }
  };

  const confirmExit = () => {
    if (pendingAction) pendingAction();
    else clearAll(); // Default if logic fails
    setShowExitConfirm(false);
    setPendingAction(null);
  };

  const handleArchiveSelect = (item: ArchiveItem) => {
    safeNavigation(() => {
        setTranscription({ isLoading: false, text: item.text, error: null });
        setIsEditorMode(true);
        setShowArchiveSidebar(false);
    });
  };

  const handleArchiveDelete = (id: string) => {
    setArchiveItems(prev => prev.filter(item => item.id !== id));
  };

  const handleArchiveUpload = (file: File) => {
    const audioFile: AudioFile = {
      file,
      previewUrl: URL.createObjectURL(file),
      base64: null,
      mimeType: file.type
    };
    handleBackgroundTranscribe(audioFile);
  };

  // --- NEW SESSION HANDLER ---
  const handleNewSession = (source: AudioSource) => {
      safeNavigation(() => {
          clearAll();
          setActiveTab(source);
      });
  };

  const handlePickDriveFile = async (file: { id: string; name: string; mimeType: string }) => {
    setIsPickerOpen(false);
    if (!googleAccessToken) return;
    
    setIsFetchingDrive(true);
    try {
      // Reuse logic from UrlLoader - we should move this to a utility if possible
      // For now, I'll implement a basic version or call handleBackgroundTranscribe with a placeholder
      // Actually, I'll implement fetchDriveFile here too
      const blob = await new Promise<Blob>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`);
        xhr.setRequestHeader('Authorization', `Bearer ${googleAccessToken}`);
        xhr.responseType = 'blob';
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response);
          else reject(new Error(`Drive fetch failed: ${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error('Drive network error'));
        xhr.send();
      });
      const audioFile: AudioFile = {
        file: new File([blob], file.name, { type: file.mimeType }),
        previewUrl: URL.createObjectURL(blob),
        base64: null,
        mimeType: file.mimeType
      };

      if (pickerCallback) {
        pickerCallback(audioFile);
      } else {
        // Default: Load into main session
        setUploadedFile(audioFile);
        setActiveTab(AudioSource.URL);
        setTimeout(handleTranscribe, 100);
      }
    } catch (err: any) {
      console.error("Drive Fetch Error:", err);
      // More specific error message
      let msg = "Failed to download from Drive.";
      if (err.message) msg += ` (${err.message})`;
      alert(msg + " Please ensure the file is shared or you have permission.");
    } finally {
      setIsFetchingDrive(false);
      setPickerCallback(null);
    }
  };

  const getAudioUrl = () => {
    if (activeTab === AudioSource.MICROPHONE) return micUrl;
    if (uploadedFile) return uploadedFile.previewUrl;
    return null;
  };

  // Helper to get the original file object for analysis features
  const getOriginalFile = () => {
    if (activeTab === AudioSource.FILE || activeTab === AudioSource.URL) {
      return uploadedFile;
    }
    // For microphone, we wrap the blob as a file if needed, or pass it in a structured way
    if (activeTab === AudioSource.MICROPHONE && recordedBlob) {
       return {
          file: new File([recordedBlob], "recording.webm", { type: 'audio/webm' }),
          previewUrl: micUrl,
          base64: null,
          mimeType: 'audio/webm'
       } as AudioFile;
    }
    return null;
  }

  // --- VIEWS ---

  const handleOpenInNewTab = (content: string, title?: string) => {
    const newTabId = Date.now().toString();
    const newTab: EditorTab = {
      id: newTabId,
      title: title || 'New Transcription',
      transcription: {
        text: content,
        isLoading: false,
        error: null,
      },
      isEditorMode: true,
      showAiSidebar: false,
      contentType: null,
      recordedBlob: null,
      micUrl: null,
      uploadedFile: null,
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTabId);
  };

  // Zen Mode State (Tabs Visibility)
  const [isTabsVisible, setIsTabsVisible] = useState(true);

  // --- Main Layout Rendering ---

  return (
    <div className={`flex flex-col h-screen bg-slate-50 dark:bg-dark-bg overflow-hidden ${darkMode ? 'dark' : ''}`}>
      {/* Top Level Tab System - Collapsible (Hidden when loading) */}
      {!activeTabObj?.transcription.isLoading && (
        <>
          <div className={`relative transition-all duration-300 ease-in-out ${isTabsVisible ? 'max-h-20 opacity-100' : 'max-h-0 opacity-0'}`}>
            <div className="overflow-hidden">
            <TabBar 
              tabs={tabs} 
              activeTabId={activeTabId} 
              onTabSelect={setActiveTabId} 
              onTabClose={closeTab}
              onNewTab={() => {
                 setActiveTabId(null);
                 setIsEditorMode(false);
                 setActiveTab(null);
              }}
            />
            </div>
          </div>
          
          {/* Zen Mode "Drawer Handle" */}
          <div className="relative z-[70] flex justify-center -mt-0.5 pointer-events-none">
              <button 
                 onClick={() => setIsTabsVisible(!isTabsVisible)}
                 className="pointer-events-auto h-2.5 w-24 bg-slate-200 dark:bg-[#151515] hover:bg-indigo-500 dark:hover:bg-indigo-500 hover:h-4 transition-all duration-300 rounded-b-xl flex items-center justify-center group opacity-50 hover:opacity-100 shadow-sm border border-t-0 border-white/[0.05]"
                 title={isTabsVisible ? "Hide Tabs (Zen Mode)" : "Show Project Tabs"}
              >
                 <div className="w-8 h-1 rounded-full bg-slate-400 dark:bg-slate-700 group-hover:bg-white/80 transition-colors"></div>
              </button>
          </div>
        </>
      )}

      <div className="flex-1 overflow-y-auto relative">
        {/* Case 1: Active Loading Tab */}
        {activeTabObj?.transcription.isLoading && (
          <LoadingView 
            progress={progress}
            logLines={logLines}
            transcriptionMode={transcriptionMode}
            isDeepThinking={isDeepThinking}
          />
        )}

        {/* Case 2: Active Completed Tab (Editor) */}
        {activeTabId && !activeTabObj?.transcription.isLoading && activeTabObj?.transcription.text !== null && (
          <EditorView 
            isTabsVisible={isTabsVisible}
            setIsTabsVisible={setIsTabsVisible}
            showExitConfirm={showExitConfirm}
            setShowExitConfirm={setShowExitConfirm}
            onNewSession={handleNewSession}
            confirmExit={confirmExit}
            safeNavigation={safeNavigation}
            clearAll={clearAll}
            isEditorMode={activeTabObj?.isEditorMode || false}
            setIsEditorMode={(val) => updateActiveTab({ isEditorMode: val })}
            showAiSidebar={activeTabObj?.showAiSidebar || false}
            setShowAiSidebar={(val) => updateActiveTab({ showAiSidebar: val })}
            transcription={activeTabObj?.transcription || transcription}
            setTranscription={(val: React.SetStateAction<TranscriptionState>) => {
              if (typeof val === 'function') {
                const currentTranscription = activeTabObj?.transcription || transcription;
                const nextTranscription = (val as (prev: TranscriptionState) => TranscriptionState)(currentTranscription);
                updateActiveTab({ transcription: nextTranscription });
              } else {
                updateActiveTab({ transcription: val });
              }
            }}
            handleSaveToDrive={handleSaveToDrive}
            isSavingToDrive={isSavingToDrive}
            driveSaved={driveSaved}
            contentType={activeTabObj?.contentType || null}
            setShowArchiveSidebar={setShowArchiveSidebar}
            showArchiveSidebar={showArchiveSidebar}
            getAudioUrl={() => {
               if (activeTabObj?.micUrl) return activeTabObj.micUrl;
               if (activeTabObj?.uploadedFile?.previewUrl) return activeTabObj.uploadedFile.previewUrl;
               return null;
            }}
            getOriginalFile={() => activeTabObj?.uploadedFile || null}
            handleExportDocx={() => generateDocx(transcription.text || '', "Transcription")}
            handleExportTxt={() => generateTxt(transcription.text || '', "Transcription")}
            handleExportSrt={() => generateSrt(transcription.text || '', "Transcription")}
            googleAccessToken={googleAccessToken}
            googleClientId={googleClientId}
            driveScriptsLoaded={driveScriptsLoaded}
            handleGoogleLogin={handleGoogleLogin}
            handleGoogleLogout={handleGoogleLogout}
            isLoggingIn={isLoggingIn}
            archiveItems={archiveItems}
            darkMode={darkMode}
            setDarkMode={setDarkMode}
            setActiveTab={setActiveTab}
            handleBackgroundTranscribe={handleBackgroundTranscribe}
            setPickerCallback={setPickerCallback}
            setIsPickerOpen={setIsPickerOpen}
            isPickerOpen={isPickerOpen}
            handlePickDriveFile={handlePickDriveFile}
            onOpenInNewTab={handleOpenInNewTab}
          />
        )}

        {/* Case 3: No Active Tab or No Transcription (Home) */}
        {(!activeTabId || (activeTabObj && !activeTabObj.transcription.isLoading && activeTabObj.transcription.text === null)) && (
          <HomeView 
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            safeNavigation={safeNavigation}
            clearAll={clearAll}
            isReadyToTranscribe={isReadyToTranscribe}
            handleTranscribe={handleTranscribe}
            setRecordedBlob={setRecordedBlob}
            setMicUrl={setMicUrl}
            uploadedFile={uploadedFile}
            setUploadedFile={setUploadedFile}
            isAutoEditEnabled={isAutoEditEnabled}
            setIsAutoEditEnabled={setIsAutoEditEnabled}
            isSpeakerDetectEnabled={isSpeakerDetectEnabled}
            setIsSpeakerDetectEnabled={setIsSpeakerDetectEnabled}
            transcriptionMode={transcriptionMode}
            setTranscriptionMode={setTranscriptionMode}
            isDeepThinking={isDeepThinking}
            setIsDeepThinking={setIsDeepThinking}
            isWebSpeechSupported={isWebSpeechSupported()}
            googleAccessToken={googleAccessToken}
            handleGoogleLogin={handleGoogleLogin}
            handleGoogleLogout={handleGoogleLogout}
            isLoggingIn={isLoggingIn}
            archiveItems={archiveItems}
            setShowArchiveSidebar={setShowArchiveSidebar}
            darkMode={darkMode}
            setDarkMode={setDarkMode}
            handleBackgroundTranscribe={handleBackgroundTranscribe}
            setPickerCallback={setPickerCallback}
            setIsPickerOpen={setIsPickerOpen}
            isPickerOpen={isPickerOpen}
            handlePickDriveFile={handlePickDriveFile}
            setTranscription={(val: React.SetStateAction<TranscriptionState>) => {
              if (activeTabId) {
                if (typeof val === 'function') {
                  const current = activeTabObj?.transcription || transcription;
                  const next = (val as Function)(current);
                  updateActiveTab({ transcription: next });
                } else {
                  updateActiveTab({ transcription: val });
                }
              } else {
                setTranscription(val);
              }
            }}
            setContentType={setContentType}
            transcriptionError={activeTabObj?.transcription.error || transcription.error}
            setEditorMode={setIsEditorMode}
            onStartSmartEditor={() => handleOpenInNewTab('', 'New Document')}
            onNewSession={handleNewSession}
            driveScriptsLoaded={driveScriptsLoaded}
            googleClientId={googleClientId}
          />
        )}
      </div>

      <ArchiveSidebar 
        isOpen={showArchiveSidebar} 
        onClose={() => setShowArchiveSidebar(false)} 
        items={archiveItems}
        onSelectItem={(item) => {
          // Open archive item in a new tab
          const existingTab = tabs.find(t => t.id === item.id);
          if (existingTab) {
            setActiveTabId(item.id);
          } else {
            createTab({
              id: item.id,
              title: item.name,
              transcription: { isLoading: false, text: item.text, error: null },
              contentType: 'Media', // Default
              isEditorMode: false,
            });
          }
          setShowArchiveSidebar(false);
        }}
        onDeleteItem={(id) => {
          const item = archiveItems.find(i => i.id === id);
          if (item?.audioUrl && item.audioUrl.startsWith('blob:')) {
            URL.revokeObjectURL(item.audioUrl);
          }
          setArchiveItems(prev => prev.filter(i => i.id !== id));
        }}
      />

      <GoogleFilePicker 
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        accessToken={googleAccessToken || ''}
        onSelect={handlePickDriveFile}
      />
    </div>
  );
};

// ThemeContext is now in src/contexts/ThemeContext.tsx

export default App;
