import React, { useEffect, useRef, useState, lazy, Suspense } from 'react';

import { 
  Lightning, Eye, PencilSimple, Sparkle, Export, CaretDown, CaretUp,
  ArrowSquareOut, Checks, FileText, FileCode, CloudArrowDown, 
  File as FileIcon, Plus, Microphone, UploadSimple, User, PlusCircle,
  Clock, SignOut, Spinner, SignIn, Sun, Moon, List, WarningCircle, Check, GoogleLogo, Copy
} from '@phosphor-icons/react';
import { useTheme } from '../contexts/ThemeContext';

import { AudioSource, TranscriptionState, AudioFile, ArchiveItem } from '../../types';
const TranscriptionEditor = lazy(() => import('../../components/TranscriptionEditor'));


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
  handleSaveToDrive: (type?: 'doc' | 'txt' | 'srt') => void;
  isSavingToDrive: boolean;
  driveSaved: boolean;
  contentType: string | null;
  getAudioUrl: () => string | null;
  getOriginalFile: () => AudioFile | null;
  handleExportDocx: () => void;
  handleExportTxt: () => void;
  handleExportSrt: () => void;
  googleAccessToken: string | null;
  googleClientId: string | undefined;
  driveScriptsLoaded: boolean;
// ... (rest of props)

// ...

  handleGoogleLogin: () => void;
  handleGoogleLogout: () => void;
  isLoggingIn: boolean;
  archiveItems: ArchiveItem[];
  setShowArchiveSidebar: (val: boolean) => void;
  showArchiveSidebar: boolean;
  setActiveTab: (tab: AudioSource | null) => void;

  handleBackgroundTranscribe: (file: AudioFile) => void;
  setPickerCallback: (callback: ((file: AudioFile) => void) | null) => void;
  setIsPickerOpen: (val: boolean) => void;
  isPickerOpen: boolean;
  handlePickDriveFile: (file: { id: string; name: string; mimeType: string }) => void;
  onOpenInNewTab: (content: string, title?: string) => void;
  onNewSession: (source: AudioSource) => void;

  isTabsVisible: boolean;
  setIsTabsVisible: (val: boolean) => void;
}

