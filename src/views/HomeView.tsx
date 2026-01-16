import React from 'react';
import { 
  Lightning, SignIn, SignOut, Spinner, Moon, Sun, Microphone, UploadSimple, 
  Link, ArrowLeft, ArrowRight, FileText, Sparkle, Users, Check, WarningCircle, Brain, Info, Clock, X
} from '@phosphor-icons/react';
import { AudioSource, AudioFile, TranscriptionState } from '../../types';
import AudioRecorder from '../../components/AudioRecorder';
import FileUploader from '../../components/FileUploader';
import UrlLoader from '../../components/UrlLoader';

interface HomeViewProps {
  activeTab: AudioSource | null;
  setActiveTab: (tab: AudioSource | null) => void;
  safeNavigation: (action: () => void) => void;
  clearAll: () => void;
  googleAccessToken: string | null;
  googleClientId: string | undefined;
  isLoggingIn: boolean;
  handleGoogleLogin: () => void;
  handleGoogleLogout: () => void;
  driveScriptsLoaded: boolean;
  darkMode: boolean;
  setDarkMode: (val: boolean) => void;
  transcriptionMode: 'verbatim' | 'polish';
  setTranscriptionMode: (mode: 'verbatim' | 'polish') => void;
  isSpeakerDetectEnabled: boolean;
  setIsSpeakerDetectEnabled: (val: boolean) => void;
  isDeepThinking: boolean;
  setIsDeepThinking: (val: boolean) => void;
  isReadyToTranscribe: () => boolean;
  handleTranscribe: () => void;
  setRecordedBlob: (blob: Blob | null) => void;
  setMicUrl: (url: string | null) => void;
  setTranscription: React.Dispatch<React.SetStateAction<TranscriptionState>>;
  setContentType: (type: string | null) => void;
  uploadedFile: AudioFile | null;
  setUploadedFile: (file: AudioFile | null) => void;
  transcriptionError: string | null;
  setShowArchiveSidebar: (val: boolean) => void;
  archiveItems: any[];
  setEditorMode: (val: boolean) => void;
  isAutoEditEnabled: boolean;
  setIsAutoEditEnabled: (val: boolean) => void;
  isWebSpeechSupported: boolean;
  handleBackgroundTranscribe: (file: AudioFile) => void;
  setPickerCallback: (callback: ((file: AudioFile) => void) | null) => void;
  setIsPickerOpen: (val: boolean) => void;
  isPickerOpen: boolean;
  handlePickDriveFile: (file: { id: string; name: string; mimeType: string }) => void;
  onStartSmartEditor: () => void;
}

