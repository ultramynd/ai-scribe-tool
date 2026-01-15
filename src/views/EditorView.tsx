import React from 'react';
import { 
  Lightning, Eye, PencilSimple, Sparkle, Export, CaretDown, 
  ArrowSquareOut, Checks, FileText, FileCode, CloudArrowDown, 
  File as FileIcon, Plus, Microphone, UploadSimple, User, 
  Clock, SignOut, Spinner, SignIn, Sun, Moon, List, WarningCircle, Check
} from '@phosphor-icons/react';
import { AudioSource, TranscriptionState, AudioFile, ArchiveItem } from '../../types';
import TranscriptionEditor from '../../components/TranscriptionEditor';

interface EditorViewProps {
  showExitConfirm: boolean;
  setShowExitConfirm: (val: boolean) => void;
  confirmExit: () => void;
  safeNavigation: (action: () => void) => void;
  clearAll: () => void;
  isEditorMode: boolean;
  setIsEditorMode: (val: boolean) => void;
  showAiSidebar: boolean;
  setShowAiSidebar: (val: boolean) => void;
  transcription: TranscriptionState;
  setTranscription: React.Dispatch<React.SetStateAction<TranscriptionState>>;
  handleSaveToDrive: (type?: 'doc' | 'txt') => void;
  isSavingToDrive: boolean;
  driveSaved: boolean;
  contentType: string | null;
  getAudioUrl: () => string | null;
  getOriginalFile: () => AudioFile | null;
  handleExportDocx: () => void;
  handleExportTxt: () => void;
  googleAccessToken: string | null;
  googleClientId: string | undefined;
  driveScriptsLoaded: boolean;
  handleGoogleLogin: () => void;
  handleGoogleLogout: () => void;
  isLoggingIn: boolean;
  archiveItems: ArchiveItem[];
  setShowArchiveSidebar: (val: boolean) => void;
  darkMode: boolean;
  setDarkMode: (val: boolean) => void;
  setActiveTab: (tab: AudioSource | null) => void;
  handleBackgroundTranscribe: (file: AudioFile) => void;
  setPickerCallback: (callback: ((file: AudioFile) => void) | null) => void;
  setIsPickerOpen: (val: boolean) => void;
  isPickerOpen: boolean;
  handlePickDriveFile: (file: { id: string; name: string; mimeType: string }) => void;
  onOpenInNewTab: (content: string, title?: string) => void;
}

