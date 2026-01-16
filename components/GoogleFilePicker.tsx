import React, { useState, useEffect, useCallback } from 'react';
import { 
  X, MagnifyingGlass, FileAudio, FileVideo, Folder, 
  CaretRight, MagnifyingGlassPlus, Spinner, ArrowLeft,
  Clock, HardDrive, Star, Trash, CaretDown, Check
} from '@phosphor-icons/react';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
  iconLink?: string;
  thumbnailLink?: string;
}

interface GoogleFilePickerProps {
  accessToken: string;
  onSelect: (file: { id: string; name: string; mimeType: string }) => void;
  onClose: () => void;
  isOpen: boolean;
}

const GoogleFilePicker: React.FC<GoogleFilePickerProps> = ({ accessToken, onSelect, onClose, isOpen }) => {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentFolder, setCurrentFolder] = useState<{ id: string; name: string } | null>(null);
  const [folderStack, setFolderStack] = useState<{ id: string; name: string }[]>([]);

  const fetchFiles = useCallback(async (folderId: string = 'root', query: string = '') => {
    setLoading(true);
    try {
      let q = `trashed = false and (mimeType contains 'audio/' or mimeType contains 'video/' or mimeType contains 'mpeg' or mimeType = 'application/vnd.google-apps.folder' or mimeType = 'application/octet-stream')`;
      if (folderId !== 'root' || folderStack.length > 0) {
        q = `'${folderId}' in parents and ${q}`;
      } else {
        q = `'root' in parents and ${q}`;
      }
      
      if (query) {
        q = `name contains '${query}' and trashed = false and (mimeType contains 'audio/' or mimeType contains 'video/' or mimeType = 'application/vnd.google-apps.folder')`;
      }

      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,modifiedTime,size,iconLink,thumbnailLink)&pageSize=100&orderBy=folder,name`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      if (!response.ok) throw new Error('Failed to fetch files');
      const data = await response.json();
      setFiles(data.files || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [accessToken, folderStack.length]);

  useEffect(() => {
    if (isOpen) {
      fetchFiles(currentFolder?.id || 'root', searchQuery);
    }
  }, [isOpen, currentFolder, searchQuery, fetchFiles]);

  const handleFolderClick = (folder: { id: string; name: string }) => {
    setFolderStack(prev => [...prev, folder]);
    setCurrentFolder(folder);
    setSearchQuery('');
  };

  const handleBack = () => {
    const newStack = [...folderStack];
    newStack.pop();
    setFolderStack(newStack);
    setCurrentFolder(newStack.length > 0 ? newStack[newStack.length - 1] : null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white dark:bg-dark-card w-full max-w-4xl h-[80vh] rounded-[2.5rem] shadow-2xl border border-white/20 dark:border-white/5 flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 dark:border-dark-border flex items-center justify-between bg-slate-50/50 dark:bg-dark-bg/30">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary dark:text-accent">
              <HardDrive size={24} weight="duotone" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white leading-tight">Google Drive</h3>
              <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-dark-muted font-medium mt-0.5">
                <span>My Storage</span>
                {folderStack.map((f, i) => (
                  <React.Fragment key={f.id}>
                    <CaretRight size={10} />
                    <span>{f.name}</span>
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-dark-border transition-all"
          >
            <X size={20} weight="bold" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="p-4 px-6 border-b border-slate-100 dark:border-dark-border flex flex-col sm:flex-row gap-4 items-center bg-white/50 dark:bg-dark-card/50">
          <button 
            onClick={handleBack}
            disabled={folderStack.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-slate-600 dark:text-dark-text hover:bg-slate-100 dark:hover:bg-dark-border disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <ArrowLeft size={16} weight="bold" />
            Back
          </button>
          
          <div className="relative flex-1 group">
            <MagnifyingGlass size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors" />
            <input 
              type="text"
              placeholder="Search files and folders..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-2.5 rounded-2xl border border-slate-200 dark:border-dark-border bg-slate-50 dark:bg-dark-bg text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-slate-700 dark:text-white"
            />
          </div>
        </div>

        {/* File List */}
        <div className="flex-1 overflow-y-auto p-4 px-6 custom-scrollbar">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-4">
              <Spinner size={32} weight="bold" className="animate-spin text-primary" />
              <p className="text-sm font-medium animate-pulse">Syncing with Google Drive...</p>
            </div>
          ) : files.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60">
              <div className="w-20 h-20 rounded-[2.5rem] bg-slate-50 dark:bg-dark-bg flex items-center justify-center mb-6">
                <HardDrive size={32} weight="duotone" />
              </div>
              <p className="text-sm font-bold">No supported media files found</p>
              <p className="text-xs mt-1">Upload audio/video files to Drive to see them here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {files.map(file => {
                const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
                const isAudio = file.mimeType.startsWith('audio/');
                
                return (
                  <button 
                    key={file.id}
                    onClick={() => isFolder ? handleFolderClick({ id: file.id, name: file.name }) : onSelect(file)}
                    className="flex items-center gap-4 p-4 rounded-2xl bg-white dark:bg-dark-bg border border-slate-100 dark:border-dark-border hover:border-primary/30 hover:shadow-lg dark:hover:shadow-primary/5 hover:-translate-y-0.5 transition-all text-left group"
                  >
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform ${
                      isFolder ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/20' : 
                      isAudio ? 'bg-primary/10 text-primary dark:text-accent' : 
                      'bg-purple-100 text-purple-600 dark:bg-purple-900/20'
                    }`}>
                      {isFolder ? <Folder size={24} weight="duotone" /> : 
                       isAudio ? <FileAudio size={24} weight="duotone" /> : 
                       <FileVideo size={24} weight="duotone" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-bold text-slate-800 dark:text-white truncate group-hover:text-primary transition-colors">{file.name}</h4>
                      <p className="text-[10px] text-slate-400 dark:text-dark-muted font-medium mt-0.5">
                        {isFolder ? 'Folder' : new Date(file.modifiedTime).toLocaleDateString()}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 dark:border-dark-border bg-slate-50/50 dark:bg-dark-bg/30 flex items-center justify-between">
          <p className="text-xs text-slate-400 dark:text-dark-muted font-medium">
            Showing only supported audio and video formats.
          </p>
          <div className="flex gap-3">
             <button 
               onClick={onClose}
               className="px-6 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-dark-border transition-all"
             >
               Cancel
             </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GoogleFilePicker;