const HomeView: React.FC<HomeViewProps> = ({
  activeTab, setActiveTab, safeNavigation, clearAll,
  googleAccessToken, googleClientId, isLoggingIn,
  handleGoogleLogin, handleGoogleLogout, driveScriptsLoaded,
  darkMode, setDarkMode,
  transcriptionMode, setTranscriptionMode,
  isSpeakerDetectEnabled, setIsSpeakerDetectEnabled,
  isDeepThinking, setIsDeepThinking,
  isReadyToTranscribe, handleTranscribe,
  setRecordedBlob, setMicUrl, setTranscription, setContentType,
  uploadedFile, setUploadedFile, transcriptionError,
  setShowArchiveSidebar, archiveItems, setEditorMode,
  isAutoEditEnabled, setIsAutoEditEnabled, isWebSpeechSupported,
  handleBackgroundTranscribe, setPickerCallback, setIsPickerOpen, isPickerOpen, handlePickDriveFile,
  onStartSmartEditor
}) => {
  return (
    <div className="min-h-screen font-sans flex flex-col relative overflow-y-auto transition-colors duration-500">
      
      {/* Immersive Mesh Background */}
      <div className="bg-mesh">
        <div className="mesh-blob w-[500px] h-[500px] bg-primary/20 -top-20 -left-20"></div>
        <div className="mesh-blob w-[600px] h-[600px] bg-accent/20 top-1/2 -right-20 animation-delay-2000"></div>
        <div className="mesh-blob w-[400px] h-[400px] bg-purple-500/10 bottom-0 left-1/3 animation-delay-4000"></div>
      </div>
      
      {/* Glass Header */}
      <header className="glass-header sticky top-0 z-50 transition-all duration-300">
        <div className="max-w-5xl mx-auto px-6 h-20 flex items-center justify-between text-slate-900 dark:text-white">
          <div className="flex items-center gap-3.5 cursor-pointer group" onClick={() => safeNavigation(clearAll)}>
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 group-hover:scale-110 transition-transform duration-500">
              <Lightning size={20} weight="fill" className="text-white" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-xl font-black tracking-tight text-slate-900 dark:text-white leading-none">ScribeAI</span>
                <span className="px-1.5 py-0.5 rounded-md bg-primary/10 dark:bg-accent/20 text-[8px] font-black tracking-tighter text-primary dark:text-accent border border-primary/20 dark:border-accent/20 leading-none">BETA</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
             {/* Archive Button */}
             <button 
               onClick={() => setShowArchiveSidebar(true)}
               className="flex items-center gap-2.5 px-5 py-2.5 rounded-2xl bg-white dark:bg-dark-card border border-slate-100 dark:border-white/5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:shadow-md transition-all group"
             >
               <Clock size={18} weight="duotone" className="text-slate-400 group-hover:text-primary transition-colors" />
               <span className="hidden sm:inline">Tabs</span>
               {archiveItems.length > 0 && (
                 <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse ml-0.5"></div>
               )}
             </button>

             {/* Connected / Login Status */}
             {driveScriptsLoaded && (
               googleAccessToken ? (
                 <button 
                    onClick={handleGoogleLogout}
                    className="w-10 h-10 rounded-2xl bg-white dark:bg-dark-card border border-slate-100 dark:border-white/5 flex items-center justify-center hover:shadow-md transition-all group"
                    title="Sign Out"
                  >
                    <SignOut size={18} weight="bold" className="text-slate-400 group-hover:text-primary transition-transform" />
                  </button>
               ) : (
                 googleClientId && (
                    <button 
                      onClick={handleGoogleLogin}
                      disabled={isLoggingIn}
                      className="w-10 h-10 rounded-2xl bg-white dark:bg-dark-card border border-slate-100 dark:border-white/5 flex items-center justify-center hover:shadow-md transition-all group"
                      title="Sign In"
                    >
                      {isLoggingIn ? <Spinner size={18} weight="bold" className="animate-spin text-primary" /> : <SignIn size={18} weight="bold" className="text-slate-400 group-hover:text-primary transition-colors" />}
                    </button>
                 )
               )
             )}

             {/* Theme Toggle */}
             <button 
               onClick={() => setDarkMode(!darkMode)}
               className="w-10 h-10 rounded-2xl flex items-center justify-center text-slate-500 hover:text-primary hover:bg-slate-100 dark:hover:bg-white/5 transition-all"
               title="Toggle Theme"
             >
               {darkMode ? <Sun size={20} weight="duotone" /> : <Moon size={20} weight="duotone" />}
             </button>
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
                  onStartSmartEditor();
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
            <div className="mb-8 flex items-center gap-4">
              <button 
                onClick={() => safeNavigation(() => setActiveTab(null))}
                className="flex items-center gap-3 text-slate-400 hover:text-primary dark:hover:text-accent font-bold text-sm transition-all group"
              >
                <div className="p-2 rounded-xl bg-white/50 dark:bg-dark-card/50 border border-white/60 dark:border-white/5 shadow-sm group-hover:scale-110 transition-transform">
                  <ArrowLeft size={16} weight="bold" />
                </div>
                <span className="uppercase tracking-widest text-[10px]">Back to Selection</span>
              </button>

              {/* Service Tabs */}
              <div className="flex items-center gap-2 ml-auto">
                <button
                  onClick={() => setActiveTab(AudioSource.MICROPHONE)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    activeTab === AudioSource.MICROPHONE
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                      : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-white/50 dark:hover:bg-dark-card/50'
                  }`}
                >
                  <Microphone size={14} weight="duotone" />
                  <span className="hidden sm:inline">Record</span>
                </button>
                <button
                  onClick={() => setActiveTab(AudioSource.FILE)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    activeTab === AudioSource.FILE
                      ? 'bg-accent/10 text-accent border border-accent/20'
                      : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-white/50 dark:hover:bg-dark-card/50'
                  }`}
                >
                  <UploadSimple size={14} weight="duotone" />
                  <span className="hidden sm:inline">Upload</span>
                </button>
                <button
                  onClick={() => setActiveTab(AudioSource.URL)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    activeTab === AudioSource.URL
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                      : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-white/50 dark:hover:bg-dark-card/50'
                  }`}
                >
                  <Link size={14} weight="duotone" />
                  <span className="hidden sm:inline">URL</span>
                </button>
              </div>
            </div>

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
                              setTranscription(prev => ({ 
                                ...prev,
                                isLoading: false, 
                                text: `**Live Intelligence Transcription**\n\n---\n\n${liveText}`, 
                                error: null 
                              }));
                              setContentType("Live Session");
                            }
                          }}
                          isTranscribing={false}
                          mode={transcriptionMode}
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
                        <div className="flex flex-col gap-4 max-w-sm mx-auto p-4 rounded-3xl bg-white/40 dark:bg-black/20 border border-white/20 shadow-sm backdrop-blur-md transition-all">
                           {/* Mode Selection Cards */}
                           <div className="grid grid-cols-2 gap-2 p-1 bg-slate-200/50 dark:bg-white/5 rounded-2xl border border-transparent dark:border-white/5">
                              <button
                                 onClick={() => setTranscriptionMode('verbatim')}
                                 className={`flex flex-col items-center justify-center py-4 px-2 rounded-xl transition-all duration-300 ${transcriptionMode === 'verbatim' ? 'bg-white dark:bg-dark-card text-primary dark:text-accent shadow-sm border border-slate-100 dark:border-white/10 scale-[1.02]' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
                              >
                                 <Lightning size={24} weight={transcriptionMode === 'verbatim' ? "duotone" : "regular"} className="mb-2" />
                                 <span className="font-bold text-sm">Verbatim</span>
                                 <span className="text-[10px] opacity-60 mt-0.5">Exact Words</span>
                              </button>
                              <button
                                 onClick={() => setTranscriptionMode('polish')}
                                 className={`flex flex-col items-center justify-center py-4 px-2 rounded-xl transition-all duration-300 ${transcriptionMode === 'polish' ? 'bg-white dark:bg-dark-card text-primary dark:text-accent shadow-sm border border-slate-100 dark:border-white/10 scale-[1.02]' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
                              >
                                 <Sparkle size={24} weight={transcriptionMode === 'polish' ? "duotone" : "regular"} className="mb-2" />
                                 <span className="font-bold text-sm">Polish</span>
                                 <span className="text-[10px] opacity-60 mt-0.5">Smart Edit</span>
                              </button>
                           </div>

                           {/* Dynamic Description */}
                           <div className="text-center px-2 min-h-[40px] flex items-center justify-center">
                              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                 {transcriptionMode === 'verbatim' 
                                    ? "Captures every utterance, stutter, and filler word for a 100% literal transcript." 
                                    : "Smooths out grammar, removes fillers, and formats text while keeping the original meaning."}
                              </p>
                           </div>

                           {/* Settings Toggles */}
                           <div className="flex flex-col gap-2">
                              {/* Speaker Detection */}
                              <button 
                                 onClick={() => setIsSpeakerDetectEnabled(!isSpeakerDetectEnabled)}
                                 className={`flex items-center justify-between p-3 rounded-xl border transition-all ${isSpeakerDetectEnabled ? 'bg-primary/5 border-primary/20' : 'bg-transparent border-slate-200 dark:border-white/10 opacity-70 hover:opacity-100'}`}
                              >
                                 <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isSpeakerDetectEnabled ? 'bg-primary/10 text-primary' : 'bg-slate-100 dark:bg-white/10'}`}>
                                       <Users size={16} weight="duotone" />
                                    </div>
                                    <div className="text-left">
                                       <div className="text-xs font-bold text-slate-700 dark:text-slate-200">Speaker Labels</div>
                                       <div className="text-[10px] text-slate-500">{isSpeakerDetectEnabled ? "Identifying distinct voices" : "Generalized labeling"}</div>
                                    </div>
                                 </div>
                                 <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${isSpeakerDetectEnabled ? 'border-primary bg-primary' : 'border-slate-300 dark:border-slate-600'}`}>
                                    {isSpeakerDetectEnabled && <Check size={10} color="white" weight="bold" />}
                                 </div>
                              </button>

                              {/* Deep Thinking (Polish Only) */}
                              {transcriptionMode === 'polish' && (
                                 <button 
                                    onClick={() => setIsDeepThinking(!isDeepThinking)}
                                    className={`flex items-center justify-between p-3 rounded-xl border transition-all animate-in fade-in slide-in-from-top-2 ${isDeepThinking ? 'bg-purple-500/5 border-purple-500/20' : 'bg-transparent border-slate-200 dark:border-white/10 opacity-70 hover:opacity-100'}`}
                                 >
                                    <div className="flex items-center gap-3">
                                       <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isDeepThinking ? 'bg-purple-500/10 text-purple-600' : 'bg-slate-100 dark:bg-white/10'}`}>
                                          <Brain size={16} weight="duotone" />
                                       </div>
                                       <div className="text-left">
                                          <div className="text-xs font-bold text-slate-700 dark:text-slate-200">Deep Thinking</div>
                                          <div className="text-[10px] text-slate-500">Enhanced reasoning (Slower)</div>
                                          {isDeepThinking && (
                                             <div className="mt-1 flex items-center gap-1.5 text-[9px] font-bold text-amber-500 animate-in fade-in duration-300">
                                                <WarningCircle size={10} weight="fill" />
                                                <span>Exhausts quota significantly faster</span>
                                             </div>
                                          )}
                                       </div>
                                    </div>
                                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${isDeepThinking ? 'border-purple-500 bg-purple-500' : 'border-slate-300 dark:border-slate-600'}`}>
                                       {isDeepThinking && <Check size={10} color="white" weight="bold" />}
                                    </div>
                                 </button>
                              )}
                           </div>
                        </div>
                        <button
                          onClick={handleTranscribe}
                          disabled={!isReadyToTranscribe()}
                          className={`group relative overflow-hidden rounded-[2rem] py-4 transition-all duration-500 active:scale-95 disabled:opacity-20 ${
                            transcriptionMode === 'verbatim' ? 'bg-orange-500' : 'bg-slate-900 dark:bg-slate-800'
                          }`}
                        >
                          <div className={`absolute inset-0 bg-gradient-to-r ${
                             transcriptionMode === 'verbatim' ? 'from-orange-500 to-red-500' : 'from-primary via-purple-600 to-accent'
                          } opacity-0 group-hover:opacity-100 transition-opacity duration-500`}></div>
                          
                          <div className="relative z-10 flex items-center justify-center gap-3">
                              <span className="text-xs font-black uppercase tracking-[0.2em] text-white group-hover:text-white">
                                 {transcriptionMode === 'verbatim' ? 'Start Transcription' : (isDeepThinking ? 'Start Deep Analysis' : 'Start Intelligent Mode')}
                              </span>
                              <ArrowRight size={14} weight="bold" className="text-white group-hover:text-white transition-transform group-hover:translate-x-1" />
                          </div>
                        </button>
                     </div>
                    </div>
                 </div>
            </div>
          </div>
        )}

        {/* Error Notification */}
        {transcriptionError && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-5 fade-in">
            <div className="bg-red-50 dark:bg-red-900/20 text-red-900 dark:text-red-200 px-6 py-4 rounded-2xl border border-red-100 dark:border-red-800 shadow-2xl flex items-center gap-4">
               <div className="bg-red-100 dark:bg-red-800/40 p-2 rounded-full text-red-600 dark:text-red-300"><Info size={20} weight="duotone" /></div>
               <div>
                  <h4 className="font-bold text-sm">Transcription Failed</h4>
                  <p className="text-xs opacity-80 mt-0.5">{transcriptionError}</p>
               </div>
               <button onClick={() => setTranscription(prev => ({...prev, error: null}))} className="ml-2 hover:bg-red-100 dark:hover:bg-red-800/40 p-1 rounded-full"><span className="sr-only">Dismiss</span><X size={16} /></button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};


export default HomeView;