const EditorView: React.FC<EditorViewProps> = ({
  showExitConfirm, setShowExitConfirm, confirmExit,
  safeNavigation, clearAll,
  isEditorMode, setIsEditorMode,
  showAiSidebar, setShowAiSidebar,
  transcription, setTranscription,
  handleSaveToDrive, isSavingToDrive, driveSaved,
  contentType, getAudioUrl, getOriginalFile,
  handleExportDocx, handleExportTxt,
  googleAccessToken, googleClientId, driveScriptsLoaded,
  handleGoogleLogin, handleGoogleLogout, isLoggingIn,
  archiveItems, setShowArchiveSidebar,
  darkMode, setDarkMode, setActiveTab,
  handleBackgroundTranscribe, setPickerCallback,
  setIsPickerOpen, isPickerOpen, handlePickDriveFile,
  onOpenInNewTab
}) => {
  // Local state for copy feedback
  const [copiedStatus, setCopiedStatus] = React.useState<'text' | 'plain' | 'html' | null>(null);

  const handleCopyFeedback = (type: 'text' | 'plain' | 'html') => {
    setCopiedStatus(type);
    setTimeout(() => setCopiedStatus(null), 2000);
  };

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
        <div className="max-w-5xl mx-auto px-6 h-20 flex items-center justify-between text-slate-900 dark:text-white">
          {/* Left: Branding */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3.5 cursor-pointer group" onClick={() => safeNavigation(clearAll)}>
              <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 group-hover:scale-110 transition-transform duration-500">
                <Lightning size={20} weight="fill" className="text-white" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-xl font-black tracking-tight text-slate-900 dark:text-white leading-none">ScribeAI</span>
                  <span className="px-1.5 py-0.5 rounded-md bg-primary/10 text-[8px] font-black tracking-tighter text-primary border border-primary/20 leading-none">BETA</span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            {/* Global Actions Group */}
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-2">
                {/* Mode Toggle Switcher */}
                <div className="flex bg-slate-100 dark:bg-dark-bg p-1 rounded-2xl border border-slate-100 dark:border-white/5">
                  <button 
                    onClick={() => setIsEditorMode(false)}
                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-[10px] font-bold transition-all ${!isEditorMode ? 'bg-white dark:bg-dark-card text-primary dark:text-accent shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    <Eye size={12} weight="duotone" />
                    <span>Read</span>
                  </button>
                  <button 
                    onClick={() => setIsEditorMode(true)}
                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-[10px] font-bold transition-all ${isEditorMode ? 'bg-white dark:bg-dark-card text-primary dark:text-accent shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    <PencilSimple size={12} weight="duotone" />
                    <span>Edit</span>
                  </button>
                </div>

                <div className="w-px h-5 bg-slate-200 dark:bg-dark-border mx-1"></div>

                {/* Smart Editor side trigger */}
                <button 
                  onClick={() => setShowAiSidebar(!showAiSidebar)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all ${showAiSidebar ? 'text-primary dark:text-accent bg-primary/5' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-dark-card'}`}
                >
                  <Sparkle size={14} weight="duotone" className="text-primary dark:text-accent"/>
                  <span>Smart Editor</span>
                </button>

                {/* Consolidated Export Dropdown */}
                <div className="relative group/export">
                  <button className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[10px] font-black uppercase tracking-wider hover:opacity-90 transition-all shadow-md">
                    <Export size={14} weight="duotone" />
                    <span>Export</span>
                    <CaretDown size={10} weight="bold" className="ml-0.5 opacity-50 group-hover/export:rotate-180 transition-transform" />
                  </button>
                  
                  <div className="absolute top-full right-0 mt-2 opacity-0 group-hover/export:opacity-100 pointer-events-none group-hover/export:pointer-events-auto transition-all duration-200 scale-95 group-hover/export:scale-100 origin-top-right z-50">
                      <div className="bg-white dark:bg-dark-card rounded-2xl shadow-xl border border-slate-100 dark:border-dark-border p-2 min-w-[200px]">
                          {/* Copy Section */}
                          <div className="px-2.5 py-1.5 text-[9px] font-black text-slate-400 dark:text-dark-muted uppercase tracking-widest">Preview & Copy</div>
                          {/* Removed redundant Open in New Tab and Save to Drive */}
                          <button 
                            onClick={() => {
                              navigator.clipboard.writeText(transcription.text || '');
                              handleCopyFeedback('text');
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2 text-left text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl transition-all group"
                          >
                            <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-900/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                              {copiedStatus === 'text' ? <Check size={12} weight="bold" className="text-emerald-500" /> : <Checks size={12} weight="duotone" className="text-indigo-500" />}
                            </div>
                            {copiedStatus === 'text' ? 'Copied!' : 'Copy Text'}
                          </button>
                          <button 
                            onClick={() => {
                              const clean = (transcription.text || '')
                                .replace(/\[\d{1,2}:\d{2}(?::\d{2})?\]/g, '') // Remove timestamps
                                .replace(/^(.*?):/gm, '') // Remove speaker labels
                                .replace(/\*\*/g, '').replace(/\*/g, '') // Remove asterisks
                                .replace(/__/g, '').replace(/_/g, '') // Remove underscores
                                .replace(/~~/g, '') // Remove strikethrough
                                .replace(/\s+/g, ' ') // Normalize spaces
                                .trim();
                              navigator.clipboard.writeText(clean);
                              handleCopyFeedback('plain');
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2 text-left text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl transition-all group"
                          >
                            <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                              {copiedStatus === 'plain' ? <Check size={12} weight="bold" className="text-emerald-500" /> : <FileText size={12} weight="duotone" className="text-blue-500" />}
                            </div>
                            {copiedStatus === 'plain' ? 'Copied!' : 'Copy Plain Text'}
                          </button>
                          <button 
                            onClick={() => {
                              const html = (transcription.text || '')
                                .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
                                .replace(/__(.*?)__/g, '<b>$1</b>')
                                .replace(/\*(.*?)\*/g, '<i>$1</i>')
                                .replace(/_(.*?)_/g, '<i>$1</i>')
                                .replace(/\n/g, '<br>');
                              navigator.clipboard.writeText(html);
                              handleCopyFeedback('html');
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2 text-left text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl transition-all group"
                          >
                            <div className="w-7 h-7 rounded-lg bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                              {copiedStatus === 'html' ? <Check size={12} weight="bold" className="text-emerald-500" /> : <FileCode size={12} weight="duotone" className="text-orange-500" />}
                            </div>
                            {copiedStatus === 'html' ? 'Copied!' : 'Copy HTML'}
                          </button>

                          <div className="h-px bg-slate-100 dark:bg-dark-border my-2 mx-2"></div>

                          {/* Download Section */}
                          <div className="px-2.5 py-1.5 text-[9px] font-black text-slate-400 dark:text-dark-muted uppercase tracking-widest">Download Files</div>
                          <button 
                            onClick={handleExportDocx}
                            className="w-full flex items-center gap-3 px-3 py-2 text-left text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl transition-all group"
                          >
                            <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                              <FileIcon size={12} weight="duotone" className="text-blue-500"/>
                            </div>
                            Word (.docx)
                          </button>
                          <button 
                            onClick={handleExportTxt}
                            className="w-full flex items-center gap-3 px-3 py-2 text-left text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl transition-all group"
                          >
                            <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-dark-border flex items-center justify-center group-hover:scale-110 transition-transform">
                              <FileText size={12} weight="duotone" className="text-slate-400 group-hover:text-primary"/>
                            </div>
                            Text (.txt)
                          </button>
                      </div>
                  </div>
                </div>

                {/* New Session Button */}
                <div className="relative group/new">
                  <button 
                    className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-primary text-white text-[10px] font-black uppercase tracking-wider hover:shadow-lg transition-all shadow-xl shadow-primary/20"
                  >
                    <Plus size={16} weight="bold" />
                    <span>New</span>
                  </button>
                  
                  <div className="absolute top-full right-0 mt-2 opacity-0 group-hover/new:opacity-100 pointer-events-none group-hover/new:pointer-events-auto transition-all duration-200 scale-95 group-hover/new:scale-100 origin-top-right z-50">
                    <div className="bg-white dark:bg-dark-card rounded-2xl shadow-xl border border-slate-100 dark:border-dark-border p-1.5 min-w-[170px]">
                      <button 
                        onClick={() => safeNavigation(() => { clearAll(); setActiveTab(AudioSource.MICROPHONE); })}
                        className="w-full flex items-center gap-3 px-3 py-2 text-left text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl transition-all"
                      >
                        <Microphone size={16} weight="duotone" className="text-amber-500"/>
                        Record
                      </button>
                      <button 
                        onClick={() => safeNavigation(() => { clearAll(); setActiveTab(AudioSource.FILE); })}
                        className="w-full flex items-center gap-3 px-3 py-2 text-left text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl transition-all"
                      >
                        <UploadSimple size={16} weight="duotone" className="text-blue-500"/>
                        Upload
                      </button>
                    </div>
                  </div>
                </div>

                {/* User Profile Dropdown - Archive, Login, Dark Mode */}
                <div className="relative group/more">
                  <button className="w-9 h-9 rounded-2xl flex items-center justify-center text-slate-500 hover:text-primary hover:bg-slate-100 dark:hover:bg-white/5 transition-all">
                    <User size={18} weight="duotone" />
                  </button>
                  
                  <div className="absolute top-full right-0 mt-2 opacity-0 group-hover/more:opacity-100 pointer-events-none group-hover/more:pointer-events-auto transition-all duration-200 scale-95 group-hover/more:scale-100 origin-top-right z-50">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 p-2 min-w-[180px]">
                      <button 
                        onClick={() => setShowArchiveSidebar(true)}
                        className="w-full flex items-center gap-3 px-3 py-2 text-left text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl transition-all group"
                      >
                        <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-dark-border flex items-center justify-center group-hover:scale-110 transition-transform">
                          <Clock size={14} weight="duotone" className="text-slate-500" />
                        </div>
                        <div className="flex items-center gap-2 flex-1">
                          <span>Archive</span>
                          {archiveItems.length > 0 && (
                            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></div>
                          )}
                        </div>
                      </button>

                      {driveScriptsLoaded && (
                        googleAccessToken ? (
                          <button 
                            onClick={handleGoogleLogout}
                            className="w-full flex items-center gap-3 px-3 py-2 text-left text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl transition-all group"
                          >
                            <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                              <SignOut size={14} weight="duotone" className="text-emerald-500" />
                            </div>
                            Sign Out
                          </button>
                        ) : (
                          googleClientId && (
                            <button 
                              onClick={handleGoogleLogin}
                              disabled={isLoggingIn}
                              className="w-full flex items-center gap-3 px-3 py-2 text-left text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/10 rounded-xl transition-all group"
                            >
                              <div className="w-7 h-7 rounded-lg bg-primary/10 dark:bg-accent/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                                {isLoggingIn ? <Spinner size={14} weight="bold" className="animate-spin text-primary" /> : <SignIn size={14} weight="duotone" className="text-primary" />}
                              </div>
                              {isLoggingIn ? 'Signing In...' : 'Sign In'}
                            </button>
                          )
                        )
                      )}

                      <div className="h-px bg-slate-100 dark:bg-dark-border my-2 mx-2"></div>

                      <button 
                        onClick={() => setDarkMode(!darkMode)}
                        className="w-full flex items-center gap-3 px-3 py-2 text-left text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/10 rounded-xl transition-all group"
                      >
                        <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                          {darkMode ? <Sun size={14} weight="duotone" className="text-amber-500" /> : <Moon size={14} weight="duotone" className="text-slate-600" />}
                        </div>
                        {darkMode ? 'Light Mode' : 'Dark Mode'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Mobile "More" Menu */}
              <div className="sm:hidden relative group">
                <button className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-dark-card transition-all">
                  <List size={18} weight="bold" />
                </button>
                <div className="absolute top-full right-0 mt-2 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-all duration-200 scale-95 group-hover:scale-100 origin-top-right z-50">
                  <div className="bg-white dark:bg-dark-card rounded-2xl shadow-xl border border-slate-100 dark:border-dark-border p-1.5 min-w-[160px]">
                    <button 
                      onClick={() => safeNavigation(() => { clearAll(); setActiveTab(null); })}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl transition-all"
                    >
                      <Plus size={16} weight="bold" className="text-primary" />
                      New Transcription
                    </button>
                    <button 
                      onClick={() => setShowArchiveSidebar(true)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl transition-all"
                    >
                      <Clock size={16} weight="duotone" className="text-slate-400" />
                      Archive
                    </button>
                    <button 
                      onClick={() => setDarkMode(!darkMode)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl transition-all"
                    >
                      {darkMode ? <Sun size={16} /> : <Moon size={16} />}
                      Theme
                    </button>
                    <div className="h-px bg-slate-100 dark:bg-dark-border my-1"></div>
                    {googleAccessToken ? (
                      <button 
                        onClick={handleGoogleLogout}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl transition-all"
                      >
                        <SignOut size={16} />
                        Sign Out (Connected)
                      </button>
                    ) : (
                      <button 
                        onClick={handleGoogleLogin}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl transition-all"
                      >
                        <SignIn size={16} />
                        Sign In
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
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
            googleAccessToken={googleAccessToken}
            onBackgroundTranscribe={handleBackgroundTranscribe}
            onAttachDrive={() => {
                if (!googleAccessToken) { handleGoogleLogin(); return; }
                setPickerCallback(() => (file: AudioFile) => handleBackgroundTranscribe(file));
                setIsPickerOpen(true);
             }}
             onStartUpload={(file) => {
               handleBackgroundTranscribe(file);
             }}
             onOpenInNewTab={onOpenInNewTab}
           />
      </main>
    </div>
  );
};

export default EditorView;