const EditorView: React.FC<EditorViewProps> = ({
  showExitConfirm, setShowExitConfirm, confirmExit,
  safeNavigation, clearAll,
  isEditorMode, setIsEditorMode,
  showAiSidebar, setShowAiSidebar,
  transcription, setTranscription,
  handleSaveToDrive, isSavingToDrive, driveSaved,
  contentType, getAudioUrl, getOriginalFile,
  handleExportDocx, handleExportTxt, handleExportSrt,
  googleAccessToken, googleClientId, driveScriptsLoaded,
  handleGoogleLogin, handleGoogleLogout, isLoggingIn,
  archiveItems, setShowArchiveSidebar, showArchiveSidebar,
  setActiveTab,
  handleBackgroundTranscribe, setPickerCallback,

  setIsPickerOpen, isPickerOpen, handlePickDriveFile,
  onOpenInNewTab, isTabsVisible, setIsTabsVisible, onNewSession
}) => {
  const { darkMode, setDarkMode } = useTheme();

  // Local state for copy feedback
  const [copiedStatus, setCopiedStatus] = React.useState<'text' | 'plain' | 'html' | null>(null);
  const [liveRecordingTrigger, setLiveRecordingTrigger] = useState(0);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const exitConfirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!showExitConfirm) return;
    exitConfirmRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowExitConfirm(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showExitConfirm, setShowExitConfirm]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const isMeta = event.metaKey || event.ctrlKey;
      if (!isMeta) return;

      if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        handleSaveToDrive('doc');
      }

      if (event.key.toLowerCase() === 'e') {
        event.preventDefault();
        setIsEditorMode(!isEditorMode);
      }
    };

    document.addEventListener('keydown', handleShortcut);
    return () => document.removeEventListener('keydown', handleShortcut);
  }, [handleSaveToDrive, isEditorMode, setIsEditorMode]);


  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const audioFile: AudioFile = {
          file,
          previewUrl: URL.createObjectURL(file),
          base64: null,
          mimeType: file.type
      };
      // For "Add", we likely want to background transcribe/add to sessions? 
      // User said "Add to document". 
      // If we use handleBackgroundTranscribe, it adds to sidebar. That's a safe "Add".
      handleBackgroundTranscribe(audioFile);
    }
  };

  const handleCopyFeedback = (type: 'text' | 'plain' | 'html') => {
    setCopiedStatus(type);
    setTimeout(() => setCopiedStatus(null), 2000);
  };

  return (
    <div className="h-screen bg-slate-50 dark:bg-dark-bg font-sans flex flex-col overflow-hidden transition-colors duration-300">
      
      {/* Exit Confirmation Modal */}
      {showExitConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
           <div
             role="dialog"
             aria-modal="true"
             aria-labelledby="exit-confirm-title"
             aria-describedby="exit-confirm-description"
             className="bg-white dark:bg-dark-card border border-slate-200 dark:border-dark-border w-full max-w-sm rounded-2xl shadow-2xl p-6 relative"
           >
              <div className="w-12 h-12 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-4 text-red-600 dark:text-red-400">
                 <WarningCircle size={24} weight="duotone" />
              </div>
              <h3 id="exit-confirm-title" className="text-xl font-bold text-slate-900 dark:text-white mb-2">Unsaved Changes</h3>
              <p id="exit-confirm-description" className="text-slate-500 dark:text-dark-muted mb-6 leading-relaxed">
                 Are you sure you want to exit? Your transcription and edits will be lost permanently if you leave now.
              </p>
              <div className="flex gap-3">
                 <button 
                   ref={exitConfirmRef}
                   type="button"
                   onClick={() => setShowExitConfirm(false)}
                   className="flex-1 px-4 py-2.5 rounded-xl font-bold text-slate-600 dark:text-dark-text hover:bg-slate-100 dark:hover:bg-dark-border transition-colors"
                 >
                   Cancel
                 </button>
                 <button 
                   type="button"
                   onClick={confirmExit}
                   className="flex-1 px-4 py-2.5 rounded-xl font-bold bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/20 transition-all"
                 >
                   Exit & Discard
                 </button>
              </div>
           </div>
        </div>

      )}

      {/* Hidden File Input */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        className="hidden" 
        accept="audio/*,video/*" 
      />

      {/* Main Bar / Header */}
      <header className="sticky top-0 z-50 bg-white/40 dark:bg-dark-bg/40 backdrop-blur-3xl border-b border-slate-200 dark:border-white/[0.05] transition-all duration-300">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between text-slate-900 dark:text-white">
            {/* Left Group: Branding + Menu Actions */}
            <div className="flex items-center gap-4">
               {/* Branding */}
               <div className="flex items-center gap-3.5 cursor-pointer group" onClick={() => safeNavigation(clearAll)}>
                 <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 group-hover:scale-110 transition-transform duration-500">
                   <Lightning size={20} weight="fill" className="text-white" />
                 </div>
                 <div className="max-w-0 overflow-hidden group-hover:max-w-[200px] transition-all duration-500 ease-out opacity-0 group-hover:opacity-100 whitespace-nowrap">
                   <div className="flex items-center gap-2 pl-2">
                     <span className="text-xl font-black tracking-tight text-slate-900 dark:text-white leading-none">ScribeAI</span>
                     <span className="px-1.5 py-0.5 rounded-md bg-primary/10 dark:bg-accent/20 text-[8px] font-black tracking-tighter text-primary dark:text-accent border border-primary/20 dark:border-accent/20 leading-none">BETA</span>
                   </div>
                 </div>
               </div>

               {/* New Session Button */}
               <div className="relative group/new">
                  <button 
                    className="flex items-center gap-2 px-3.5 py-2 rounded-full border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 hover:border-slate-300 dark:hover:border-white/20 transition-all"
                  >
                    <Plus size={14} weight="bold" className="text-indigo-500 dark:text-indigo-400" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">New</span>
                    <CaretDown size={10} weight="bold" className="ml-0.5 opacity-50 group-hover/new:rotate-180 transition-transform" />
                  </button>
                  {/* Dropdown Content for New (Start Over) */}
                  <div className="absolute top-full left-0 pt-2 opacity-0 group-hover/new:opacity-100 pointer-events-none group-hover/new:pointer-events-auto transition-all duration-200 scale-95 group-hover/new:scale-100 origin-top-left z-50">
                      <div className="bg-white dark:bg-dark-card rounded-2xl shadow-xl border border-slate-200 dark:border-dark-border p-3 min-w-[240px] flex flex-col gap-2">
                          <div className="px-2.5 py-1.5 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-white/5 mb-1">Start New Session</div>
                          
                          {/* Audio Recording */}
                          <button 
                             onClick={() => onNewSession(AudioSource.MICROPHONE)}
                            className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-dark-bg rounded-xl transition-all group"
                          >
                            <div className="w-7 h-7 rounded-lg bg-red-100 dark:bg-red-900/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                              <Microphone size={14} weight="duotone" className="text-red-500" />
                            </div>
                            <div>
                                <div className="leading-none mb-0.5">Audio Recording</div>
                                <div className="text-[9px] text-slate-400 font-medium">Start fresh recording</div>
                            </div>
                          </button>

                          {/* Upload Media */}
                          <button 
                             onClick={() => onNewSession(AudioSource.FILE)}
                            className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-dark-bg rounded-xl transition-all group"
                          >
                            <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                              <UploadSimple size={14} weight="duotone" className="text-blue-500" />
                            </div>
                            <div>
                                <div className="leading-none mb-0.5">Upload Media</div>
                                <div className="text-[9px] text-slate-400 font-medium">Import audio/video file</div>
                            </div>
                          </button>

                          {/* From Link / Drive */}
                          <button 
                             onClick={() => onNewSession(AudioSource.URL)}
                            className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-dark-bg rounded-xl transition-all group"
                          >
                            <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-white/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                              <CloudArrowDown size={14} weight="duotone" className="text-slate-600 dark:text-slate-300" />
                            </div>
                            <div>
                                <div className="leading-none mb-0.5">From Link / Drive</div>
                                <div className="text-[9px] text-slate-400 font-medium">Import from URL or Cloud</div>
                            </div>
                          </button>

                          <div className="h-px bg-slate-100 dark:bg-white/5 my-1"></div>

                          {/* Empty Project */}
                          <button 
                             onClick={() => onNewSession(AudioSource.FILE)}
                            className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-dark-bg rounded-xl transition-all group"
                          >
                            <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-900/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                              <Plus size={14} weight="bold" className="text-indigo-500" />
                            </div>
                            <div>
                                <div className="leading-none mb-0.5">Empty Project</div>
                                <div className="text-[9px] text-slate-400 font-medium">Clear current workspace</div>
                            </div>
                          </button>
                      </div>
                  </div>
               </div>

               {/* Add to Document Button */}
               <div className="relative group/add">
                  <button 
                    className="flex items-center gap-2 px-3.5 py-2 rounded-full border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 hover:border-slate-300 dark:hover:border-white/20 transition-all"
                  >
                    <PlusCircle size={14} weight="bold" className="text-emerald-500 dark:text-emerald-400" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Add</span>
                    <CaretDown size={10} weight="bold" className="ml-0.5 opacity-50 group-hover/add:rotate-180 transition-transform" />
                  </button>
                  
                  {/* Dropdown Content */}
                  <div className="absolute top-full left-0 pt-2 opacity-0 group-hover/add:opacity-100 pointer-events-none group-hover/add:pointer-events-auto transition-all duration-200 scale-95 group-hover/add:scale-100 origin-top-left z-50">
                      <div className="bg-white dark:bg-dark-card rounded-2xl shadow-xl border border-slate-200 dark:border-dark-border p-3 min-w-[220px] flex flex-col gap-2">
                          <div className="px-2.5 py-1.5 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-white/5 mb-1">Add to Document</div>
                          
                          {/* Upload File */}
                          <button 
                             onClick={handleUploadClick}
                            className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-dark-bg rounded-xl transition-all group"
                          >
                            <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                              <UploadSimple size={14} weight="duotone" className="text-blue-500" />
                            </div>
                            <div>
                                <div className="leading-none mb-0.5">Upload File</div>
                                <div className="text-[9px] text-slate-400 font-medium">Add audio/video file</div>
                            </div>
                          </button>

                          {/* Record Voicenote */}
                          <button 
                            onClick={() => setLiveRecordingTrigger(Date.now())}
                            className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-dark-bg rounded-xl transition-all group"
                          >
                            <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                              <Microphone size={14} weight="duotone" className="text-emerald-500" />
                            </div>
                            <div>
                                <div className="flex items-center gap-1.5 leading-none mb-0.5">
                                    <span>Record Voicenote</span>
                                    <span className="px-1 py-0.5 rounded bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[8px] font-black uppercase">EXP</span>
                                </div>
                                <div className="text-[9px] text-slate-400 font-medium">Append real-time text</div>
                            </div>
                          </button>

                          {/* Google Drive */}
                          <button 
                             onClick={() => setIsPickerOpen(true)}
                             className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-dark-bg rounded-xl transition-all group"
                           >
                             <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-white/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                               <GoogleLogo size={14} weight="bold" className="text-slate-600 dark:text-slate-300" />
                             </div>
                             <div>
                                <div className="leading-none mb-0.5">Google Drive</div>
                                <div className="text-[9px] text-slate-400 font-medium">Import from Cloud</div>
                             </div>
                           </button>
                      </div>
                  </div>
               </div>

                {/* Save & Export Dropdown */}
               <div className="relative group/export">
                   <button className="flex items-center gap-2 px-3.5 py-2 rounded-full border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 hover:border-slate-300 dark:hover:border-white/20 transition-all">
                     <Export size={14} weight="duotone" className="text-slate-500 dark:text-slate-400" />
                     <span className="text-[10px] font-bold uppercase tracking-widest">Save & Export</span>
                     <CaretDown size={10} weight="bold" className="ml-0.5 opacity-50 group-hover/export:rotate-180 transition-transform" />
                   </button>
                   <div className="absolute top-full right-0 text-left pt-2 opacity-0 group-hover/export:opacity-100 pointer-events-none group-hover/export:pointer-events-auto transition-all duration-200 scale-95 group-hover/export:scale-100 origin-top-right z-50">
                       <div className="bg-white dark:bg-dark-card rounded-2xl shadow-xl border border-slate-100 dark:border-dark-border p-3 min-w-[240px] flex flex-col gap-3">
                           
                           {/* 1. Save to Google Drive */}
                           <div>
                             <div className="px-2 py-1 text-[9px] font-black text-slate-400 dark:text-dark-muted uppercase tracking-widest flex items-center gap-2">
                               <GoogleLogo size={12} weight="bold" />
                               Save to Google Drive
                             </div>
                             <div className="flex flex-col gap-1 mt-1">
                               <button onClick={() => handleSaveToDrive('doc')} className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                                 <span>As Document (Doc)</span>
                                 <FileText size={12} weight="duotone" className="text-blue-500" />
                               </button>
                               <button onClick={() => handleSaveToDrive('txt')} className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                                 <span>As Text File (Txt)</span>
                                 <FileText size={12} weight="duotone" className="text-slate-500" />
                               </button>
                               <button onClick={() => handleSaveToDrive('srt')} className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                                 <span>As Subtitles (Srt)</span>
                                 <FileCode size={12} weight="duotone" className="text-amber-500" />
                               </button>
                             </div>
                           </div>

                           <div className="h-px bg-slate-100 dark:bg-dark-border"></div>

                           {/* 2. Save to Local */}
                           <div>
                             <div className="px-2 py-1 text-[9px] font-black text-slate-400 dark:text-dark-muted uppercase tracking-widest flex items-center gap-2">
                               <CloudArrowDown size={12} weight="bold" />
                               Save to Local
                             </div>
                             <div className="flex flex-col gap-1 mt-1">
                               <button onClick={handleExportDocx} className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                                 <span>As Document (Docx)</span>
                                 <FileText size={12} weight="duotone" className="text-blue-500" />
                               </button>
                               <button onClick={handleExportTxt} className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                                 <span>As Text File (Txt)</span>
                                 <FileText size={12} weight="duotone" className="text-slate-500" />
                               </button>
                               <button onClick={handleExportSrt} className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                                 <span>As Subtitles (Srt)</span>
                                 <FileCode size={12} weight="duotone" className="text-amber-500" />
                               </button>
                             </div>
                           </div>

                           <div className="h-px bg-slate-100 dark:bg-dark-border"></div>

                           {/* 3. Copy As */}
                           <div>
                             <div className="px-2 py-1 text-[9px] font-black text-slate-400 dark:text-dark-muted uppercase tracking-widest flex items-center gap-2">
                               <Copy size={12} weight="bold" />
                               Copy As
                             </div>
                             <div className="flex flex-col gap-1 mt-1">
                               <button 
                                 onClick={() => {
                                   const clean = (transcription.text || '')
                                      .replace(/\[\d{1,2}:\d{2}(?::\d{2})?\]/g, '')
                                      .replace(/^(.*?):/gm, '')
                                      .replace(/\*\*/g, '').replace(/\*/g, '')
                                      .replace(/__/g, '').replace(/_/g, '') // Remove underscores
                                      .replace(/~~/g, '') // Remove strikethrough
                                      .replace(/\s+/g, ' ') // Normalize spaces
                                      .trim();
                                   navigator.clipboard.writeText(clean);
                                   handleCopyFeedback('plain');
                                 }}
                                 className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                               >
                                 <span>Raw Text</span>
                                 {copiedStatus === 'plain' ? <Check size={12} className="text-emerald-500" /> : <FileText size={12} className="opacity-50" />}
                               </button>
                               <button 
                                 onClick={() => {
                                    // Hacky way to copy HTML/Document formatted text to clipboard
                                    const blob = new Blob([transcription.text || ''], { type: 'text/html' });
                                    const item = new ClipboardItem({ "text/plain": new Blob([transcription.text || ''], { type: 'text/plain' }) });
                                    navigator.clipboard.writeText(transcription.text || ''); 
                                    handleCopyFeedback('text');
                                 }} 
                                 className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                               >
                                 <span>As in Document</span>
                                 {copiedStatus === 'text' ? <Check size={12} className="text-emerald-500" /> : <Checks size={12} className="opacity-50" />}
                               </button>
                             </div>
                           </div>

                           <div className="h-px bg-slate-100 dark:bg-dark-border"></div>

                           {/* 4. Export To */}
                           <div>
                              <div className="px-2 py-1 text-[9px] font-black text-slate-400 dark:text-dark-muted uppercase tracking-widest flex items-center gap-2">
                                 <Export size={12} weight="bold" />
                                 Export To
                              </div>
                              <button 
                                onClick={() => window.print()}
                                className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors mt-1"
                              >
                                <span>PDF (Print to PDF)</span>
                                <FileText size={12} weight="duotone" className="text-red-500" />
                              </button>
                           </div>
                       </div>
                   </div>
               </div>
                {/* Smart Editor Trigger */}
                <button 
                    onClick={() => setShowAiSidebar(!showAiSidebar)}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border transition-all ${showAiSidebar 
                      ? 'bg-primary/5 border-primary/20 text-primary dark:text-accent' 
                      : 'bg-slate-100 dark:bg-dark-card border-slate-200 dark:border-white/5 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-white/5 hover:shadow-md'}`}
                  >
                    <Sparkle size={16} weight="duotone" className={showAiSidebar ? "text-primary dark:text-accent" : "text-slate-500 dark:text-slate-400"}/>
                     <span className="text-[11px] font-bold uppercase tracking-wider">Smart Editor</span>
                   </button>
 
                   {/* Sessions Button */}
                   <button 
                     onClick={() => setShowArchiveSidebar(!showArchiveSidebar)}
                     className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border transition-all ${showArchiveSidebar 
                       ? 'bg-primary/5 border-primary/20 text-primary dark:text-accent' 
                       : 'bg-slate-100 dark:bg-dark-card border-slate-200 dark:border-white/5 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-white/5 hover:shadow-md'}`}
                   >
                     <Clock size={16} weight="duotone" className={showArchiveSidebar ? "text-primary dark:text-accent" : "text-slate-500 dark:text-slate-400"}/>
                     <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-bold uppercase tracking-wider">Sessions</span>
                        {archiveItems.length > 0 && (
                            <div className={`w-1.5 h-1.5 rounded-full ${showArchiveSidebar ? 'bg-primary dark:bg-accent' : 'bg-primary'} animate-pulse`}></div>
                        )}
                     </div>
                   </button>
             </div>

            {/* Right Group: Mode Switcher & User Menu */}
            <div className="hidden sm:flex items-center gap-4">
                {/* Mode Toggle Switcher */}
                <div className="flex bg-slate-100 dark:bg-dark-bg p-1 rounded-2xl border border-slate-100 dark:border-white/5">
                  <button 
                    onClick={() => setIsEditorMode(false)}
                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-[10px] font-bold transition-all ${!isEditorMode ? 'bg-white dark:bg-dark-card text-primary dark:text-accent shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
                  >
                    <Eye size={12} weight="duotone" />
                    <span>Read</span>
                  </button>
                  <button 
                    onClick={() => setIsEditorMode(true)}
                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-[10px] font-bold transition-all ${isEditorMode ? 'bg-white dark:bg-dark-card text-primary dark:text-accent shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
                  >
                    <PencilSimple size={12} weight="duotone" />
                    <span>Edit</span>
                  </button>
                </div>

                <div className="w-px h-5 bg-slate-200 dark:bg-dark-border mx-1"></div>

                {/* User Menu */}


                <div className="relative group/user">
                  <button className="flex items-center gap-2 px-1 focus:outline-none">
                    <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/10 border border-slate-200 dark:border-white/5 flex items-center justify-center text-slate-500 dark:text-slate-300">
                      <User size={16} weight="duotone" />
                    </div>
                  </button>
                  
                  {/* User Menu Dropdown */}
                  <div className="absolute top-full right-0 pt-2 opacity-0 group-hover/user:opacity-100 pointer-events-none group-hover/user:pointer-events-auto transition-all duration-200 scale-95 group-hover/user:scale-100 origin-top-right z-50">
                    <div className="bg-white dark:bg-dark-card rounded-2xl shadow-xl border border-slate-100 dark:border-dark-border p-2 min-w-[220px]">
                      
                      <div className="px-2.5 py-1.5 text-[9px] font-black text-slate-400 dark:text-dark-muted uppercase tracking-widest">Account & Settings</div>

                      {driveScriptsLoaded && (
                        googleAccessToken ? (
                          <button 
                            onClick={handleGoogleLogout}
                            className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-dark-bg rounded-xl transition-all group"
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
                <div className="absolute top-full right-0 pt-2 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-all duration-200 scale-95 group-hover:scale-100 origin-top-right z-50">
                  <div className="bg-white dark:bg-dark-card rounded-2xl shadow-xl border border-slate-100 dark:border-dark-border p-1.5 min-w-[160px]">
                    <button 
                      onClick={() => onNewSession(null as any)} // Will effectively reset
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
                      Sessions
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
      </header>

      {/* Main Editor Area - Google Docs Style */}
      <main className="flex-1 w-full z-10 overflow-hidden flex flex-col h-full bg-slate-100 dark:bg-dark-bg">
         <Suspense fallback={<div className="flex-1 flex items-center justify-center py-12"><Spinner size={28} className="animate-spin text-primary" /></div>}>
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
            onStartRecording={() => onNewSession(AudioSource.MICROPHONE)}
            onUploadClick={() => onNewSession(AudioSource.FILE)}
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
             liveRecordingTrigger={liveRecordingTrigger}
           />
         </Suspense>
      </main>

    </div>
  );
};

export default EditorView;
