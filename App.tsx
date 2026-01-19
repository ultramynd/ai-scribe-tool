import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';

import { Spinner } from '@phosphor-icons/react';
import { AudioSource, AudioFile, TranscriptionState } from './types';
// import { transcribeWithGroq } from './services/groqService'; 
import { isWebSpeechSupported } from './services/webSpeechService';
import { validateMediaFile } from './utils/mediaValidation';

import ArchiveSidebar from './components/ArchiveSidebar';
import GoogleFilePicker from './components/GoogleFilePicker';
import LoadingView from './src/views/LoadingView';
import HomeView from './src/views/HomeView';
const EditorView = lazy(() => import('./src/views/EditorView'));

import TabBar from './components/TabBar';
import ErrorBoundary from './components/ErrorBoundary';

import { ThemeProvider } from './src/contexts/ThemeContext';
import { useArchive } from './src/hooks/useArchive';
import { useDraftPersistence } from './src/hooks/useDraftPersistence';
import { useGoogleDriveAuth } from './src/hooks/useGoogleDriveAuth';
import { useExports } from './src/hooks/useExports';
import { useSessionUi } from './src/hooks/useSessionUi';
import { useTabs } from './src/hooks/useTabs';
import { useTranscriptionFlow } from './src/hooks/useTranscriptionFlow';




const App: React.FC = () => {
  // Navigation State
  const [activeTab, setActiveTab] = useState<AudioSource | null>(null);
  const [transcription, setTranscription] = useState<TranscriptionState>({
    isLoading: false,
    text: null,
    error: null,
  });
  
  // Multi-Tab System
  const [contentType, setContentType] = useState<string | null>(null);
  const [isEditorMode, setIsEditorMode] = useState(false); // Read vs Edit mode

  const {
    tabs,
    setTabs,
    activeTabId,
    setActiveTabId,
    activeTabObj,
    createTab,
    updateActiveTab,
    closeTab
  } = useTabs({
    onCloseAll: () => {
      setIsEditorMode(false);
      setActiveTab(null);
    }
  });

  useDraftPersistence({
    tabs,
    setTabs,
    activeTabId,
    setActiveTabId,
    activeTab,
    setActiveTab
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
  const {
    driveScriptsLoaded,
    googleAccessToken,
    isLoggingIn,
    handleGoogleLogin,
    handleGoogleLogout,
    setGoogleAccessToken
  } = useGoogleDriveAuth(googleClientId);

  // UI States
  const [showAiSidebar, setShowAiSidebar] = useState(false); // AI features sidebar
  const { archiveItems, setArchiveItems } = useArchive();
  const [showArchiveSidebar, setShowArchiveSidebar] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [pickerCallback, setPickerCallback] = useState<((file: AudioFile) => void) | null>(null);
  const [isFetchingDrive, setIsFetchingDrive] = useState(false);

  const {
    progress,
    logLines,
    handleTranscribe,
    handleBackgroundTranscribe,
    isReadyToTranscribe
  } = useTranscriptionFlow({
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
  });

  const {
    handleSaveToDrive,
    handleExportTxt,
    handleExportDocx,
    handleExportSrt,
    isSavingToDrive,
    driveSaved
  } = useExports({
    transcription,
    activeTabText: activeTabObj?.transcription.text,
    googleAccessToken,
    onRequireLogin: handleGoogleLogin,
    onTokenInvalid: () => setGoogleAccessToken(null)
  });

  // --- Effects & Handlers ---

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
    setActiveTab(null);
    setContentType(null);
    setActiveTabId(null); // Deselect active tab to return to Home
    setIsEditorMode(false);
  }, [micUrl, uploadedFile]);

  const {
    showExitConfirm,
    setShowExitConfirm,
    safeNavigation,
    confirmExit,
    handleNewSession,
    isTabsVisible,
    setIsTabsVisible
  } = useSessionUi({
    activeTabId,
    activeTabObj,
    transcription,
    setActiveTab,
    clearAll
  });

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
      const fileBlob = new File([blob], file.name, { type: file.mimeType });
      const validation = validateMediaFile(fileBlob, file.mimeType);
      if (!validation.valid) {
        alert(validation.message || 'Unsupported media file.');
        return;
      }

      const audioFile: AudioFile = {
        file: fileBlob,
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
    const newTab = {
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

  const hasDrafts = tabs.length > 0;
  const handleResumeDraft = () => {
    const lastTab = tabs[tabs.length - 1];
    if (!lastTab) return;
    setActiveTab(null);
    setActiveTabId(lastTab.id);
  };


  // --- Main Layout Rendering ---

  return (
    <ThemeProvider>
      <ErrorBoundary title="The app hit a snag" description="Refresh the page or reset the view to continue.">
        <div className="flex flex-col h-screen bg-slate-50 dark:bg-dark-bg overflow-hidden">
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
            onCancel={() => {
              if (activeTabId) {
                closeTab(activeTabId);
              }
            }}
          />
        )}

        {/* Case 2: Active Completed Tab (Editor) */}
        {activeTabId && !activeTabObj?.transcription.isLoading && activeTabObj?.transcription.text !== null && (
          <ErrorBoundary title="Editor crashed" description="Reset the view to recover your session.">
            <Suspense
              fallback={(
                <div className="flex-1 flex items-center justify-center py-12">
                  <Spinner size={28} className="animate-spin text-primary" />
                </div>
              )}
            >
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
              handleExportDocx={handleExportDocx}
              handleExportTxt={handleExportTxt}
              handleExportSrt={handleExportSrt}
              googleAccessToken={googleAccessToken}
              googleClientId={googleClientId}
              driveScriptsLoaded={driveScriptsLoaded}
              handleGoogleLogin={handleGoogleLogin}
              handleGoogleLogout={handleGoogleLogout}
              isLoggingIn={isLoggingIn}
              archiveItems={archiveItems}
              setActiveTab={setActiveTab}
              handleBackgroundTranscribe={handleBackgroundTranscribe}
              setPickerCallback={setPickerCallback}
              setIsPickerOpen={setIsPickerOpen}
              isPickerOpen={isPickerOpen}
              handlePickDriveFile={handlePickDriveFile}
              onOpenInNewTab={handleOpenInNewTab}
            />
            </Suspense>
          </ErrorBoundary>
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
            hasDrafts={hasDrafts}
            onResumeDraft={handleResumeDraft}
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
    </ErrorBoundary>
    </ThemeProvider>
  );
};

// ThemeContext is now in src/contexts/ThemeContext.tsx

export default App;
