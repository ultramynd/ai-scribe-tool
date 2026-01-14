import React from 'react';
import { 
  X, Clock, CheckCircle, WarningCircle, Spinner, 
  FileText, Trash, ArrowLineUpRight, HardDrive, 
  DotsThreeVertical, FileAudio, FileVideo, Plus
} from '@phosphor-icons/react';
import { ArchiveItem } from '../types';

interface ArchiveSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  items: ArchiveItem[];
  onSelectItem: (item: ArchiveItem) => void;
  onDeleteItem: (id: string) => void;
  onUploadFile?: (file: File) => void;
}

const ArchiveSidebar: React.FC<ArchiveSidebarProps> = ({ isOpen, onClose, items, onSelectItem, onDeleteItem, onUploadFile }) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onUploadFile) {
      onUploadFile(file);
    }
  };
  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-[60] bg-slate-900/20 backdrop-blur-sm transition-opacity duration-500"
          onClick={onClose}
        />
      )}

      {/* Sidebar Content */}
      <div className={`fixed top-0 right-0 h-screen z-[70] transition-all duration-500 ease-in-out transform ${
        isOpen ? 'translate-x-0 w-full sm:w-[400px]' : 'translate-x-full w-0'
      }`}>
        <div className="h-full bg-white dark:bg-dark-card border-l border-slate-200 dark:border-dark-border shadow-2xl flex flex-col overflow-hidden">
          
          {/* Header */}
          <div className="p-6 border-b border-slate-100 dark:border-dark-border flex items-center justify-between bg-slate-50/50 dark:bg-dark-bg/30">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary dark:text-accent">
                <Clock size={20} weight="duotone" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">Transcription Archive</h3>
                <p className="text-[10px] text-slate-400 dark:text-dark-muted font-bold uppercase tracking-widest mt-0.5">History & Queued Tasks</p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-dark-border transition-all"
            >
              <X size={18} weight="bold" />
            </button>
          </div>

          {/* Action Bar */}
          <div className="px-6 py-4 bg-slate-50/80 dark:bg-dark-bg/50 border-b border-slate-100 dark:border-dark-border">
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              className="hidden" 
              accept="audio/*,video/*"
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2.5 py-3 px-4 bg-primary text-white rounded-2xl font-bold text-xs shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all active:scale-95"
            >
              <Plus size={18} weight="bold" />
              <span>Import New Media</span>
            </button>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            {items.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60 text-center px-8">
                <div className="w-16 h-16 rounded-[2rem] bg-slate-50 dark:bg-dark-bg flex items-center justify-center mb-6">
                  <FileText size={28} weight="duotone" />
                </div>
                <p className="text-sm font-bold">Your archive is empty</p>
                <p className="text-xs mt-2">Any transcription you start will automatically be saved here for later access.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((item) => (
                  <div 
                    key={item.id}
                    className="group relative bg-white dark:bg-dark-bg border border-slate-100 dark:border-dark-border rounded-2xl p-4 hover:border-primary/30 dark:hover:border-primary/30 transition-all hover:shadow-lg dark:hover:shadow-primary/5"
                  >
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                        item.status === 'loading' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/20' : 
                        item.status === 'error' ? 'bg-red-100 text-red-600 dark:bg-red-900/20' : 
                        'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/20'
                      }`}>
                        {item.status === 'loading' ? <Spinner size={24} weight="bold" className="animate-spin" /> : 
                         item.status === 'error' ? <WarningCircle size={24} weight="duotone" /> : 
                         <CheckCircle size={24} weight="duotone" />}
                      </div>
                      
                      <div className="flex-1 min-w-0 pr-8" onClick={() => item.status === 'complete' && onSelectItem(item)}>
                        <h4 className="text-sm font-bold text-slate-800 dark:text-white truncate cursor-pointer hover:text-primary transition-colors">
                          {item.name}
                        </h4>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[10px] text-slate-400 dark:text-dark-muted font-medium">{item.date}</span>
                          {item.status === 'loading' && (
                            <span className="text-[9px] font-black uppercase tracking-tighter text-amber-500 animate-pulse">Transcribing...</span>
                          )}
                        </div>
                        
                        {item.status === 'loading' && (
                           <div className="mt-3 w-full h-1 bg-slate-100 dark:bg-dark-border rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-amber-500 transition-all duration-500 ease-out"
                                style={{ width: `${item.progress}%` }}
                              />
                           </div>
                        )}
                      </div>

                      {/* Delete Button */}
                      <button 
                        onClick={() => onDeleteItem(item.id)}
                        className="absolute top-4 right-4 p-2 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-all"
                        title="Remove from archive"
                      >
                        <Trash size={16} weight="duotone" />
                      </button>
                    </div>

                    {item.status === 'complete' && (
                      <button 
                        onClick={() => onSelectItem(item)}
                        className="mt-4 w-full py-2 bg-slate-50 dark:bg-dark-border/50 text-slate-600 dark:text-dark-text text-[10px] font-bold uppercase tracking-widest rounded-xl hover:bg-primary hover:text-white transition-all flex items-center justify-center gap-2"
                      >
                        <ArrowLineUpRight size={14} weight="bold" />
                        Open Session
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer Info */}
          <div className="p-6 border-t border-slate-100 dark:border-dark-border bg-slate-50/50 dark:bg-dark-bg/30">
            <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-dark-muted">
              <HardDrive size={14} weight="duotone" />
              <span>History is stored locally in your browser.</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default ArchiveSidebar;
