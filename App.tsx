import React, { useState, useEffect, useCallback } from 'react';
import { 
  Microphone, UploadSimple, Sparkle, FileText, Link, Spinner, Cpu, Info, 
  SignIn, SignOut, Users, User, ArrowLeft, ArrowRight, Plus, Checks, 
  FloppyDisk, Lightning, Terminal, Moon, Sun, WarningCircle, X, Brain, 
  SpeakerHigh, Eye, PencilSimple, Copy, CloudArrowDown, Export, Check,
  CaretDown, List, Trash
} from '@phosphor-icons/react';
import AudioRecorder from './components/AudioRecorder';
import FileUploader from './components/FileUploader';
import UrlLoader from './components/UrlLoader';
import TranscriptionEditor from './components/TranscriptionEditor';
import { AudioSource, AudioFile, TranscriptionState } from './types';
import { transcribeAudio, classifyContent } from './services/geminiService';
import { transcribeWithGroq } from './services/groqService';
import { transcribeWithWebSpeech, isWebSpeechSupported } from './services/webSpeechService';

const App: React.FC = () => {
  // Navigation State
  const [activeTab, setActiveTab] = useState<AudioSource | null>(null);
  const [transcription, setTranscription] = useState<TranscriptionState>({
    isLoading: false,
    text: null,
    error: null,
  });
  const [contentType, setContentType] = useState<string | null>(null);
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
  const [aiProvider, setAiProvider] = useState<'gemini' | 'groq' | 'webspeech'>('gemini');
  const [geminiModel, setGeminiModel] = useState<'flash' | 'pro'>('pro');

  // Auth States
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const [driveScriptsLoaded, setDriveScriptsLoaded] = useState(false);
  const [isSavingToDrive, setIsSavingToDrive] = useState(false);
  const [driveSaved, setDriveSaved] = useState(false);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // UI States
  const [progress, setProgress] = useState(0);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [isEditorMode, setIsEditorMode] = useState(false); // Read vs Edit mode
  const [showAiSidebar, setShowAiSidebar] = useState(false); // AI features sidebar

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
    let interval: ReturnType<typeof setInterval>;
    if (transcription.isLoading) {
      setProgress(0);
      setLogLines(['Initializing AI session...']);
      
      interval = setInterval(() => {
        setProgress((prev) => {
          let increment = 0;
          
          // Speed settings based on provider
          const isFast = aiProvider === 'groq' || (aiProvider === 'gemini' && geminiModel === 'flash');
          const speedFactor = isFast ? 3.5 : 1.2;

          if (prev < 40) increment = Math.random() * (2.5 * speedFactor);
          else if (prev < 70) increment = Math.random() * (1.5 * speedFactor);
          else if (prev < 90) increment = 0.5 * speedFactor;
          
          const newProgress = Math.min(prev + increment, 99);
          
          if (prev < 20 && newProgress >= 20) setLogLines(p => [...p, 'Uploading media buffer...']);
          if (prev < 40 && newProgress >= 40) {
            let message = 'Analyzing audio waveform...';
            if (aiProvider === 'gemini') message = geminiModel === 'pro' ? 'Analyzing context (Deep Thinking)...' : 'Analyzing audio waveform...';
            else if (aiProvider === 'groq') message = 'Groq Whisper V3 Active...';
            setLogLines(p => [...p, message]);
          }
          if (prev < 50 && newProgress >= 50) setLogLines(p => [...p, aiProvider === 'groq' ? 'Processing at warp speed...' : 'Diarizing speakers (Voice Match)...']);
          if (prev < 70 && newProgress >= 70) setLogLines(p => [...p, aiProvider === 'gemini' ? 'Generating tokens with Gemini...' : (aiProvider === 'groq' ? 'Finalizing transcription...' : 'Processing audio...')]);
          if (prev < 85 && newProgress >= 85) setLogLines(p => [...p, aiProvider === 'gemini' ? 'Applying intelligent formatting...' : 'Cleaning up text...']);
          
          return newProgress;
        });
      }, aiProvider === 'groq' ? 40 : (geminiModel === 'flash' ? 60 : 150)); // Significant speed boost for Groq/Flash
    } else if (transcription.text) {
      setProgress(100);
    }
    return () => clearInterval(interval);
  }, [transcription.isLoading, transcription.text, aiProvider, geminiModel]);

  useEffect(() => {
    return () => { if (micUrl) URL.revokeObjectURL(micUrl); };
  }, [micUrl]);

  const handleSaveToDrive = async () => {
    if (!googleAccessToken || !transcription.text) {
      handleGoogleLogin();
      return;
    }
    setIsSavingToDrive(true);
    try {
      const metadata = {
        name: `Smart Editor Transcription - ${new Date().toLocaleDateString()}`,
        mimeType: 'application/vnd.google-apps.document'
      };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', new Blob([transcription.text || ''], { type: 'text/plain' }));
      
      const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${googleAccessToken}` },
        body: form
      });
      
      if (response.ok) {
        setDriveSaved(true);
        setTimeout(() => setDriveSaved(false), 3000);
      } else {
        alert('Failed to save to Google Drive');
      }
    } catch (err) {
      alert('Error saving to Drive');
    } finally {
      setIsSavingToDrive(false);
    }
  };

  const handleExportTxt = () => {
    if (!transcription.text) return;
    const blob = new Blob([transcription.text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Smart_Editor_Export_${new Date().toISOString().slice(0,10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
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
    setTranscription({ isLoading: true, text: null, error: null });
    setContentType(null);
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
      
      let text: string;
      
      // Check if using fallback (browser-based) transcription
      if (aiProvider === 'webspeech') {
        if (!isWebSpeechSupported()) {
          throw new Error("Web Speech API is not supported in your browser. Please use Chrome, Edge, or Safari.");
        }
        
        setLogLines(['Starting browser-based transcription...']);
        
        // Transcribe using Web Speech API
        text = await transcribeWithWebSpeech(
          mediaBlob!,
          { language: 'en-US' },
          (result) => {
            if (result.isFinal) {
              setLogLines(prev => [...prev.slice(-3), `✓ ${result.text.substring(0, 50)}...`]);
            }
          }
        );
        
        // Format the output with basic speaker labeling
        text = `**Browser Transcription** (Web Speech API)\n\n---\n\n${text}`;
        setContentType("Voice Note");
        
      } else if (aiProvider === 'groq') {
        setLogLines(['Initializing Groq Whisper Session...']);
        text = await transcribeWithGroq(mediaBlob!, { model: 'whisper-large-v3' });
        text = `**Groq Whisper Transcription**\n\n---\n\n${text}`;
        setContentType("High-Speed Audio");
      } else {
        // Use Gemini transcription
        text = await transcribeAudio(
          mediaBlob!, 
          mimeType, 
          isAutoEditEnabled, 
          isSpeakerDetectEnabled,
          geminiModel === 'pro'
        );
        
        // Classify in background
        classifyContent(text).then(type => setContentType(type));
      }
      
      setTranscription({ isLoading: false, text, error: null });
      
    } catch (err: any) {
      setTranscription({ 
        isLoading: false, 
        text: null, 
        error: err.message || "An unexpected error occurred." 
      });
    }
  };

  const isReadyToTranscribe = () => {
    if (transcription.isLoading) return false;
    if (activeTab === AudioSource.MICROPHONE) return !!recordedBlob;
    if (activeTab === AudioSource.FILE || activeTab === AudioSource.URL) return !!uploadedFile;
    return false;
  };

  const clearAll = useCallback(() => {
    setRecordedBlob(null);
    setMicUrl(null);
    setUploadedFile(null);
    setTranscription({ isLoading: false, text: null, error: null });
    setProgress(0);
    setActiveTab(null);
    setContentType(null);
    setShowExitConfirm(false);
    setPendingAction(null);
  }, []);

  const safeNavigation = (action: () => void) => {
    if (transcription.text) {
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

  // 1. Editor View
  if (transcription.text !== null && !transcription.isLoading) {
    return (
      <div className="h-screen bg-slate-50 dark:bg-dark-bg font-sans flex flex-col overflow-hidden transition-colors duration-300">
        
        {/* Exit Confirmation Modal */}
        {showExitConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
             <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-dark-border w-full max-w-sm rounded-2xl shadow-2xl p-6 relative">
                <div className="w-12 h-12 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-4 text-red-600 dark:text-red-400">
                   <WarningCircle size={24} weight="duotone" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Unsaved Changes</h3>
                <p className="text-slate-500 dark:text-dark-muted mb-6 leading-relaxed">
                   Are you sure you want to exit? Your transcription and edits will be lost permanently if you leave now.
                </p>
                <div className="flex gap-3">
                   <button 
                     onClick={() => setShowExitConfirm(false)}
                     className="flex-1 px-4 py-2.5 rounded-xl font-bold text-slate-600 dark:text-dark-text hover:bg-slate-100 dark:hover:bg-dark-border transition-colors"
                   >
                     Cancel
                   </button>
                   <button 
                     onClick={confirmExit}
                     className="flex-1 px-4 py-2.5 rounded-xl font-bold bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/20 transition-all"
                   >
                     Exit & Discard
                   </button>
                </div>
             </div>
          </div>
        )}

        {/* Main Bar / Header */}
        <header className="glass-header sticky top-0 z-50 transition-all duration-300">
          <div className="max-w-5xl mx-auto px-6 h-20 flex items-center justify-between">
            {/* Left: Branding & Mode Toggle */}
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3 cursor-pointer group" onClick={() => safeNavigation(clearAll)}>
                <div className="bg-gradient-to-tr from-primary to-purple-600 p-2.5 rounded-2xl text-white shadow-xl shadow-primary/20 group-hover:scale-110 group-hover:rotate-3 transition-all duration-500">
                  <Lightning size={20} weight="fill" className="text-white" />
                </div>
                <div className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white hidden sm:flex items-center gap-2">
                  <span>Scribe<span className="text-primary dark:text-accent">AI</span></span>
                </div>
              </div>

              <div className="w-px h-8 bg-slate-200 dark:bg-dark-border"></div>

              {/* Mode Toggle Capsule */}
              <div className="flex bg-slate-100 dark:bg-dark-bg p-1 rounded-2xl border border-slate-200/50 dark:border-white/5">
                <button 
                  onClick={() => setIsEditorMode(false)}
                  className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold transition-all ${!isEditorMode ? 'bg-white dark:bg-dark-card text-primary dark:text-accent shadow-md' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                >
                  <Eye size={14} weight="duotone" />
                  <span className="hidden md:inline">Read</span>
                </button>
                <button 
                  onClick={() => setIsEditorMode(true)}
                  className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold transition-all ${isEditorMode ? 'bg-white dark:bg-dark-card text-primary dark:text-accent shadow-md' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                >
                  <PencilSimple size={14} weight="duotone" />
                  <span className="hidden md:inline">Edit</span>
                </button>
              </div>
            </div>
            
            {/* Right: Actions */}
            <div className="flex items-center gap-2">
              {/* Copy As Dropdown */}
              <div className="relative group">
                <button className="flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-dark-card transition-all">
                  <Copy size={16} weight="duotone" />
                  <span>Copy As</span>
                </button>
                <div className="absolute top-full left-0 mt-2 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-all duration-200 scale-95 group-hover:scale-100 origin-top-left z-50">
                  <div className="bg-white dark:bg-dark-card rounded-2xl shadow-xl border border-slate-100 dark:border-dark-border p-1.5 min-w-[140px]">
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(transcription.text || '');
                        setDriveSaved(true);
                        setTimeout(() => setDriveSaved(false), 2000);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl transition-all group"
                    >
                      <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-dark-border flex items-center justify-center group-hover:scale-110 transition-transform">
                        <FileText size={14} className="text-slate-400 group-hover:text-primary"/>
                      </div>
                      Markdown
                    </button>
                    <button 
                      onClick={() => {
                        const html = (transcription.text || '').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\*(.*?)\*/g, '<i>$1</i>').replace(/\n/g, '<br>');
                        navigator.clipboard.writeText(html);
                        setDriveSaved(true);
                        setTimeout(() => setDriveSaved(false), 2000);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl transition-all group"
                    >
                      <div className="w-7 h-7 rounded-lg bg-orange-100/50 dark:bg-orange-900/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Export size={14} weight="duotone" className="text-orange-500"/>
                      </div>
                      HTML
                    </button>
                    <button 
                      onClick={() => {
                        const plain = (transcription.text || '').replace(/[*_#\[\]]/g, '');
                        navigator.clipboard.writeText(plain);
                        setDriveSaved(true);
                        setTimeout(() => setDriveSaved(false), 2000);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl transition-all group"
                    >
                      <div className="w-7 h-7 rounded-lg bg-blue-100/50 dark:bg-blue-900/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <FileText size={14} className="text-blue-500"/>
                      </div>
                      Plain Text
                    </button>
                  </div>
                </div>
              </div>

              {/* AI Features Dropdown */}
              <div className="relative group">
                <button 
                  onClick={() => setShowAiSidebar(!showAiSidebar)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-bold transition-all ${showAiSidebar ? 'bg-primary/10 text-primary' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-dark-card'}`}
                >
                  <Sparkle size={16} weight="duotone" className="text-primary dark:text-accent animate-pulse"/>
                  <span className="bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">Smart Editor</span>
                  <span className="px-1.5 py-0.5 rounded-md bg-primary/10 text-[8px] font-black tracking-tighter text-primary border border-primary/20 leading-none">BETA</span>
                </button>
              </div>

              {/* Export Dropdown */}
              <div className="relative group">
                <button className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold hover:opacity-90 transition-all shadow-lg shadow-slate-900/10">
                  <CloudArrowDown size={16} weight="duotone" />
                  <span>Export</span>
                </button>
                
                <div className="absolute top-full right-0 mt-2 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-all duration-200 scale-95 group-hover:scale-100 origin-top-right z-50">
                    <div className="bg-white dark:bg-dark-card rounded-2xl shadow-xl border border-slate-100 dark:border-dark-border p-1.5 min-w-[160px]">
                        <button 
                          onClick={handleSaveToDrive}
                          disabled={isSavingToDrive}
                          className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl transition-all group"
                        >
                          <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                            <FloppyDisk size={14} weight="duotone" className="text-emerald-500"/>
                          </div>
                          Save to Drive
                        </button>
                        <button 
                          onClick={handleExportTxt}
                          className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl transition-all group"
                        >
                          <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-dark-border flex items-center justify-center group-hover:scale-110 transition-transform">
                            <FileText size={14} weight="duotone" className="text-slate-400 group-hover:text-primary"/>
                          </div>
                          Text File (.txt)
                        </button>
                        <button 
                          onClick={handleExportDocx}
                          className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl transition-all group"
                        >
                          <div className="w-7 h-7 rounded-lg bg-blue-100/50 dark:bg-blue-900/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                            <Export size={14} weight="duotone" className="text-blue-500"/>
                          </div>
                          Word Document (.docx)
                        </button>
                    </div>
                </div>
              </div>

              <div className="w-px h-5 bg-slate-200 dark:bg-dark-border mx-1"></div>

              <button 
                onClick={() => setDarkMode(!darkMode)}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 hover:text-primary hover:bg-slate-100 dark:hover:bg-dark-card transition-all"
                title="Toggle Theme"
              >
                {darkMode ? <Sun size={16} weight="duotone" /> : <Moon size={16} weight="duotone" />}
              </button>

              <button 
                onClick={() => safeNavigation(clearAll)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary/10 text-primary dark:text-accent hover:bg-primary/20 transition-all font-semibold text-xs"
              >
                <Plus size={14} weight="bold" />
                New
              </button>
            </div>
          </div>
        </header>

        {/* Main Editor Area - Google Docs Style */}
        <main className="flex-1 w-full z-10 overflow-hidden flex flex-col h-full bg-slate-100 dark:bg-dark-bg">
           <TranscriptionEditor 
              initialText={transcription.text || ''}
              onTextChange={(newText) => setTranscription(prev => ({...prev, text: newText}))}
              audioUrl={getAudioUrl()}
              onSaveToDrive={googleClientId && driveScriptsLoaded ? handleSaveToDrive : undefined}
              isSaving={isSavingToDrive}
              driveSaved={driveSaved}
              contentType={contentType}
              originalFile={getOriginalFile()}
              isEditing={isEditorMode}
              onEditingChange={setIsEditorMode}
              showAiSidebar={showAiSidebar}
              onAiSidebarToggle={() => setShowAiSidebar(!showAiSidebar)}
              onStartRecording={() => safeNavigation(() => { clearAll(); setActiveTab(AudioSource.MICROPHONE); })}
              onUploadClick={() => safeNavigation(() => { clearAll(); setActiveTab(AudioSource.FILE); })}
              onStartUpload={(file) => {
                setUploadedFile(file);
                setActiveTab(AudioSource.FILE);
                // Trigger transcription immediately
                setTimeout(handleTranscribe, 100);
              }}
            />
        </main>
      </div>
    );
  }

  // 2. Loading View (Process UI)
  if (transcription.isLoading) {
    return (
      <div className="min-h-screen bg-dark-bg flex flex-col items-center justify-center p-6 relative overflow-hidden text-dark-text font-sans">
        
        {/* Animated Background */}
        <div className="absolute inset-0 w-full h-full overflow-hidden z-0">
           <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-primary/20 rounded-full mix-blend-screen filter blur-[100px] animate-blob"></div>
           <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-accent/20 rounded-full mix-blend-screen filter blur-[100px] animate-blob animation-delay-2000"></div>
           <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150"></div>
        </div>

        <div className="relative z-10 w-full max-w-lg">
            
            {/* Core Reactor */}
            <div className="relative w-40 h-40 mx-auto mb-16">
               <div className="absolute inset-0 border border-primary/30 rounded-full animate-[spin_10s_linear_infinite]"></div>
               <div className="absolute inset-4 border border-accent/30 rounded-full animate-[spin_15s_linear_infinite_reverse]"></div>
               <div className="absolute inset-0 bg-gradient-to-b from-primary/20 to-accent/20 rounded-full blur-2xl animate-pulse"></div>
               
               <div className="absolute inset-0 flex items-center justify-center">
                 <div className="w-24 h-24 bg-dark-bg rounded-full border border-primary/50 flex items-center justify-center shadow-[0_0_30px_rgba(113,0,150,0.3)]">
                    <Sparkle size={32} weight="duotone" className="text-accent animate-pulse" />
                 </div>
               </div>
            </div>

            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-b from-white to-gray-400 mb-4 tracking-tight">Processing Media</h2>
              <div className="text-accent/80 font-mono text-xs uppercase tracking-widest flex items-center justify-center gap-2">
                 <Cpu size={14} weight="duotone" />
                 <span>{aiProvider === 'gemini' ? (geminiModel === 'pro' ? 'Gemini 3 Pro + Thinking' : 'Gemini 3 Flash') : (aiProvider === 'groq' ? 'Groq Whisper V3' : 'Browser WebSpeech')}</span>
              </div>
            </div>

            {/* Terminal Log */}
            <div className="bg-dark-card/60 backdrop-blur-md rounded-2xl border border-dark-border p-6 mb-8 font-mono text-xs h-36 overflow-hidden flex flex-col justify-end shadow-2xl relative">
              <div className="absolute top-3 left-4 flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/80"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-green-500/80"></div>
              </div>
              <div className="space-y-2 pt-4">
                {logLines.slice(-4).map((line, i) => (
                  <div key={i} className="flex items-center gap-3 text-dark-muted animate-in slide-in-from-left-2 fade-in duration-300">
                    <span className="text-accent">➜</span>
                    <span className={i === logLines.slice(-4).length - 1 ? "text-dark-text font-bold" : ""}>{line}</span>
                  </div>
                ))}
                <div className="flex items-center gap-3 text-accent animate-pulse">
                   <span className="text-accent">➜</span>
                   <span className="w-2 h-4 bg-accent block"></span>
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="relative h-1.5 bg-dark-border rounded-full overflow-hidden">
               <div 
                 className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary via-accent to-primary w-full transition-transform duration-300 ease-out"
                 style={{ transform: `translateX(${progress - 100}%)` }}
               >
                 <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-r from-transparent to-white blur-md"></div>
               </div>
            </div>
            <div className="flex justify-between mt-3 text-[10px] font-mono text-dark-muted font-bold">
               <span>00:00</span>
               <span>{Math.round(progress)}%</span>
            </div>
        </div>
      </div>
    );
  }

  // 3. Selection View (Home)
  return (
    <div className="min-h-screen font-sans flex flex-col relative overflow-hidden transition-colors duration-500">
      
      {/* Immersive Mesh Background */}
      <div className="bg-mesh">
        <div className="mesh-blob w-[500px] h-[500px] bg-primary/20 -top-20 -left-20"></div>
        <div className="mesh-blob w-[600px] h-[600px] bg-accent/20 top-1/2 -right-20 animation-delay-2000"></div>
        <div className="mesh-blob w-[400px] h-[400px] bg-purple-500/10 bottom-0 left-1/3 animation-delay-4000"></div>
      </div>
      
      {/* Glass Header */}
      <header className="glass-header sticky top-0 z-50 transition-all duration-300">
        <div className="max-w-5xl mx-auto px-6 h-20 flex items-center justify-between text-slate-900 dark:text-white">
          <div className="flex items-center gap-3 cursor-pointer group" onClick={() => safeNavigation(clearAll)}>
            <div className="bg-gradient-to-tr from-primary to-purple-600 p-2.5 rounded-2xl text-white shadow-xl shadow-primary/20 group-hover:scale-110 group-hover:rotate-3 transition-all duration-500">
              <Lightning size={20} weight="fill" className="text-white" />
            </div>
            <div className="flex flex-col">
              <div className="text-xl font-extrabold tracking-tight flex items-center gap-2 leading-none">
                <span>Scribe<span className="text-primary dark:text-accent">AI</span></span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary dark:bg-accent/20 dark:text-accent font-bold uppercase tracking-wider">Beta</span>
              </div>
              <span className="text-[9px] text-slate-400 dark:text-dark-muted font-bold uppercase tracking-[0.2em] mt-1">Intelligence</span>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
             {/* Theme Toggle */}
             <button 
               onClick={() => setDarkMode(!darkMode)}
               className="w-10 h-10 rounded-2xl flex items-center justify-center hover:bg-white/50 dark:hover:bg-dark-card/50 hover:text-primary dark:hover:text-accent transition-all duration-300 border border-transparent hover:border-white/50 dark:hover:border-white/10"
             >
               {darkMode ? <Sun size={20} weight="duotone" /> : <Moon size={20} weight="duotone" />}
             </button>

             {driveScriptsLoaded && (
               googleAccessToken ? (
                 <div className="flex items-center gap-3 bg-white/50 dark:bg-dark-card/50 backdrop-blur-md border border-white/60 dark:border-white/5 pl-4 pr-1 py-1 rounded-2xl shadow-sm">
                   <div className="text-[10px] font-bold text-slate-600 dark:text-dark-muted uppercase tracking-wider">Connected</div>
                   <button
                     onClick={handleGoogleLogout}
                     className="p-1.5 text-slate-400 dark:text-dark-muted hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-xl transition-all"
                   >
                     <SignOut size={16} weight="duotone" />
                   </button>
                 </div>
               ) : (
                 googleClientId ? (
                   <button
                      onClick={handleGoogleLogin}
                      disabled={isLoggingIn}
                      className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-dark-text hover:text-primary dark:hover:text-accent px-5 py-2.5 rounded-2xl bg-white/50 dark:bg-dark-card/50 border border-white/60 dark:border-white/5 hover:border-primary/30 transition-all shadow-sm"
                   >
                     {isLoggingIn ? <Spinner size={16} weight="bold" className="animate-spin" /> : <SignIn size={16} weight="duotone" />}
                     <span>Sign In</span>
                   </button>
                 ) : null
               )
             )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-16 w-full flex-1 flex flex-col z-10">
        
        {!activeTab ? (
          <div className="flex flex-col flex-1 justify-center animate-in fade-in slide-in-from-bottom-3 duration-300">
            <div className="text-center mb-20 space-y-6">
              <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-white/50 dark:bg-dark-card/40 backdrop-blur-md border border-white dark:border-white/5 shadow-sm mx-auto">
                <div className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary"></span>
                </div>
                <span className="text-[9px] font-extrabold text-slate-500 dark:text-dark-muted uppercase tracking-[0.2em]">ScribeAI Professional Engine</span>
              </div>
              
              <h2 className="text-5xl sm:text-7xl font-bold text-slate-900 dark:text-white tracking-tight leading-[0.95] flex flex-col items-center">
                <span>Turn your audio into</span>
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-purple-500 to-accent leading-[1.2]">actionable text.</span>
              </h2>
              <p className="text-lg text-slate-500 dark:text-dark-muted max-w-xl mx-auto leading-relaxed">
                Professional-grade transcription with speaker detection, <br className="hidden sm:block"/> auto-formatting, and intelligent summaries.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 max-w-5xl mx-auto">
              {[
                { id: AudioSource.MICROPHONE, icon: <Microphone size={28} weight="duotone" />, title: "Record Node", desc: "Capture voice notes or meetings with optional Live AI.", color: "text-amber-500", bg: "bg-amber-500/5", accent: "amber-500" },
                { id: AudioSource.FILE, icon: <UploadSimple size={28} weight="duotone" />, title: "Upload Media", desc: "Transcribe MP3, WAV, or MP4 files.", color: "text-accent", bg: "bg-accent/5", accent: "accent" },
                { id: AudioSource.URL, icon: <Link size={28} weight="duotone" />, title: "Cloud Import", desc: "Load from public URL or Google Drive.", color: "text-emerald-500", bg: "bg-emerald-500/5", accent: "emerald-500" },
              ].map((card) => (
                <button 
                  key={card.id}
                  onClick={() => setActiveTab(card.id as AudioSource)}
                  className="group relative flex flex-col items-start p-8 bg-white/90 dark:bg-dark-card/80 backdrop-blur-xl rounded-3xl transition-all duration-300 ease-out border border-slate-100 dark:border-white/[0.08] shadow-lg shadow-slate-900/[0.03] dark:shadow-none hover:shadow-xl hover:shadow-slate-900/[0.06] hover:-translate-y-1 text-left"
                >
                  <div className={`w-14 h-14 ${card.bg} ${card.color} rounded-2xl flex items-center justify-center mb-6 group-hover:scale-105 group-hover:rotate-3 transition-all duration-300 ease-out`}>
                    {card.icon}
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2 tracking-tight">{card.title}</h3>
                  <p className="text-slate-500 dark:text-dark-muted text-sm leading-relaxed mb-6 font-medium">
                    {card.desc}
                  </p>
                  <div className={`${card.color} font-semibold text-sm flex items-center gap-1.5 transition-all duration-200 group-hover:gap-2.5`}>
                    Start <ArrowRight size={14} weight="bold" className="transition-transform duration-200 group-hover:translate-x-0.5" />
                  </div>
                </button>
              ))}
            </div>

            {/* Premium Editor Access */}
            <div className="mt-16 flex flex-col items-center">
              <button 
                onClick={() => {
                  setTranscription({ isLoading: false, text: '', error: null });
                  setIsEditorMode(true);
                }}
                className="group flex items-center gap-4 px-2 py-2 pr-3 rounded-full bg-white/90 dark:bg-dark-card/80 backdrop-blur-xl border border-slate-200/80 dark:border-white/10 shadow-lg shadow-slate-900/[0.04] hover:shadow-xl hover:shadow-slate-900/[0.08] hover:-translate-y-0.5 transition-all duration-300 ease-out"
              >
                <div className="w-10 h-10 bg-gradient-to-br from-primary to-purple-600 rounded-full flex items-center justify-center text-white shadow-md shadow-primary/25">
                    <FileText size={18} weight="duotone" />
                </div>
                <div className="flex flex-col items-start">
                    <span className="text-sm font-semibold text-slate-800 dark:text-white">Open Smart Editor</span>
                    <span className="text-[10px] text-slate-400 dark:text-dark-muted font-medium">Advanced Workspace</span>
                </div>
                <div className="ml-2 w-8 h-8 rounded-full bg-slate-100 dark:bg-dark-bg flex items-center justify-center text-slate-400 group-hover:bg-primary group-hover:text-white transition-all duration-200">
                    <ArrowRight size={16} weight="bold" />
                </div>
              </button>
              
              <div className="mt-5 flex items-center justify-center gap-6">
                 <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-dark-muted">
                    <Sparkle size={11} weight="duotone" className="text-amber-500" /> Multi-Language
                 </div>
                 <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-dark-muted">
                    <Sparkle size={11} weight="duotone" className="text-primary" /> Auto-Save
                 </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="animate-in fade-in zoom-in-95 duration-200 max-w-2xl mx-auto w-full">
            <button 
              onClick={() => safeNavigation(() => setActiveTab(null))}
              className="mb-8 flex items-center gap-3 text-slate-400 hover:text-primary dark:hover:text-accent font-bold text-sm transition-all group"
            >
              <div className="p-2 rounded-xl bg-white/50 dark:bg-dark-card/50 border border-white/60 dark:border-white/5 shadow-sm group-hover:scale-110 transition-transform">
                <ArrowRight size={16} weight="bold" />
              </div>
              <span className="uppercase tracking-widest text-[10px]">Back to Selection</span>
            </button>

            <div className="glass-card rounded-[3rem] overflow-hidden">
               <div className="p-10 sm:p-14 min-h-[480px] flex flex-col relative">
                  {/* Decorative Glow */}
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-24 bg-primary/20 blur-[60px] rounded-full -z-10"></div>
                  
                  <div className="mb-12 text-center space-y-2">
                    <h3 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                      {activeTab === AudioSource.MICROPHONE && "Record New Session"}
                      {activeTab === AudioSource.FILE && "Upload Media"}
                      {activeTab === AudioSource.URL && "Remote Import"}
                    </h3>
                    <p className="text-xs text-slate-400 dark:text-dark-muted font-bold uppercase tracking-widest">
                       Prepare your transcription settings
                    </p>
                  </div>

                  <div className="flex-1 flex flex-col justify-center items-center relative z-10">
                    {activeTab === AudioSource.MICROPHONE && (
                      <AudioRecorder 
                        onRecordingComplete={(blob, liveText) => {
                          setRecordedBlob(blob);
                          setMicUrl(URL.createObjectURL(blob));
                          if (liveText) {
                            setTranscription({ 
                              isLoading: false, 
                              text: `**Live Intelligence Transcription**\n\n---\n\n${liveText}`, 
                              error: null 
                            });
                            setContentType("Live Session");
                          }
                        }}
                        isTranscribing={false}
                      />
                    )}

                    {activeTab === AudioSource.FILE && (
                      <FileUploader 
                        onFileSelected={(file) => setUploadedFile(file)}
                        selectedFile={uploadedFile}
                        onClear={() => setUploadedFile(null)}
                        isLoading={false}
                      />
                    )}

                    {activeTab === AudioSource.URL && (
                       <UrlLoader 
                          onFileLoaded={(file) => setUploadedFile(file)}
                          isLoading={false}
                          googleAccessToken={googleAccessToken}
                          clientId={googleClientId}
                          onGoogleLogin={handleGoogleLogin}
                          isLoggingIn={isLoggingIn}
                       />
                    )}
                  </div>

                  {/* Configuration & Action Area */}
                  <div className={`mt-10 transition-all duration-300 ${isReadyToTranscribe() ? 'opacity-100 translate-y-0' : 'opacity-30 translate-y-4 pointer-events-none'}`}>
                     
                     <div className="flex flex-col gap-4 max-w-sm mx-auto">
                        <div className="flex items-center justify-center gap-3">
                           {/* Mode Selection Pill */}
                           <div className="bg-slate-100/50 dark:bg-white/5 backdrop-blur-md p-1 rounded-2xl border border-white/40 dark:border-white/5 flex shadow-sm">
                              <button 
                                onClick={() => setIsAutoEditEnabled(false)}
                                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${!isAutoEditEnabled ? 'bg-white dark:bg-dark-card text-primary shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                              >
                                Verbatim
                              </button>
                              <button 
                                onClick={() => setIsAutoEditEnabled(true)}
                                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isAutoEditEnabled ? 'bg-white dark:bg-dark-card text-primary shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                              >
                                Polish
                              </button>
                           </div>

                           {/* Speaker Toggle Icon Only */}
                           <button
                              onClick={() => setIsSpeakerDetectEnabled(!isSpeakerDetectEnabled)}
                              className={`w-10 h-10 flex items-center justify-center rounded-2xl transition-all ${isSpeakerDetectEnabled ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-slate-100/50 dark:bg-white/5 text-slate-300 border border-transparent'}`}
                              title="Speaker Detection"
                           >
                              <Users size={16} weight="duotone" />
                           </button>
                        </div>

                        {/* Model Selection Bar */}
                        <div className="flex bg-slate-100/30 dark:bg-white/5 p-1 rounded-2xl border border-white/20 dark:border-white/5">
                            {[
                              { id: 'webspeech', icon: <Microphone size={14} weight="duotone" />, label: 'Free', active: aiProvider === 'webspeech', action: () => setAiProvider('webspeech') },
                              { id: 'groq', icon: <Lightning size={14} weight="duotone" />, label: 'Groq', active: aiProvider === 'groq', action: () => setAiProvider('groq') },
                              { id: 'flash', icon: <Sparkle size={14} weight="duotone" />, label: 'Flash', active: aiProvider === 'gemini' && geminiModel === 'flash', action: () => { setAiProvider('gemini'); setGeminiModel('flash'); } },
                              { id: 'pro', icon: <Brain size={14} weight="duotone" />, label: 'Pro', active: aiProvider === 'gemini' && geminiModel === 'pro', action: () => { setAiProvider('gemini'); setGeminiModel('pro'); } }
                            ].map((m) => (
                              <button
                                key={m.id}
                                onClick={m.action}
                                title={m.label}
                                className={`flex-1 flex items-center justify-center py-2.5 rounded-xl transition-all ${m.active ? 'bg-white dark:bg-dark-card text-primary shadow-sm scale-[1.02]' : 'text-slate-400 hover:text-slate-600'}`}
                              >
                                {m.icon}
                              </button>
                            ))}
                        </div>

                        <button
                          onClick={handleTranscribe}
                          disabled={!isReadyToTranscribe()}
                          className={`group relative overflow-hidden rounded-[2rem] py-4 transition-all duration-500 active:scale-95 disabled:opacity-20 ${
                            aiProvider === 'webspeech' ? 'bg-emerald-500' : 
                            aiProvider === 'groq' ? 'bg-orange-500' : 
                            geminiModel === 'flash' ? 'bg-amber-500' : 'bg-slate-900 dark:bg-white'
                          }`}
                        >
                          <div className={`absolute inset-0 bg-gradient-to-r ${
                            aiProvider === 'webspeech' ? 'from-emerald-500 to-teal-500' : 
                            aiProvider === 'groq' ? 'from-orange-500 to-red-500' : 
                            geminiModel === 'flash' ? 'from-amber-500 to-orange-500' : 'from-primary via-purple-600 to-accent'
                          } opacity-0 group-hover:opacity-100 transition-opacity duration-500`}></div>
                          
                          <div className="relative z-10 flex items-center justify-center gap-3">
                              <span className={`text-xs font-black uppercase tracking-[0.2em] ${(aiProvider === 'gemini' && geminiModel === 'pro') ? 'text-white dark:text-slate-900 group-hover:text-white' : 'text-white'}`}>
                                 {aiProvider === 'webspeech' ? 'Initialize Free' : (aiProvider === 'groq' ? 'Groq Transcribe' : (geminiModel === 'pro' ? 'Execute Pro' : 'Start Flash'))}
                              </span>
                              <ArrowRight size={14} weight="bold" className={`transition-transform group-hover:translate-x-1 ${(aiProvider === 'gemini' && geminiModel === 'pro') ? 'text-white dark:text-slate-900 group-hover:text-white' : 'text-white'}`} />
                          </div>
                        </button>
                     </div>
                    </div>
                 </div>
            </div>
          </div>
        )}

        {/* Error Notification */}
        {transcription.error && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-5 fade-in">
            <div className="bg-red-50 dark:bg-red-900/20 text-red-900 dark:text-red-200 px-6 py-4 rounded-2xl border border-red-100 dark:border-red-800 shadow-2xl flex items-center gap-4">
               <div className="bg-red-100 dark:bg-red-800/40 p-2 rounded-full text-red-600 dark:text-red-300"><Info size={20} weight="duotone" /></div>
               <div>
                  <h4 className="font-bold text-sm">Transcription Failed</h4>
                  <p className="text-xs opacity-80 mt-0.5">{transcription.error}</p>
               </div>
               <button onClick={() => setTranscription(prev => ({...prev, error: null}))} className="ml-2 hover:bg-red-100 dark:hover:bg-red-800/40 p-1 rounded-full"><span className="sr-only">Dismiss</span><ArrowLeft size={16} className="rotate-45" /></button>
            </div>
          </div>
        )}

      </main>
    </div>
  );
};

export default App;